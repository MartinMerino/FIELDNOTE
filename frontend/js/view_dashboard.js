const ViewDashboard = (() => {
  async function render(container) {
    container.innerHTML = loadingHtml("Loading your dashboard");
    let data;
    try {
      data = await api.getDashboard();
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }

    const rec = data.recommended_next_task;

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Dashboard</h1>
          <div class="subtitle">${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
      </div>

      <div class="hero-panel">
        <div class="eyebrow">Recommended next</div>
        ${rec
          ? `<h2>${escapeHtml(rec.title)}</h2>
             <div class="explain">${escapeHtml(data.recommended_explanation || "")}</div>`
          : `<h2>Nothing scheduled</h2><div class="explain">Add a subject and a task to get a personalised plan.</div>`}
        <div class="stat-grid">
          <div class="stat-box"><div class="num">${data.progress.percent}%</div><div class="lbl">of all tasks completed</div></div>
          <div class="stat-box"><div class="num">${data.today_sessions.length}</div><div class="lbl">sessions planned today</div></div>
          <div class="stat-box"><div class="num">${data.at_risk_count}</div><div class="lbl">tasks at risk of missing deadline</div></div>
        </div>
      </div>

      <div class="grid-2">
        <div class="stack">
          <div class="panel">
            <div class="section-label">Today's sessions</div>
            ${
              data.today_sessions.length
                ? data.today_sessions
                    .map(
                      (s) => `
                    <div class="task-row">
                      <div class="task-main">
                        <div class="task-title">${escapeHtml(s.title)}</div>
                        <div class="task-meta">${deadlineTag(s.deadline)}<span>${minutesLabel(s.minutes)}</span></div>
                      </div>
                    </div>`
                    )
                    .join("")
                : emptyStateHtml("&#9679;", "No sessions planned for today. Enjoy the free time, or check Tasks to add work.")
            }
          </div>

          <div class="panel">
            <div class="section-label">Upcoming deadlines</div>
            ${
              data.upcoming_deadlines.length
                ? data.upcoming_deadlines
                    .map(
                      (t) => `
                    <div class="task-row">
                      <div class="task-main">
                        <div class="task-title">${escapeHtml(t.title)}</div>
                        <div class="task-meta">
                          <span class="row" style="gap:5px;"><span class="subject-dot" style="background:${t.subject_color}"></span>${escapeHtml(t.subject_name)}</span>
                          ${deadlineTag(t.deadline)}
                        </div>
                      </div>
                    </div>`
                    )
                    .join("")
                : emptyStateHtml("&#9679;", "No pending deadlines.")
            }
          </div>
        </div>

        <div class="panel">
          <div class="section-label">Upcoming exams</div>
          ${
            data.upcoming_exams.length
              ? data.upcoming_exams
                  .map(
                    (e) => `
                  <div class="task-row">
                    <div class="task-main">
                      <div class="task-title">${escapeHtml(e.title)}</div>
                      <div class="task-meta">
                        <span class="row" style="gap:5px;"><span class="subject-dot" style="background:${e.subject_color}"></span>${escapeHtml(e.subject_name)}</span>
                        ${deadlineTag(e.exam_date)}
                      </div>
                      ${e.topics.length ? `<div class="task-meta">${e.topics.map(escapeHtml).join(" &middot; ")}</div>` : ""}
                    </div>
                  </div>`
                  )
                  .join("")
              : emptyStateHtml("&#9679;", "No exams added yet.")
          }
        </div>
      </div>
    `;
  }

  return { render };
})();
