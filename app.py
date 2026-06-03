from flask import Flask, request, jsonify, render_template
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ------------------------
# Load course data
# ------------------------
import json
import psycopg2

import os
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# ------------------------
# Helper functions
# ------------------------

def parse_time_range(time_str):
    if not time_str or "-" not in time_str:
        return None

    def convert(t):
        time, ampm = t.strip().split(" ")
        h, m = time.split(":")
        h = int(h)
        m = int(m)

        if ampm.lower() == "pm" and h != 12:
            h += 12
        if ampm.lower() == "am" and h == 12:
            h = 0

        return h + m / 60

    start_str, end_str = time_str.split("-")
    return {
        "start": convert(start_str),
        "end": convert(end_str)
    }


def has_conflict(a, b):
    days_a = set(a["days"])
    days_b = set(b["days"])

    if not days_a.intersection(days_b):
        return False

    return a["start"] < b["end"] and a["end"] > b["start"]


def build_course_combos(course):
    result = []
    types = list(course["components"].keys())

    def backtrack(i, current):
        if i == len(types):
            result.append(current[:])
            return

        t = types[i]
        sections = course["components"][t]

        for sec in sections:
            parsed = parse_time_range(sec["time"])
            if not parsed:
                continue

            current.append({
                "type": t,
                "crn": sec["crn"],
                "section": sec["section"],
                "days": sec["days"],
                "start": parsed["start"],
                "end": parsed["end"],
                "subject": course["subject"],
                "course_number": course["course_number"]
            })

            backtrack(i + 1, current)
            current.pop()

    backtrack(0, [])
    return result


# ------------------------
# Schedule generator
# ------------------------
def generate_schedules(cart):
    MAX_RESULTS = 300
    results = []

    combos_per_course = [build_course_combos(c) for c in cart]

    sorted_courses = sorted(
        enumerate(combos_per_course),
        key=lambda x: len(x[1])
    )

    current = []

    def backtrack(index):
        if len(results) >= MAX_RESULTS:
            return

        if index == len(sorted_courses):
            results.append(current[:])
            return

        _, combos = sorted_courses[index]

        for combo in combos:
            conflict = False

            for new_class in combo:
                for existing in current:
                    if has_conflict(new_class, existing):
                        conflict = True
                        break
                if conflict:
                    break

            if not conflict:
                current.extend(combo)
                backtrack(index + 1)
                for _ in combo:
                    current.pop()

    backtrack(0)
    return results


# ------------------------
# API ROUTES
# ------------------------

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/courses", methods=["GET"])
def get_courses():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT id, subject, course_number, course_title, credits
        FROM courses
    """)

    rows = cur.fetchall()

    result = []
    for r in rows:
        result.append({
            "id": r[0],
            "subject": r[1],
            "course_number": r[2],
            "course_title": r[3],
            "credits": r[4]
        })

    cur.close()
    conn.close()

    return jsonify(result)


@app.route("/generate-schedules", methods=["POST"])
def generate():
    conn = get_db_connection()
    cur = conn.cursor()

    data = request.json
    cart_ids = data.get("cart", [])  # frontend sends course IDs now

    courses = []

    # ------------------------
    # STEP 1: Load full course data from DB
    # ------------------------
    for course_id in cart_ids:
        cur.execute("""
            SELECT id, subject, course_number, course_title
            FROM courses
            WHERE id = %s
        """, (course_id,))

        course_row = cur.fetchone()
        if not course_row:
            continue

        course = {
            "id": course_row[0],
            "subject": course_row[1],
            "course_number": course_row[2],
            "course_title": course_row[3],
            "components": {}
        }

        # ------------------------
        # STEP 2: Load sections for each course
        # ------------------------
        cur.execute("""
            SELECT type, crn, section, days, time, instructor, method
            FROM sections
            WHERE course_id = %s
        """, (course_id,))

        sections = cur.fetchall()

        for sec in sections:
            t = sec[0]
            if t not in course["components"]:
                course["components"][t] = []

            course["components"][t].append({
                "type": sec[0],
                "crn": sec[1],
                "section": sec[2],
                "days": sec[3],
                "time": sec[4],
                "instructor": sec[5],
                "method": sec[6]
            })

        courses.append(course)

    cur.close()
    conn.close()

    # ------------------------
    # STEP 3: Run your existing schedule generator
    # ------------------------
    schedules = generate_schedules(courses)

    return jsonify({
        "count": len(schedules),
        "schedules": schedules[:300]
    })

@app.route("/sections/<int:course_id>")
def get_sections(course_id):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT type, crn, section, days, time, instructor, method
        FROM sections
        WHERE course_id = %s
    """, (course_id,))

    rows = cur.fetchall()

    result = []
    for r in rows:
        result.append({
            "type": r[0],
            "crn": r[1],
            "section": r[2],
            "days": r[3],
            "time": r[4],
            "instructor": r[5],
            "method": r[6]
        })

    cur.close()
    conn.close()

    return jsonify(result)


# ------------------------
# Run server
# ------------------------
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)