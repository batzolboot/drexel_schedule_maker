import json
import psycopg2
from psycopg2.extras import execute_values

# ------------------------
# Load JSON
# ------------------------
with open("all_data_combined.json", "r") as f:
    courses = json.load(f)

print(f"Loaded {len(courses)} courses")

# ------------------------
# Connect DB
# ------------------------
conn = psycopg2.connect(
    "postgresql://schedule_db_8o1w_user:iGkyvPYKPNGRc4YuWBa9H2IomnWHXLn9@dpg-d8fmpc8k1i2s73b1nfh0-a.oregon-postgres.render.com/schedule_db_8o1w",
    sslmode="require"
)

cur = conn.cursor()

# ------------------------
# CREATE TABLES
# ------------------------
cur.execute("""
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    subject TEXT,
    course_number TEXT,
    course_title TEXT,
    credits TEXT
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS sections (
    id SERIAL PRIMARY KEY,
    course_id INT REFERENCES courses(id),
    type TEXT,
    crn INT,
    section TEXT,
    days TEXT,
    time TEXT,
    instructor TEXT,
    method TEXT
);
""")

conn.commit()

# ------------------------
# OPTIONAL RESET (UNCOMMENT IF NEEDED)
# ------------------------
# cur.execute("DELETE FROM sections;")
# cur.execute("DELETE FROM courses;")
# conn.commit()

# ------------------------
# BULK INSERT STORAGE
# ------------------------
course_rows = []
section_rows = []

# ------------------------
# PREP DATA
# ------------------------
for course in courses:
    course_rows.append((
        course["subject"],
        course["course_number"],
        course["course_title"],
        course.get("credits", "")
    ))

# Insert courses first (bulk)
execute_values(
    cur,
    """
    INSERT INTO courses (subject, course_number, course_title, credits)
    VALUES %s
    RETURNING id, subject, course_number
    """,
    course_rows
)

course_ids = cur.fetchall()
conn.commit()

# Map (subject+number) → id
course_map = {
    (s, n): cid for cid, s, n in course_ids
}

# ------------------------
# Build sections list
# ------------------------
for course in courses:
    key = (course["subject"], course["course_number"])
    course_id = course_map.get(key)

    if not course_id:
        continue

    for comp_type, sections in course.get("components", {}).items():
        for sec in sections:
            section_rows.append((
                course_id,
                comp_type,
                int(sec["crn"]) if sec.get("crn") not in [None, ""] else None,
                sec.get("section"),
                sec.get("days"),
                sec.get("time"),
                sec.get("instructor"),
                sec.get("method")
            ))

# ------------------------
# BULK INSERT SECTIONS
# ------------------------
execute_values(
    cur,
    """
    INSERT INTO sections (
        course_id, type, crn, section, days, time, instructor, method
    )
    VALUES %s
    """,
    section_rows
)

conn.commit()
cur.close()
conn.close()

print("✅ FAST MIGRATION COMPLETE")