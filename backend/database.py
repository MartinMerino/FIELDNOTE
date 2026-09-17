"""
Database layer: a thin wrapper around sqlite3.

We use plain sqlite3 rather than an ORM on purpose - the schema is small
and simple enough that raw SQL stays readable, and it avoids pulling in
a heavy dependency (SQLAlchemy) for a project this size.
"""
import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "planner.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#2E7D6B',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    exam_date TEXT NOT NULL,
    topics TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    deadline TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 3,
    difficulty INTEGER NOT NULL DEFAULT 3,
    estimated_minutes INTEGER NOT NULL DEFAULT 60,
    minutes_scheduled INTEGER NOT NULL DEFAULT 0,
    minutes_completed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS availability (
    day_of_week INTEGER PRIMARY KEY,  -- 0=Monday ... 6=Sunday
    minutes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    preferred_session_length INTEGER NOT NULL DEFAULT 45,
    weak_topics TEXT NOT NULL DEFAULT '[]',
    completed_topics TEXT NOT NULL DEFAULT '[]'
);
"""


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_connection() as conn:
        conn.executescript(SCHEMA)
        # Seed a singleton profile row and default availability if empty
        conn.execute(
            "INSERT OR IGNORE INTO profile (id, preferred_session_length) VALUES (1, 45)"
        )
        existing = conn.execute("SELECT COUNT(*) c FROM availability").fetchone()["c"]
        if existing == 0:
            # Sensible default: 90 min on weekdays, 120 on weekends
            defaults = [90, 90, 90, 90, 90, 120, 120]
            conn.executemany(
                "INSERT INTO availability (day_of_week, minutes) VALUES (?, ?)",
                list(enumerate(defaults)),
            )
        conn.commit()


@contextmanager
def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()
