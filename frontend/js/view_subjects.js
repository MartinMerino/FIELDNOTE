const ViewSubjects = (() => {
  const PALETTE = ["#1F6F5C", "#A6432E", "#B5842A", "#2C4356", "#6B5B95", "#4E7A8C", "#8C5E4E"];

  async function render(container) {
    container.innerHTML = loadingHtml("Loading subjects");
    let subjects;
    try {
      subjects = await api.getSubjects();
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Subjects</h1>
          <div class="subtitle">The building blocks everything else attaches to.</div>
        </div>
        <button class="btn btn-primary" id="new-subject-btn">+ Add subject</button>
      </div>

      <div class="grid-3">
        ${
          subjects.length
            ? subjects
                .map(
                  (s) => `
              <div class="panel" data-subject-id="${s.id}">
                <div class="row between">
                  <div class="row" style="gap: 8px;">
                    <span class="subject-dot" style="background:${s.color}; width:12px; height:12px;"></span>
                    <h3>${escapeHtml(s.name)}</h3>
                  </div>
                  <button class="btn btn-ghost btn-sm btn-danger-text" data-action="delete">Remove</button>
                </div>
              </div>`
                )
                .join("")
            : ""
        }
      </div>
      ${!subjects.length ? emptyStateHtml("&#9679;", "No subjects yet. Add your first one to get started.") : ""}
    `;

    container.querySelector("#new-subject-btn").addEventListener("click", () => openSubjectForm(() => render(container)));
    container.querySelectorAll('[data-action="delete"]').forEach((btn) =>
      btn.addEventListener("click", async (e) => {
        const id = Number(e.target.closest("[data-subject-id]").dataset.subjectId);
        if (!confirm("Delete this subject? This also removes its exams and tasks.")) return;
        try {
          await api.deleteSubject(id);
          showToast("Subject removed");
          render(container);
        } catch (err) {
          showToast(err.message, true);
        }
      })
    );
  }

  function openSubjectForm(onSaved) {
    const suggestedColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    openModal(
      `
      <h2>New subject</h2>
      <form id="subject-form">
        <div class="field">
          <label>Name</label>
          <input name="name" required maxlength="100" placeholder="e.g. Mathematics" />
        </div>
        <div class="field">
          <label>Colour</label>
          <input type="color" name="color" value="${suggestedColor}" style="height: 38px; padding: 4px;" />
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 6px;">
          <button type="button" class="btn" id="cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save subject</button>
        </div>
      </form>
    `,
      (root) => {
        root.querySelector("#cancel-btn").addEventListener("click", closeModal);
        root.querySelector("#subject-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          try {
            await api.createSubject({ name: fd.get("name"), color: fd.get("color") });
            closeModal();
            showToast("Subject added");
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
