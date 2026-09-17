const ViewPlanner = (() => {
  let subjects = [];
  let proposedTasks = [];

  async function render(container) {
    container.innerHTML = loadingHtml("Loading planner");
    let status;
    try {
      [status, subjects] = await Promise.all([api.aiStatus(), api.getSubjects()]);
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }
    proposedTasks = [];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>AI planner</h1>
          <div class="subtitle">Describe your work in plain language, or ask about your plan.</div>
        </div>
      </div>

      ${
        !status.available
          ? `<div class="ai-disabled-notice">AI features are turned off because no ANTHROPIC_API_KEY is set. Add one to your .env file and restart the server to enable this page. See the README for instructions.</div>`
          : ""
      }

      <div class="stack">
        <div class="ai-input-panel">
          <div class="section-label">Turn a description into tasks</div>
          <textarea id="nl-input" placeholder="e.g. I have a Maths exam on Friday covering integration and differential equations. I haven't revised differential equations yet and I have about 90 minutes available each evening." ${status.available ? "" : "disabled"}></textarea>
          <div class="row" style="margin-top: 10px; justify-content: flex-end;">
            <button class="btn btn-primary" id="parse-btn" ${status.available ? "" : "disabled"}>Generate tasks</button>
          </div>
          <div id="proposed-list" style="margin-top: 14px;"></div>
        </div>

        <div class="ai-input-panel">
          <div class="section-label">Break a topic into smaller sessions</div>
          <div class="field-row">
            <div class="field">
              <label>Subject</label>
              <select id="breakdown-subject">${subjectOptionsHtml(subjects)}</select>
            </div>
            <div class="field">
              <label>Topic</label>
              <input id="breakdown-topic" placeholder="e.g. Differential equations" ${status.available ? "" : "disabled"} />
            </div>
          </div>
          <button class="btn" id="breakdown-btn" ${status.available ? "" : "disabled"}>Suggest sessions</button>
          <div id="breakdown-result" style="margin-top: 12px;"></div>
        </div>

        <div class="ai-input-panel">
          <div class="section-label">Ask about your plan</div>
          <div class="stack" id="chat-log" style="gap: 10px; margin-bottom: 12px;"></div>
          <div class="row">
            <input id="chat-input" placeholder="e.g. What should I focus on this week?" ${status.available ? "" : "disabled"} />
            <button class="btn btn-primary" id="chat-send-btn" ${status.available ? "" : "disabled"}>Ask</button>
          </div>
        </div>
      </div>
    `;

    if (status.available) {
      container.querySelector("#parse-btn").addEventListener("click", () => handleParse(container));
      container.querySelector("#breakdown-btn").addEventListener("click", () => handleBreakdown(container));
      container.querySelector("#chat-send-btn").addEventListener("click", () => handleAsk(container));
      container.querySelector("#chat-input").addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleAsk(container);
      });
    }
  }

  async function handleParse(container) {
    const input = container.querySelector("#nl-input");
    const text = input.value.trim();
    if (!text) return;
    const btn = container.querySelector("#parse-btn");
    btn.disabled = true;
    btn.textContent = "Thinking...";
    try {
      const res = await api.aiParse(text);
      proposedTasks = res.tasks;
      renderProposedTasks(container);
    } catch (e) {
      showToast(e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate tasks";
    }
  }

  function renderProposedTasks(container) {
    const list = container.querySelector("#proposed-list");
    if (!proposedTasks.length) {
      list.innerHTML = "";
      return;
    }
    list.innerHTML = `
      <div class="section-label">Proposed tasks &mdash; review and save</div>
      ${proposedTasks
        .map(
          (t, i) => `
        <div class="proposed-task">
          <div class="row between">
            <strong>${escapeHtml(t.title)}</strong>
            <button class="btn-ghost btn btn-sm" data-remove="${i}">Discard</button>
          </div>
          <div class="task-meta">${escapeHtml(t.subject)} &middot; ${escapeHtml(t.topic || "no topic")} &middot; due ${t.deadline} &middot; priority ${t.priority}/5 &middot; difficulty ${t.difficulty}/5 &middot; ${minutesLabel(t.estimated_minutes)}</div>
        </div>`
        )
        .join("")}
      <button class="btn btn-primary" id="save-proposed-btn" style="margin-top: 8px;">Save all to my plan</button>
    `;
    list.querySelectorAll("[data-remove]").forEach((btn) =>
      btn.addEventListener("click", () => {
        proposedTasks.splice(Number(btn.dataset.remove), 1);
        renderProposedTasks(container);
      })
    );
    list.querySelector("#save-proposed-btn").addEventListener("click", () => saveProposedTasks(container));
  }

  async function saveProposedTasks(container) {
    let savedCount = 0;
    for (const t of proposedTasks) {
      try {
        let subject = subjects.find((s) => s.name.toLowerCase() === t.subject.toLowerCase());
        if (!subject) {
          subject = await api.createSubject({ name: t.subject });
          subjects.push(subject);
        }
        await api.createTask({
          title: t.title,
          subject_id: subject.id,
          topic: t.topic,
          deadline: t.deadline,
          priority: t.priority,
          difficulty: t.difficulty,
          estimated_minutes: t.estimated_minutes,
          source: "ai",
        });
        savedCount++;
      } catch (e) {
        showToast(`Couldn't save "${t.title}": ${e.message}`, true);
      }
    }
    proposedTasks = [];
    container.querySelector("#nl-input").value = "";
    renderProposedTasks(container);
    showToast(`Saved ${savedCount} task(s) to your plan`);
  }

  async function handleBreakdown(container) {
    const subjectId = container.querySelector("#breakdown-subject").value;
    const subject = subjects.find((s) => String(s.id) === subjectId);
    const topic = container.querySelector("#breakdown-topic").value.trim();
    if (!topic || !subject) return;
    const result = container.querySelector("#breakdown-result");
    result.innerHTML = loadingHtml("Breaking it down");
    try {
      const res = await api.aiBreakdown(topic, subject.name);
      result.innerHTML = res.subtopics
        .map((s) => `<div class="task-row"><div class="task-main"><div class="task-title">${escapeHtml(s)}</div></div></div>`)
        .join("");
    } catch (e) {
      result.innerHTML = "";
      showToast(e.message, true);
    }
  }

  async function handleAsk(container) {
    const input = container.querySelector("#chat-input");
    const question = input.value.trim();
    if (!question) return;
    const log = container.querySelector("#chat-log");
    log.innerHTML += `<div class="chat-bubble user">${escapeHtml(question)}</div>`;
    input.value = "";
    const thinkingId = "thinking-" + Date.now();
    log.innerHTML += `<div class="chat-bubble ai" id="${thinkingId}">Thinking&hellip;</div>`;
    log.scrollTop = log.scrollHeight;
    try {
      const res = await api.aiAsk(question);
      document.getElementById(thinkingId).textContent = res.answer;
    } catch (e) {
      document.getElementById(thinkingId).textContent = e.message;
    }
  }

  return { render };
})();
