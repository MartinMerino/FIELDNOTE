const ViewSchedule = (() => {
  async function render(container) {
    container.innerHTML = loadingHtml("Building your schedule");
    let schedule, tasks;
    try {
      [schedule, tasks] = await Promise.all([api.getSchedule(), api.getTasks()]);
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }
    const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));

    const today = todayISO();
    const upcoming = schedule.days.slice(0, 14);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Schedule</h1>
          <div class="subtitle">Generated from your tasks, deadlines and available study time.</div>
        </div>
      </div>

      ${
        schedule.at_risk_task_ids.length
          ? `<div class="ai-disabled-notice">${schedule.at_risk_task_ids.length} task(s) can't fit before their deadline with your current available time. Consider freeing up time in your profile or adjusting deadlines.</div>`
          : ""
      }

      <div class="day-strip">
        ${upcoming
          .map((day) => {
            const isToday = day.date === today;
            const dateObj = new Date(day.date + "T00:00:00");
            const label = dateObj.toLocaleDateString(undefined, { weekday: "short" });
            const dateLabel = dateObj.toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return `
            <div class="day-card ${isToday ? "today" : ""}">
              <div class="day-label">${label} &middot; <strong>${dateLabel}</strong>${isToday ? " &middot; today" : ""}</div>
              ${
                day.sessions.length
                  ? day.sessions
                      .map(
                        (s) => `<div class="session-chip">${escapeHtml(s.title)}<div class="mins">${minutesLabel(s.minutes)}</div></div>`
                      )
                      .join("")
                  : `<div style="color: var(--text-muted); font-size: 0.78rem;">Free</div>`
              }
            </div>`;
          })
          .join("")}
      </div>

      <hr class="divider" />

      <h2>Why this plan?</h2>
      <div class="panel">
        ${renderExplanations(schedule, taskById)}
      </div>
    `;
  }

  function renderExplanations(schedule, taskById) {
    const ids = Object.keys(schedule.task_explanations);
    if (!ids.length) return emptyStateHtml("&#9679;", "Add tasks to see how the planner prioritises your work.");
    // Sort by score, show top 8
    const sorted = ids
      .map((id) => ({ id, ...schedule.task_explanations[id] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    return sorted
      .map((t) => {
        const task = taskById[t.id];
        return `
      <div class="task-row">
        <div class="task-main">
          <div class="task-title">${escapeHtml(task ? task.title : "Task")}</div>
          <div class="task-meta">${escapeHtml(t.explanation)}</div>
        </div>
      </div>`;
      })
      .join("");
  }

  return { render };
})();
