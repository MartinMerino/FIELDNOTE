"""
Scheduling engine.

This is the non-AI, deterministic core of the planner: it decides what to
study and when. It intentionally does NOT call the AI model - prioritising
work is a well-defined optimisation problem, not something that needs an
LLM, and keeping it deterministic means the plan is explainable, testable,
and doesn't depend on an API key being configured.

Algorithm overview
-------------------
1. Score every pending task on five factors: urgency (time to deadline),
   priority, difficulty, whether it touches a "weak area", and how much
   work is left relative to time available.
2. Sort tasks by score (highest first).
3. Walk forward day by day from today, filling each day's available
   study minutes with the highest-scoring tasks that still have time
   left before their deadline. Large tasks are split into multiple
   sessions no longer than the student's preferred session length.
4. Flag any task that cannot be fully scheduled before its deadline
   given the remaining capacity ("at risk").

The result is a day-by-day session plan plus a breakdown of *why* each
task was placed where it was, which powers the "explain this plan"
feature in the UI without needing to call the AI model.
"""
from datetime import date, timedelta
import json

HORIZON_DAYS = 21  # how far ahead we plan


def _days_until(deadline_str, today):
    deadline = date.fromisoformat(deadline_str)
    return (deadline - today).days


def score_task(task, today, weak_topics):
    """
    Returns (score, breakdown) where breakdown explains the contributing
    factors in plain terms, used both for sorting and for the "why was
    this prioritised" explanation shown to the student.
    """
    days_left = _days_until(task["deadline"], today)

    # Urgency: close/overdue deadlines dominate. Overdue tasks get a hard
    # boost so they always float to the top regardless of other factors.
    if days_left < 0:
        urgency = 1.5 + min(abs(days_left) * 0.05, 0.5)  # overdue
    else:
        urgency = 1 / (days_left + 1)

    priority = task["priority"] / 5
    difficulty = task["difficulty"] / 5

    is_weak_area = bool(task["topic"]) and task["topic"].lower() in {
        t.lower() for t in weak_topics
    }
    weak_bonus = 0.25 if is_weak_area else 0

    remaining_minutes = max(task["estimated_minutes"] - task["minutes_scheduled"], 0)
    # Workload pressure: a lot of work left vs. little time left pushes
    # the task earlier so it isn't crammed at the last minute.
    if days_left > 0:
        workload_pressure = min(remaining_minutes / (days_left * 60 + 1), 1.5)
    else:
        workload_pressure = 1.5

    score = (
        urgency * 0.40
        + priority * 0.25
        + difficulty * 0.15
        + weak_bonus * 0.10
        + workload_pressure * 0.10
    )

    breakdown = {
        "days_left": days_left,
        "urgency": round(urgency, 3),
        "priority": task["priority"],
        "difficulty": task["difficulty"],
        "is_weak_area": is_weak_area,
        "remaining_minutes": remaining_minutes,
        "workload_pressure": round(workload_pressure, 3),
        "overdue": days_left < 0,
    }
    return round(score, 4), breakdown


def explain_task(task, breakdown):
    """Deterministic, template-based explanation - no AI call needed."""
    reasons = []
    if breakdown["overdue"]:
        reasons.append(f"it's {abs(breakdown['days_left'])} day(s) overdue")
    elif breakdown["days_left"] <= 2:
        reasons.append(f"its deadline is in {breakdown['days_left']} day(s)")
    if task["priority"] >= 4:
        reasons.append("you marked it high priority")
    if task["difficulty"] >= 4:
        reasons.append("it's a difficult task, so it needs more lead time")
    if breakdown["is_weak_area"]:
        reasons.append(f"'{task['topic']}' is a topic you've flagged as weak")
    if breakdown["workload_pressure"] > 0.8:
        reasons.append("there's a lot of remaining work relative to the time left")

    if not reasons:
        return "Scheduled based on its deadline and priority relative to your other tasks."
    return "Prioritised because " + ", and ".join(reasons) + "."


def generate_schedule(tasks, availability_by_weekday, session_length, weak_topics, today=None):
    """
    tasks: list of dicts with keys id, title, deadline, priority, difficulty,
           estimated_minutes, minutes_scheduled, topic
    availability_by_weekday: dict {0: minutes, ..., 6: minutes} (0=Monday)
    session_length: preferred max minutes per single session
    weak_topics: list of topic strings the student struggles with

    Returns dict: {
        "days": [{"date": "...", "sessions": [{"task_id", "title", "minutes", "subject_id"}]}],
        "at_risk_task_ids": [...],
        "task_explanations": {task_id: {"score", "explanation", "breakdown"}}
    }
    """
    if today is None:
        today = date.today()

    scored = []
    explanations = {}
    for t in tasks:
        remaining = max(t["estimated_minutes"] - t["minutes_scheduled"], 0)
        if remaining <= 0:
            continue
        s, breakdown = score_task(t, today, weak_topics)
        scored.append({**t, "_score": s, "_remaining": remaining})
        explanations[t["id"]] = {
            "score": s,
            "breakdown": breakdown,
            "explanation": explain_task(t, breakdown),
        }

    scored.sort(key=lambda t: t["_score"], reverse=True)

    days = []
    day_capacity = {}
    for i in range(HORIZON_DAYS):
        d = today + timedelta(days=i)
        cap = availability_by_weekday.get(d.weekday(), 0)
        day_capacity[d] = cap
        days.append({"date": d.isoformat(), "sessions": [], "_remaining_capacity": cap})

    day_index = {day["date"]: day for day in days}

    at_risk = []
    for t in scored:
        remaining = t["_remaining"]
        deadline = date.fromisoformat(t["deadline"])
        # Only consider days from today up to (and including) the deadline,
        # or the full horizon if the deadline is further out / overdue.
        last_day = min(deadline, today + timedelta(days=HORIZON_DAYS - 1))
        if last_day < today:
            last_day = today  # overdue: try to fit it in as soon as possible

        cursor = today
        while remaining > 0 and cursor <= last_day:
            day = day_index.get(cursor.isoformat())
            if day is None or day["_remaining_capacity"] <= 0:
                cursor += timedelta(days=1)
                continue

            chunk = min(session_length, remaining, day["_remaining_capacity"])
            if chunk <= 0:
                cursor += timedelta(days=1)
                continue

            # Merge into an existing session for this task on this day
            # rather than adding a second entry, so the UI shows one
            # session per task per day even if it needed several chunks
            # to fit (e.g. to avoid missing a tight deadline).
            existing = next((s for s in day["sessions"] if s["task_id"] == t["id"]), None)
            if existing:
                existing["minutes"] += chunk
            else:
                day["sessions"].append(
                    {
                        "task_id": t["id"],
                        "title": t["title"],
                        "subject_id": t["subject_id"],
                        "minutes": chunk,
                    }
                )
            day["_remaining_capacity"] -= chunk
            remaining -= chunk

            # Only move to the next day once today's capacity is used up
            # (or the task is fully scheduled) - otherwise keep filling
            # today, since leaving capacity idle while a deadline is at
            # risk would be a worse plan.
            if day["_remaining_capacity"] <= 0 or remaining <= 0:
                cursor += timedelta(days=1)

        if remaining > 0:
            at_risk.append(t["id"])

    for day in days:
        day.pop("_remaining_capacity", None)

    recommended = scored[0]["id"] if scored else None

    return {
        "days": days,
        "at_risk_task_ids": at_risk,
        "task_explanations": explanations,
        "recommended_next_task_id": recommended,
    }
