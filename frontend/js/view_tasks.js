const ViewTasks = (() => {
  let currentFilter = "pending";

  async function render(container) {
    container.innerHTML = loadingHtml("Loading tasks");
    let tasks, subjects;
    try {
      [tasks, subjects] = await Promise.all([api.getTasks(), api.getSubjects()]);
    } catch (e) {
      container.innerHTML = emptyStateHtml("!", e.message);
      return;
    }

    const filtered = currentFilter === "all" ? tasks : tasks.filter((t) => t.status === currentFilter);

    container.innerHTML = `
      <div class="page-header">
        <div>
          <h1>Tasks</h1>
          <div class="subtitle">${tasks.length} total &middot; ${tasks.filter((t) => t.status !== "done").length} pending</div>
        </div>
        <button class="btn btn-primary" id="new-task-btn">+ Add task</button>
      </div>

      <div class="row" style="margin-bottom: 16px;">
        ${["pending", "done", "all"].map(
          (f) => `<button class="btn btn-sm ${currentFilter === f ? "btn-primary" : ""}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`
        ).join("")}
      </div>

      <div class="panel" id="task-list">
        ${filtered.length ? filtered.map((t) => renderTaskRow(t)).join("") : emptyStateHtml("&#9679;", subjects.length ? "No tasks here yet." : "Add a subject first, then create your first task.")}
      </div>
    `;

    container.querySelectorAll("[data-filter]").forEach((btn) =>
      btn.addEventListener("click", () => {
        currentFilter = btn.dataset.filter;
        render(container);
      })
    );

    container.querySelector("#new-task-btn").addEventListener("click", () => openTaskForm(subjects, () => render(container)));

    attachTaskRowHandlers(container.querySelector("#task-list"), {
      onToggle: async (id, row) => {
        const task = tasks.find((t) => t.id === id);
        const newStatus = task.status === "done" ? "pending" : "done";
        try {
          await api.updateTask(id, { status: newStatus });
          render(container);
        } catch (e) {
          showToast(e.message, true);
        }
      },
      onDelete: async (id) => {
        try {
          await api.deleteTask(id);
          showToast("Task removed");
          render(container);
        } catch (e) {
          showToast(e.message, true);
        }
      },
    });
  }

  function openTaskForm(subjects, onSaved) {
    if (!subjects.length) {
      showToast("Add a subject first", true);
      return;
    }
    openModal(
      `
      <h2>New task</h2>
      <form id="task-form">
        <div class="field">
          <label>Title</label>
          <input name="title" required maxlength="200" placeholder="e.g. Revise differential equations" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Subject</label>
            <select name="subject_id">${subjectOptionsHtml(subjects)}</select>
          </div>
          <div class="field">
            <label>Deadline</label>
            <input type="date" name="deadline" required min="${todayISO()}" />
          </div>
        </div>
        <div class="field">
          <label>Topic (optional)</label>
          <input name="topic" maxlength="100" placeholder="e.g. Differential equations" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>Priority (1-5)</label>
            <input type="number" name="priority" min="1" max="5" value="3" />
          </div>
          <div class="field">
            <label>Difficulty (1-5)</label>
            <input type="number" name="difficulty" min="1" max="5" value="3" />
          </div>
        </div>
        <div class="field">
          <label>Estimated time (minutes)</label>
          <input type="number" name="estimated_minutes" min="5" max="1000" value="60" />
        </div>
        <div class="field">
          <label>Notes (optional)</label>
          <textarea name="description" maxlength="1000"></textarea>
        </div>
        <div class="row" style="justify-content: flex-end; gap: 8px; margin-top: 6px;">
          <button type="button" class="btn" id="cancel-btn">Cancel</button>
          <button type="submit" class="btn btn-primary">Save task</button>
        </div>
      </form>
    `,
      (root) => {
        root.querySelector("#cancel-btn").addEventListener("click", closeModal);
        root.querySelector("#task-form").addEventListener("submit", async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const payload = {
            title: fd.get("title"),
            subject_id: Number(fd.get("subject_id")),
            deadline: fd.get("deadline"),
            topic: fd.get("topic"),
            priority: Number(fd.get("priority")),
            difficulty: Number(fd.get("difficulty")),
            estimated_minutes: Number(fd.get("estimated_minutes")),
            description: fd.get("description"),
          };
          try {
            await api.createTask(payload);
            closeModal();
            showToast("Task added");
            onSaved();
          } catch (err) {
            showToast(err.message, true);
          }
        });
      }
    );
  }

  return { render, openTaskForm };
})();
