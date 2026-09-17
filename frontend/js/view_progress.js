const ViewProgress = (() => {
  async function render(container) {
    container.innerHTML = loadingHtml("Loading progress");
    let data, profile;
    try {
      [data, profile] = await Promise.all([api.getProgress(), api.getProfile()]);
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Progress</h1>
          <div class="subtitle">How you're doing, subject by subject.</div>
        </div>
      </div>

      <div class="panel" style="margin-bottom: 20px;">
        <div class="section-label">Completion by subject</div>
        ${
          data.by_subject.length
            ? data.by_subject
                .map((s) => {
                  const total = s.total || 0;
                  const done = s.done || 0;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  return `
                <div style="margin-bottom: 14px;">
                  <div class="row between" style="margin-bottom: 4px;">
                    <span class="row" style="gap: 6px;"><span class="subject-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">${done}/${total} tasks</span>
                  </div>
                  <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
                </div>`;
                })
                .join("")
            : emptyStateHtml("&#9679;", "No subjects yet.")
        }
      </div>

      <div class="grid-2">
        <div class="panel">
          <div class="section-label">Weak topics</div>
          <p style="font-size: 0.85rem; color: var(--text-muted);">Topics you flag here get extra weight when the planner schedules your work.</p>
          <div class="row wrap" id="weak-topics-list" style="margin-bottom: 12px;">
            ${
              profile.weak_topics.length
                ? profile.weak_topics.map((t) => `<span class="tag urgent" data-topic="${escapeHtml(t)}">${escapeHtml(t)} &times;</span>`).join("")
                : `<span style="color: var(--text-muted); font-size: 0.85rem;">None yet.</span>`
            }
          </div>
          <div class="row">
            <input id="new-weak-topic" placeholder="e.g. Integration by parts" />
            <button class="btn" id="add-weak-topic-btn">Add</button>
          </div>
        </div>

        <div class="panel">
          <div class="section-label">Study preferences</div>
          <div class="field">
            <label>Preferred session length (minutes)</label>
            <input type="number" id="session-length" min="10" max="240" value="${profile.preferred_session_length}" />
          </div>
          <div class="section-label" style="margin-top: 16px;">Available minutes per day</div>
          <div class="stack" style="gap: 8px;">
            ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
              .map(
                (d, i) => `
              <div class="row between">
                <span style="font-size: 0.85rem;">${d}</span>
                <input type="number" min="0" max="960" style="width: 90px;" data-day="${i}" value="${profile.availability[i] ?? 0}" />
              </div>`
              )
              .join("")}
          </div>
          <button class="btn btn-primary" id="save-prefs-btn" style="margin-top: 14px;">Save preferences</button>
        </div>
      </div>
    `;

    container.querySelector("#add-weak-topic-btn").addEventListener("click", async () => {
      const input = container.querySelector("#new-weak-topic");
      const topic = input.value.trim();
      if (!topic) return;
      try {
        await api.addWeakTopic(topic);
        showToast("Weak topic added");
        render(container);
      } catch (e) {
        showToast(e.message, true);
      }
    });

    container.querySelectorAll("#weak-topics-list [data-topic]").forEach((tag) =>
      tag.addEventListener("click", async () => {
        try {
          await api.removeWeakTopic(tag.dataset.topic);
          render(container);
        } catch (e) {
          showToast(e.message, true);
        }
      })
    );

    container.querySelector("#save-prefs-btn").addEventListener("click", async () => {
      const availability = {};
      container.querySelectorAll("[data-day]").forEach((input) => {
        availability[input.dataset.day] = Number(input.value) || 0;
      });
      const sessionLength = Number(container.querySelector("#session-length").value) || 45;
      try {
        await api.updateProfile({ availability, preferred_session_length: sessionLength });
        showToast("Preferences saved");
      } catch (e) {
        showToast(e.message, true);
      }
    });
  }

  return { render };
})();
