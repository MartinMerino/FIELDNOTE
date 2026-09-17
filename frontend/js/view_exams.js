const ViewExams = (() => {
  async function render(container) {
    container.innerHTML = loadingHtml("Loading exams");
    let exams, subjects;
    try {
      [exams, subjects] = await Promise.all([api.getExams(), api.getSubjects()]);
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Exams</h1>
          <div class="subtitle">Everything you're preparing for.</div>
        </div>
        <button class="btn btn-primary" id="new-exam-btn">+ Add exam</button>
      </div>

      <div class="panel">
        ${
          exams.length
            ? exams
                .map(
                  (e) => `
              <div class="task-row" data-exam-id="${e.id}">
                <div class="task-main">
                  <div class="task-title">${escapeHtml(e.title)}</div>
                  <div class="task-meta">
                    <span class="row" style="gap:5px;"><span class="subject-dot" style="background:${e.subject_color}"></span>${escapeHtml(e.subject_name)}</span>
                    ${deadlineTag(e.exam_date)}
                  </div>
                  ${e.topics.length ? `<div class="task-meta">${e.topics.map(escapeHtml).join(" &middot; ")}</div>` : ""}
                </div>
                <button class="btn btn-ghost btn-sm" data-action="delete">Remove</button>
              </div>`
                )
                .join("")
            : emptyStateHtml("&#9679;", subjects.length ? "No exams yet." : "Add a subject first, then add an exam.")
        }
      </div>
    `;

    container.querySelector("#new-exam-btn").addEventListener("click", () => openExamForm(subjects, () => render(container)));
    container.querySelectorAll('[data-action="delete"]').forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = Number(e.target.closest("[data-exam-id]").dataset.examId);
        try {
          await api.deleteExam(id);
          showToast("Exam removed");
          render(container);
        } catch (err) {
          showToast(err.message, true);
        }
      })
    );
  }

  function openExamForm(subjects, onSaved) {
    if (!subjects.length) {
      showToast("Add a subject first", true);
      return;
    }
    openModal(
      `
      <h2>New exam</h2>
      <form id="exam-form">
        <div class="field">
          <label>Title</label>
          <input name="title" required maxlength="200" placeholder="e.g. Maths mid-term" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Subject</label>
            <select name="subject_id">${subjectOptionsHtml(subjects)}</select>
          </div>
          <div class="field">
            <label>Date</label>
            <input type="date" name="exam_date" required min="${todayISO()}" />
          </div>
        </div>
        <div class="field">
          <label>Topics covered (comma-separated, optional)</label>
          <input name="topics" placeholder="e.g. Integration, Differential equations" />
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 6px;">
          <button type="button" class="btn" id="cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save exam</button>
        </div>
      </form>
    `,
      (root) => {
        root.querySelector("#cancel-btn").addEventListener("click", closeModal);
        root.querySelector("#exam-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const topics = String(fd.get("topics") || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          try {
            await api.createExam({
              title: fd.get("title"),
              subject_id: Number(fd.get("subject_id")),
              exam_date: fd.get("exam_date"),
              topics,
            });
            closeModal();
            showToast("Exam added");
            onSaved();
          } catch (err) {
            showToast(err.message, true);
          }
        });
      }
    );
  }

  return { render };
})();
