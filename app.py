from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

# ------------------------
# Load JSON safely (Render-friendly)
# ------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JSON_PATH = os.path.join(BASE_DIR, "all_data_combined.json")

with open(JSON_PATH, "r", encoding="utf-8") as f:
    ALL_DATA = json.load(f)


# ------------------------
# TIME PARSER
# ------------------------
def parse_time_range(time_str):
    if not time_str or "-" not in time_str:
        return None

    def convert(t):
        t = t.strip().lower()
        time_part, ampm = t.split(" ")
        h, m = map(int, time_part.split(":"))

        if ampm == "pm" and h != 12:
            h += 12
        if ampm == "am" and h == 12:
            h = 0

        return h + m / 60

    start, end = time_str.split("-")
    return {"start": convert(start), "end": convert(end)}


# ------------------------
# CONFLICT CHECK
# ------------------------
def has_conflict(a, b):
    if not set(a["days"]).intersection(set(b["days"])):
        return False
    return a["start"] < b["end"] and a["end"] > b["start"]


# ------------------------
# BUILD COMBOS
# ------------------------
def build_course_combos(course):
    result = []
    components = course.get("components", {})

    types = [t for t in components if components[t]]

    def backtrack(i, current):
        if i == len(types):
            result.append(current[:])
            return

        t = types[i]

        for sec in components[t]:
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
# SCHEDULE GENERATOR
# ------------------------
def generate_schedules(courses):
    MAX = 300
    results = []

    combos = [build_course_combos(c) for c in courses]
    sorted_courses = sorted(enumerate(combos), key=lambda x: len(x[1]))

    current = []

    def backtrack(i):
        if len(results) >= MAX:
            return

        if i == len(sorted_courses):
            results.append(current[:])
            return

        _, course_combos = sorted_courses[i]

        for combo in course_combos:
            conflict = False

            for new in combo:
                for existing in current:
                    if has_conflict(new, existing):
                        conflict = True
                        break
                if conflict:
                    break

            if not conflict:
                current.extend(combo)
                backtrack(i + 1)
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


@app.route("/courses")
def courses():
    return jsonify([
        {
            "id": i,
            "subject": c["subject"],
            "course_number": c["course_number"],
            "course_title": c["course_title"],
            "components": c["components"]
        }
        for i, c in enumerate(ALL_DATA)
    ])


@app.route("/generate-schedules", methods=["POST"])
def generate():
    data = request.json
    cart_ids = data.get("cart", [])

    courses = [ALL_DATA[i] for i in cart_ids if i < len(ALL_DATA)]

    schedules = generate_schedules(courses)

    return jsonify({
        "count": len(schedules),
        "schedules": schedules[:300]
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
