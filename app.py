from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import json

app = Flask(__name__)
CORS(app)

# ------------------------
# Load JSON data ONCE
# ------------------------
with open("all_data_combined.json", "r") as f:
    ALL_DATA = json.load(f)

# ------------------------
# Helper functions
# ------------------------
def parse_time_range(time_str):
    if not time_str or "-" not in time_str:
        return None

    def convert(t):
        time, ampm = t.strip().split(" ")
        h, m = map(int, time.split(":"))

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
    if not set(a["days"]).intersection(set(b["days"])):
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


def generate_schedules(courses):
    MAX_RESULTS = 300
    results = []

    combos_per_course = [build_course_combos(c) for c in courses]

    sorted_courses = sorted(enumerate(combos_per_course), key=lambda x: len(x[1]))

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
# ROUTES
# ------------------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/courses", methods=["GET"])
def get_courses():
    return jsonify([
        {
            "id": c["id"],
            "subject": c["subject"],
            "course_number": c["course_number"],
            "course_title": c["course_title"],
            "credits": c.get("credits", 0)
        }
        for c in ALL_DATA
    ])


@app.route("/generate-schedules", methods=["POST"])
def generate():
    data = request.json
    cart_ids = set(data.get("cart", []))

    courses = []

    for c in ALL_DATA:
        if c["id"] not in cart_ids:
            continue

        course = {
            "id": c["id"],
            "subject": c["subject"],
            "course_number": c["course_number"],
            "course_title": c["course_title"],
            "components": {}
        }

        for sec in c["sections"]:
            t = sec["type"]
            course["components"].setdefault(t, []).append(sec)

        courses.append(course)

    schedules = generate_schedules(courses)

    return jsonify({
        "count": len(schedules),
        "schedules": schedules[:300]
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)