const STUDENT_SESSION_KEY = "student_session_v1";
const STUDENT_SESSION_EVENT = "erp:student-session-changed";

const dispatchStudentSessionEvent = () => {
  try {
    window.dispatchEvent(new CustomEvent(STUDENT_SESSION_EVENT));
  } catch {
    // no-op
  }
};

export const getStudentSession = () => {
  try {
    const raw = localStorage.getItem(STUDENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (String(parsed.role || "").toLowerCase() !== "student") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const setStudentSession = (sessionData) => {
  const payload = {
    ...(sessionData || {}),
    role: "student",
    createdAt: Date.now(),
  };
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(payload));
  localStorage.setItem("role", "student");
  dispatchStudentSessionEvent();
  return payload;
};

export const clearStudentSession = () => {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  dispatchStudentSessionEvent();
};

export const STUDENT_SESSION_CHANGED_EVENT = STUDENT_SESSION_EVENT;
