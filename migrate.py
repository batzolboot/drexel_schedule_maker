import json
import psycopg2

# ------------------------
# Load JSON
# ------------------------
with open("all_data_combined.json", "r") as f:
    courses = json.load(f)

# ------------------------
# Connect DB
# ------------------------
conn = psycopg2.connect(
    dbname="schedule_db",
    user="batzolboo",
    password="",   # leave blank if local default
    host="localhost"
)

cur = conn.cursor()

# ------------------------
# RESET TABLES (important for re-run safety)
# ------------------------
cur.execute("DELETE FROM sections;")
cur.execute("DELETE FROM courses;")

# ------------------------
# Insert data
# ------------------------
for course in courses:
    cur.execute("""
        INSERT INTO courses (subject, course_number, course_title, credits)
        VALUES (%s, %s, %s, %s)
        RETURNING id;
    """, (
        course["subject"],
        course["course_number"],
        course["course_title"],
        course.get("credits", "")
    ))

    course_id = cur.fetchone()[0]

    # Insert sections
    for comp_type, sections in course["components"].items():
        for sec in sections:
            cur.execute("""
                INSERT INTO sections (
                    course_id, type, crn, section, days, time, instructor, method
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
            """, (
                course_id,
                comp_type,
                int(sec["crn"]) if sec.get("crn") not in [None, ""] else None,
                sec.get("section") or None,
                sec.get("days") or None,
                sec.get("time") or None,
                sec.get("instructor") or None,
                sec.get("method") or None
            ))

conn.commit()
cur.close()
conn.close()

print("✅ JSON successfully migrated to PostgreSQL!")