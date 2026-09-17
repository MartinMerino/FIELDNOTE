const VIEWS = {
  dashboard: ViewDashboard,
  schedule: ViewSchedule,
  tasks: ViewTasks,
  subjects: ViewSubjects,
  exams: ViewExams,
  planner: ViewPlanner,
  progress: ViewProgress,
};

function currentViewName() {
  const hash = window.location.hash.replace("#", "");
  return VIEWS[hash] ? hash : "dashboard";
}

function setActiveNav(name) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === name);
  });
}

function navigate() {
  const name = currentViewName();
  setActiveNav(name);
  const main = document.getElementById("main");
  VIEWS[name].render(main);
}

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    window.location.hash = item.dataset.view;
  });
});

window.addEventListener("hashchange", navigate);
window.addEventListener("DOMContentLoaded", navigate);
