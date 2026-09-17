"""
Study Planner - Flask backend.

Route groups:
  /api/subjects, /api/exams, /api/tasks   - CRUD for core data
  /api/profile                            - availability + weak/completed topics
  /api/schedule                           - generated study schedule
  /api/dashboard, /api/progress           - aggregated views for the UI
  /api/ai/*                               - AI-powered features (graceful
                                             degradation if no API key set)
"""
import os
import json
from datetime import date, datetime

from flask import Flask, jsonify, request, send_from_directory
from dotenv import load_dotenv

load_dotenv()

import database
import scheduler
import ai_service

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class ValidationError(Exception):
    def __init__(self, message):
        self.message = message


@app.errorhandler(ValidationError)
def handle_validation_error(e):
    return jsonify({"error": e.message}), 400


@app.errorhandler(ai_service.AIUnavailableError)
def handle_ai_unavailable(e):
    return jsonify({"error": str(e), "ai_unavailable": True}), 503


@app.errorhandler(404)
def handle_404(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(FRONTEND_DIR, "index.html")


def row_to_dict(row):
    return dict(row) if row else None


def parse_date(value, field_name="date"):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{field_name}' must be a valid date in YYYY-MM-DD format")


def require_fields(data, fields):
    missing = [f for f in fields if not str(data.get(f, "")).strip()]
    if missing:
        raise ValidationError(f"Missing required field(s): {', '.join(missing)}")


def clamp_int(value, lo, hi, default, field_name):
    if value is None:
        return default
    try:
        value = int(value)
    except (TypeError, ValueError):
        raise ValidationError(f"'{field_name}' must be a whole number")
    if value < lo or value > hi:
        raise ValidationError(f"'{field_name}' must be between {lo} and {hi}")
    return value


# ---------------------------------------------------------------------------
# Subjects
# ---------------------------------------------------------------------------

@app.get("/api/subjects")
def list_subjects():
    with database.get_connection() as conn:
        rows = conn.execute("SELECT * FROM subjects ORDER BY name").fetchall()
        return jsonify([dict(r) for r in rows])


@app.post("/api/subjects")
def create_subject():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["name"])
    name = data["name"].strip()[:100]
    color = data.get("color", "#2E7D6B")
    with database.get_connection() as conn:
        existing = conn.execute("SELECT id FROM subjects WHERE name = ?", (name,)).fetchone()
        if existing:
            raise ValidationError(f"A subject named '{name}' already exists")
        cur = conn.execute(
            "INSERT INTO subjects (name, color) VALUES (?, ?)", (name, color)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM subjects WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(dict(row)), 201


@app.delete("/api/subjects/<int:subject_id>")
def delete_subject(subject_id):
    with database.get_connection() as conn:
        conn.execute("DELETE FROM subjects WHERE id = ?", (subject_id,))
        conn.commit()
        return "", 204


# ---------------------------------------------------------------------------
# Exams
# ---------------------------------------------------------------------------

@app.get("/api/exams")
def list_exams():
    with database.get_connection() as conn:
        rows = conn.execute(
            """SELECT exams.*, subjects.name AS subject_name, subjects.color AS subject_color
               FROM exams JOIN subjects ON subjects.id = exams.subject_id
               ORDER BY exam_date"""
        ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            d["topics"] = json.loads(d["topics"])
            result.append(d)
        return jsonify(result)


@app.post("/api/exams")
def create_exam():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["title", "subject_id", "exam_date"])
    parse_date(data["exam_date"], "exam_date")
    topics = data.get("topics", [])
    if not isinstance(topics, list):
        raise ValidationError("'topics' must be a list of strings")
    with database.get_connection() as conn:
        subject = conn.execute(
            "SELECT id FROM subjects WHERE id = ?", (data["subject_id"],)
        ).fetchone()
        if not subject:
            raise ValidationError("Unknown subject_id")
        cur = conn.execute(
            "INSERT INTO exams (subject_id, title, exam_date, topics, notes) VALUES (?, ?, ?, ?, ?)",
            (
                data["subject_id"],
                data["title"].strip()[:200],
                data["exam_date"],
                json.dumps([str(t)[:100] for t in topics]),
                data.get("notes", "")[:1000],
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM exams WHERE id = ?", (cur.lastrowid,)).fetchone()
        d = dict(row)
        d["topics"] = json.loads(d["topics"])
        return jsonify(d), 201


@app.delete("/api/exams/<int:exam_id>")
def delete_exam(exam_id):
    with database.get_connection() as conn:
        conn.execute("DELETE FROM exams WHERE id = ?", (exam_id,))
        conn.commit()
        return "", 204


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------

def _task_query(where="", params=()):
    sql = """SELECT tasks.*, subjects.name AS subject_name, subjects.color AS subject_color
              FROM tasks JOIN subjects ON subjects.id = tasks.subject_id"""
    if where:
        sql += " WHERE " + where
    sql += " ORDER BY deadline"
    with database.get_connection() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    if status:
        return jsonify(_task_query("tasks.status = ?", (status,)))
    return jsonify(_task_query())


@app.post("/api/tasks")
def create_task():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["title", "subject_id", "deadline"])
    parse_date(data["deadline"], "deadline")
    priority = clamp_int(data.get("priority"), 1, 5, 3, "priority")
    difficulty = clamp_int(data.get("difficulty"), 1, 5, 3, "difficulty")
    estimated_minutes = clamp_int(data.get("estimated_minutes"), 5, 1000, 60, "estimated_minutes")

    with database.get_connection() as conn:
        subject = conn.execute(
            "SELECT id FROM subjects WHERE id = ?", (data["subject_id"],)
        ).fetchone()
        if not subject:
            raise ValidationError("Unknown subject_id")
        exam_id = data.get("exam_id") or None
        cur = conn.execute(
            """INSERT INTO tasks
               (subject_id, exam_id, title, topic, description, deadline, priority, difficulty, estimated_minutes, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data["subject_id"],
                exam_id,
                data["title"].strip()[:200],
                data.get("topic", "")[:100],
                data.get("description", "")[:1000],
                data["deadline"],
                priority,
                difficulty,
                estimated_minutes,
                data.get("source", "manual"),
            ),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
        return jsonify(dict(row)), 201


@app.put("/api/tasks/<int:task_id>")
def update_task(task_id):
    data = request.get_json(force=True, silent=True) or {}
    with database.get_connection() as conn:
        existing = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if not existing:
            return jsonify({"error": "Task not found"}), 404

        fields = {}
        if "title" in data:
            fields["title"] = str(data["title"]).strip()[:200]
        if "topic" in data:
            fields["topic"] = str(data["topic"])[:100]
        if "description" in data:
            fields["description"] = str(data["description"])[:1000]
        if "deadline" in data:
            parse_date(data["deadline"], "deadline")
            fields["deadline"] = data["deadline"]
        if "priority" in data:
            fields["priority"] = clamp_int(data["priority"], 1, 5, existing["priority"], "priority")
        if "difficulty" in data:
            fields["difficulty"] = clamp_int(data["difficulty"], 1, 5, existing["difficulty"], "difficulty")
        if "estimated_minutes" in data:
            fields["estimated_minutes"] = clamp_int(
                data["estimated_minutes"], 5, 1000, existing["estimated_minutes"], "estimated_minutes"
            )
        if "status" in data:
            if data["status"] not in ("pending", "in_progress", "done"):
                raise ValidationError("'status' must be pending, in_progress, or done")
            fields["status"] = data["status"]
            if data["status"] == "done":
                fields["completed_at"] = datetime.now().isoformat()

        if fields:
            set_clause = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(f"UPDATE tasks SET {set_clause} WHERE id = ?", (*fields.values(), task_id))
            conn.commit()

        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return jsonify(dict(row))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with database.get_connection() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()
        return "", 204


# ---------------------------------------------------------------------------
# Profile (availability + weak/completed topics)
# ---------------------------------------------------------------------------

@app.get("/api/profile")
def get_profile():
    with database.get_connection() as conn:
        profile = dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())
        profile["weak_topics"] = json.loads(profile["weak_topics"])
        profile["completed_topics"] = json.loads(profile["completed_topics"])
        availability = {
            r["day_of_week"]: r["minutes"]
            for r in conn.execute("SELECT * FROM availability").fetchall()
        }
        profile["availability"] = availability
        return jsonify(profile)


@app.put("/api/profile")
def update_profile():
    data = request.get_json(force=True, silent=True) or {}
    with database.get_connection() as conn:
        if "preferred_session_length" in data:
            length = clamp_int(data["preferred_session_length"], 10, 240, 45, "preferred_session_length")
            conn.execute("UPDATE profile SET preferred_session_length = ? WHERE id = 1", (length,))
        if "weak_topics" in data:
            if not isinstance(data["weak_topics"], list):
                raise ValidationError("'weak_topics' must be a list")
            conn.execute(
                "UPDATE profile SET weak_topics = ? WHERE id = 1",
                (json.dumps([str(t)[:100] for t in data["weak_topics"]]),),
            )
        if "availability" in data:
            if not isinstance(data["availability"], dict):
                raise ValidationError("'availability' must be an object mapping weekday (0-6) to minutes")
            for day, minutes in data["availability"].items():
                day_i = clamp_int(day, 0, 6, None, "availability day")
                minutes_i = clamp_int(minutes, 0, 960, None, "availability minutes")
                conn.execute(
                    "INSERT INTO availability (day_of_week, minutes) VALUES (?, ?) "
                    "ON CONFLICT(day_of_week) DO UPDATE SET minutes = excluded.minutes",
                    (day_i, minutes_i),
                )
        conn.commit()
    return get_profile()


@app.post("/api/profile/weak-topics/<topic>")
def add_weak_topic(topic):
    with database.get_connection() as conn:
        row = conn.execute("SELECT weak_topics FROM profile WHERE id = 1").fetchone()
        topics = json.loads(row["weak_topics"])
        if topic not in topics:
            topics.append(topic)
        conn.execute("UPDATE profile SET weak_topics = ? WHERE id = 1", (json.dumps(topics),))
        conn.commit()
    return get_profile()


@app.delete("/api/profile/weak-topics/<topic>")
def remove_weak_topic(topic):
    with database.get_connection() as conn:
        row = conn.execute("SELECT weak_topics FROM profile WHERE id = 1").fetchone()
        topics = [t for t in json.loads(row["weak_topics"]) if t != topic]
        conn.execute("UPDATE profile SET weak_topics = ? WHERE id = 1", (json.dumps(topics),))
        conn.commit()
    return get_profile()


# ---------------------------------------------------------------------------
# Schedule generation
# ---------------------------------------------------------------------------

def _pending_tasks_for_scheduling(conn):
    rows = conn.execute(
        "SELECT * FROM tasks WHERE status != 'done' ORDER BY deadline"
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/schedule")
def get_schedule():
    with database.get_connection() as conn:
        tasks = _pending_tasks_for_scheduling(conn)
        profile = dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())
        weak_topics = json.loads(profile["weak_topics"])
        availability = {
            r["day_of_week"]: r["minutes"]
            for r in conn.execute("SELECT * FROM availability").fetchall()
        }
        result = scheduler.generate_schedule(
            tasks, availability, profile["preferred_session_length"], weak_topics
        )
        return jsonify(result)


# ---------------------------------------------------------------------------
# Dashboard & progress
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
def dashboard():
    today_iso = date.today().isoformat()
    with database.get_connection() as conn:
        tasks = _pending_tasks_for_scheduling(conn)
        profile = dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())
        weak_topics = json.loads(profile["weak_topics"])
        availability = {
            r["day_of_week"]: r["minutes"]
            for r in conn.execute("SELECT * FROM availability").fetchall()
        }
        schedule = scheduler.generate_schedule(
            tasks, availability, profile["preferred_session_length"], weak_topics
        )
        today_plan = next((d for d in schedule["days"] if d["date"] == today_iso), {"sessions": []})

        # Enrich today's sessions with task/subject details for display
        task_by_id = {t["id"]: t for t in tasks}
        today_sessions = []
        for s in today_plan["sessions"]:
            t = task_by_id.get(s["task_id"])
            if t:
                today_sessions.append({**s, "deadline": t["deadline"], "priority": t["priority"]})

        upcoming_deadlines = sorted(
            [t for t in tasks if t["deadline"] >= today_iso], key=lambda t: t["deadline"]
        )[:5]

        upcoming_exams = [
            dict(r)
            for r in conn.execute(
                """SELECT exams.*, subjects.name AS subject_name, subjects.color AS subject_color
                   FROM exams JOIN subjects ON subjects.id = exams.subject_id
                   WHERE exam_date >= ? ORDER BY exam_date LIMIT 5""",
                (today_iso,),
            ).fetchall()
        ]
        for e in upcoming_exams:
            e["topics"] = json.loads(e["topics"])

        total = conn.execute("SELECT COUNT(*) c FROM tasks").fetchone()["c"]
        done = conn.execute("SELECT COUNT(*) c FROM tasks WHERE status = 'done'").fetchone()["c"]

        recommended_id = schedule["recommended_next_task_id"]
        recommended_task = task_by_id.get(recommended_id) if recommended_id else None
        recommended_explanation = (
            schedule["task_explanations"].get(recommended_id, {}).get("explanation")
            if recommended_id
            else None
        )

        return jsonify(
            {
                "today_sessions": today_sessions,
                "upcoming_deadlines": upcoming_deadlines,
                "upcoming_exams": upcoming_exams,
                "progress": {
                    "total_tasks": total,
                    "completed_tasks": done,
                    "percent": round((done / total) * 100) if total else 0,
                },
                "recommended_next_task": recommended_task,
                "recommended_explanation": recommended_explanation,
                "at_risk_count": len(schedule["at_risk_task_ids"]),
            }
        )


@app.get("/api/progress")
def progress():
    with database.get_connection() as conn:
        by_subject = conn.execute(
            """SELECT subjects.id, subjects.name, subjects.color,
                      COUNT(tasks.id) AS total,
                      SUM(CASE WHEN tasks.status = 'done' THEN 1 ELSE 0 END) AS done
               FROM subjects LEFT JOIN tasks ON tasks.subject_id = subjects.id
               GROUP BY subjects.id ORDER BY subjects.name"""
        ).fetchall()
        profile = dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())
        return jsonify(
            {
                "by_subject": [dict(r) for r in by_subject],
                "weak_topics": json.loads(profile["weak_topics"]),
                "completed_topics": json.loads(profile["completed_topics"]),
            }
        )


# ---------------------------------------------------------------------------
# AI features
# ---------------------------------------------------------------------------

@app.get("/api/ai/status")
def ai_status():
    return jsonify({"available": True})


@app.post("/api/ai/parse")
def ai_parse():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["description"])
    with database.get_connection() as conn:
        subjects = [dict(r) for r in conn.execute("SELECT * FROM subjects").fetchall()]
    tasks = ai_service.parse_tasks_from_text(data["description"], subjects)
    return jsonify({"tasks": tasks})


@app.post("/api/ai/breakdown")
def ai_breakdown():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["topic", "subject_name"])
    subtopics = ai_service.suggest_subtopics(
        data["topic"], data["subject_name"], data.get("minutes_available")
    )
    return jsonify({"subtopics": subtopics})


@app.post("/api/ai/ask")
def ai_ask():
    data = request.get_json(force=True, silent=True) or {}
    require_fields(data, ["question"])

    # Build a plain-text context summary from the current plan so the
    # model can answer grounded questions without direct DB access.
    with database.get_connection() as conn:
        tasks = _task_query()
        profile = dict(conn.execute("SELECT * FROM profile WHERE id = 1").fetchone())
        exams = [dict(r) for r in conn.execute(
            """SELECT exams.*, subjects.name AS subject_name FROM exams
               JOIN subjects ON subjects.id = exams.subject_id ORDER BY exam_date"""
        ).fetchall()]

    lines = [f"Today's date: {date.today().isoformat()}", ""]
    lines.append("Upcoming exams:")
    for e in exams[:10]:
        lines.append(f"- {e['subject_name']}: {e['title']} on {e['exam_date']}")
    lines.append("")
    lines.append("Tasks (pending and completed):")
    for t in tasks[:40]:
        lines.append(
            f"- [{t['status']}] {t['subject_name']}: {t['title']} "
            f"(deadline {t['deadline']}, priority {t['priority']}/5, difficulty {t['difficulty']}/5)"
        )
    lines.append("")
    weak = json.loads(profile["weak_topics"])
    if weak:
        lines.append(f"Weak topics: {', '.join(weak)}")

    answer = ai_service.answer_question(data["question"], "\n".join(lines))
    return jsonify({"answer": answer})


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.get("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    database.init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=os.environ.get("FLASK_DEBUG", "1") == "1", port=port)
