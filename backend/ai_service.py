"""
AI integration using LM Studio.

Uses a local model through LM Studio's OpenAI-compatible API.
No API key or paid service is required.

LM Studio server:
    http://127.0.0.1:1234

Current model:
    google/gemma-4-e4b
"""

import os
import json
from datetime import date
from urllib import request, error


LM_STUDIO_URL = os.environ.get(
    "LM_STUDIO_URL",
    "http://127.0.0.1:1234/v1",
)

MODEL = os.environ.get(
    "LM_STUDIO_MODEL",
    "google/gemma-4-e4b",
)


class AIUnavailableError(Exception):
    """Raised when the local AI service is unavailable."""
    pass


def _chat(system_prompt, user_message, max_tokens):
    """
    Send a chat completion request to LM Studio's OpenAI-compatible API.
    """

    url = f"{LM_STUDIO_URL}/chat/completions"

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_message,
            },
        ],
        "max_tokens": max_tokens,
        "temperature": 0.2,
    }

    data = json.dumps(payload).encode("utf-8")

    req = request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))

    except error.URLError as e:
        raise AIUnavailableError(
            "Could not connect to LM Studio. "
            "Make sure LM Studio is running and its local server is started "
            "at http://127.0.0.1:1234."
        ) from e

    except TimeoutError as e:
        raise AIUnavailableError(
            "LM Studio took too long to respond."
        ) from e

    except json.JSONDecodeError as e:
        raise AIUnavailableError(
            "LM Studio returned an invalid response."
        ) from e

    try:
        return result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise AIUnavailableError(
            "LM Studio returned an unexpected response format."
        ) from e


def _extract_json(text):
    """Model output should be pure JSON, but strip code fences defensively."""

    text = text.strip()

    if text.startswith("```"):
        parts = text.split("```")

        if len(parts) >= 2:
            text = parts[1]

            if text.startswith("json"):
                text = text[4:]

    return json.loads(text.strip())


def parse_tasks_from_text(description, subjects, today=None):
    """
    Turns a free-text description into structured task proposals.

    Example:
        "I have a Maths exam on Friday covering integration and
        differential equations."

    Returns a list of task dictionaries that can be reviewed and saved.
    """

    today = today or date.today()

    subject_names = [s["name"] for s in subjects]

    system_prompt = f"""You convert a student's informal description of upcoming study work into structured tasks.

Today's date is {today.isoformat()}.

The student's existing subjects are:
{json.dumps(subject_names)}

Respond with ONLY a JSON array.
Do not include markdown.
Do not include explanations.

Each task object MUST contain exactly these fields:

- "title": short task name (string)
- "subject": one of the existing subject names if it clearly matches, otherwise your best short subject label (string)
- "topic": the specific topic this task covers (string, can be empty)
- "deadline": an ISO date (YYYY-MM-DD), inferred from relative dates such as "Friday"
- "priority": integer 1-5, where 5 is most urgent/important
- "difficulty": integer 1-5, where 5 is hardest
- "estimated_minutes": realistic total study time in minutes

If multiple topics are mentioned, break the work into 2-4 separate tasks.

Only output the JSON array."""

    text = _chat(
        system_prompt,
        description,
        max_tokens=1500,
    )

    try:
        tasks = _extract_json(text)
    except (json.JSONDecodeError, TypeError) as e:
        raise AIUnavailableError(
            "The AI returned an invalid task format. Please try again."
        ) from e

    cleaned = []

    if not isinstance(tasks, list):
        raise AIUnavailableError(
            "The AI did not return a task list."
        )

    for t in tasks:
        try:
            cleaned.append(
                {
                    "title": str(t["title"])[:200],
                    "subject": str(t.get("subject", "General"))[:100],
                    "topic": str(t.get("topic", ""))[:100],
                    "deadline": str(t["deadline"]),
                    "priority": max(
                        1,
                        min(5, int(t.get("priority", 3))),
                    ),
                    "difficulty": max(
                        1,
                        min(5, int(t.get("difficulty", 3))),
                    ),
                    "estimated_minutes": max(
                        10,
                        min(600, int(t.get("estimated_minutes", 60))),
                    ),
                }
            )

        except (KeyError, ValueError, TypeError):
            continue

    return cleaned


def suggest_subtopics(topic, subject_name, minutes_available=None):
    """Break a broad topic into smaller revision sessions."""

    constraint = (
        f" Each session should fit in roughly {minutes_available} minutes."
        if minutes_available
        else ""
    )

    system_prompt = (
        "You break a broad study topic into 3-6 smaller, concrete "
        "revision sessions that a student could schedule individually. "
        "Respond with ONLY a JSON array of strings. "
        "Do not include markdown or explanations."
        + constraint
    )

    text = _chat(
        system_prompt,
        f"Subject: {subject_name}\nTopic: {topic}",
        max_tokens=500,
    )

    try:
        result = _extract_json(text)
    except (json.JSONDecodeError, TypeError) as e:
        raise AIUnavailableError(
            "The AI returned an invalid subtopic format. Please try again."
        ) from e

    if not isinstance(result, list):
        raise AIUnavailableError(
            "The AI did not return a list of subtopics."
        )

    return [str(s)[:150] for s in result][:6]


def answer_question(question, plan_context):
    """
    Answers a question about the student's own study plan.

    The model receives only the plan context supplied by the caller.
    """

    system_prompt = (
        "You are a study-planning assistant embedded in a student's "
        "planner app. "

        "Answer the student's question using ONLY the plan context "
        "provided below. "

        "Be concise, specific, and practical — a few sentences, "
        "not an essay. "

        "If the context does not contain enough information to answer, "
        "say so plainly.\n\n"

        f"PLAN CONTEXT:\n{plan_context}"
    )

    return _chat(
        system_prompt,
        question,
        max_tokens=600,
    )

