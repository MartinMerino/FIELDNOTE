/* Thin wrapper around fetch() for the backend API.
   Every function returns a Promise resolving to parsed JSON, and throws
   an Error with a readable message on failure so callers can display it. */
const api = (() => {
  async function request(method, path, body) {
    const opts = { method, headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // no body
    }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      err.aiUnavailable = data && data.ai_unavailable;
      throw err;
    }
    return data;
  }

  return {
    // Subjects
    getSubjects: () => request("GET", "/api/subjects"),
    createSubject: (data) => request("POST", "/api/subjects", data),
    deleteSubject: (id) => request("DELETE", `/api/subjects/${id}`),

    // Exams
    getExams: () => request("GET", "/api/exams"),
    createExam: (data) => request("POST", "/api/exams", data),
    deleteExam: (id) => request("DELETE", `/api/exams/${id}`),

    // Tasks
    getTasks: (status) => request("GET", `/api/tasks${status ? "?status=" + status : ""}`),
    createTask: (data) => request("POST", "/api/tasks", data),
    updateTask: (id, data) => request("PUT", `/api/tasks/${id}`, data),
    deleteTask: (id) => request("DELETE", `/api/tasks/${id}`),

    // Profile
    getProfile: () => request("GET", "/api/profile"),
    updateProfile: (data) => request("PUT", "/api/profile", data),
    addWeakTopic: (topic) => request("POST", `/api/profile/weak-topics/${encodeURIComponent(topic)}`),
    removeWeakTopic: (topic) => request("DELETE", `/api/profile/weak-topics/${encodeURIComponent(topic)}`),

    // Schedule / dashboard / progress
    getSchedule: () => request("GET", "/api/schedule"),
    getDashboard: () => request("GET", "/api/dashboard"),
    getProgress: () => request("GET", "/api/progress"),

    // AI
    aiStatus: () => request("GET", "/api/ai/status"),
    aiParse: (description) => request("POST", "/api/ai/parse", { description }),
    aiBreakdown: (topic, subject_name, minutes_available) =>
      request("POST", "/api/ai/breakdown", { topic, subject_name, minutes_available }),
    aiAsk: (question) => request("POST", "/api/ai/ask", { question }),
  };
})();
