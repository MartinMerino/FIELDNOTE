/* Shared, dependency-free UI helpers used across views. */

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function showToast(message, isError) {
  const root = document.getElementById("toast-root");
  root.innerHTML = "";
  const el = document.createElement("div");
  el.className = "toast";
  if (isError) el.style.background = "#A6432E";
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => { el.remove(); }, 3200);
}

function openModal(innerHtml, onMount) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal">${innerHtml}</div>
    </div>`;
  root.querySelector("#modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.addEventListener("keydown", escCloseHandler);
  if (onMount) onMount(root);
}

function escCloseHandler(e) {
  if (e.key === "Escape") closeModal();
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
  document.removeEventListener("keydown", escCloseHandler);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function daysUntil(iso) {
  const today = new Date(todayISO() + "T00:00:00");
  const target = new Date(iso + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

function deadlineTag(deadlineIso) {
  const d = daysUntil(deadlineIso);
  if (d < 0) return `<span class="tag urgent">Overdue ${Math.abs(d)}d</span>`;
  if (d === 0) return `<span class="tag urgent">Due today</span>`;
  if (d <= 2) return `<span class="tag warn">Due in ${d}d</span>`;
  return `<span class="tag neutral">${formatDate(deadlineIso)}</span>`;
}

function priorityLabel(p) {
  return ["", "Low", "Mild", "Medium", "High", "Critical"][p] || "Medium";
}

function minutesLabel(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* Renders a single task row (used on Dashboard and Tasks views). */
function renderTaskRow(task, { onToggle, onDelete } = {}) {
  const isDone = task.status === "done";
  return `
    <div class="task-row" data-task-id="${task.id}">
      <div class="task-check ${isDone ? "done" : ""}" data-action="toggle">${isDone ? "&#10003;" : ""}</div>
      <div class="task-main">
        <div class="task-title ${isDone ? "done" : ""}">${escapeHtml(task.title)}</div>
        <div class="task-meta">
          <span class="row" style="gap:5px;"><span class="subject-dot" style="background:${task.subject_color || "#999"}"></span>${escapeHtml(task.subject_name || "")}</span>
          ${!isDone ? deadlineTag(task.deadline) : ""}
          <span>${priorityLabel(task.priority)} priority</span>
          <span>${minutesLabel(task.estimated_minutes)}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" data-action="delete" title="Delete task">Remove</button>
    </div>`;
}

function attachTaskRowHandlers(container, { onToggle, onDelete }) {
  container.querySelectorAll(".task-row").forEach((row) => {
    const id = Number(row.dataset.taskId);
    row.querySelector('[data-action="toggle"]').addEventListener("click", () => onToggle(id, row));
    const delBtn = row.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener("click", () => onDelete(id));
  });
}

function loadingHtml(label) {
  return `<div class="empty-state"><div class="glyph">&hellip;</div>${escapeHtml(label || "Loading")}</div>`;
}

function emptyStateHtml(glyph, message) {
  return `<div class="empty-state"><div class="glyph">${glyph}</div>${escapeHtml(message)}</div>`;
}

/* Builds a <select> of subjects, returned as an HTML string. */
function subjectOptionsHtml(subjects, selectedId) {
  return subjects
    .map(
      (s) =>
        `<option value="${s.id}" ${String(s.id) === String(selectedId) ? "selected" : ""}>${escapeHtml(s.name)}</option>`
    )
    .join("");
}
