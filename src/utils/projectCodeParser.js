const COURSE_LABELS = {
  ENGG: "Engineering",
  ENG: "Engineering",
  MBA: "MBA",
};

const TRAINING_TYPE_LABELS = {
  OT: "On Training",
  UT: "Under Training",
};

const normalizeCourse = (courseCode) => {
  const cleaned = String(courseCode || "").trim().toUpperCase();
  return COURSE_LABELS[cleaned] || String(courseCode || "").trim();
};

const normalizeTrainingType = (typeCode) => {
  const cleaned = String(typeCode || "").trim().toUpperCase();
  return TRAINING_TYPE_LABELS[cleaned] || String(typeCode || "").trim();
};

const normalizeSessionStartYear = (sessionCode) => {
  const firstPart = String(sessionCode || "").split("-")[0]?.trim();
  if (!firstPart) return "";
  if (/^\d{4}$/.test(firstPart)) return firstPart;
  if (/^\d{2}$/.test(firstPart)) return `20${firstPart}`;
  return "";
};

const extractSemesterNumber = (semesterLabel) => {
  const match = String(semesterLabel || "").match(/\d+/);
  return match ? match[0] : "";
};

export const parseProjectCode = (projectCode) => {
  const parts = String(projectCode || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  const [collegeCode = "", courseCode = "", semesterLabel = "", trainingTypeCode = "", session = ""] = parts;

  return {
    collegeCode,
    courseCode,
    courseLabel: normalizeCourse(courseCode),
    semesterLabel,
    semesterNumber: extractSemesterNumber(semesterLabel),
    trainingTypeCode,
    trainingTypeLabel: normalizeTrainingType(trainingTypeCode),
    session,
    sessionStartYear: normalizeSessionStartYear(session),
    isStructured: parts.length >= 5,
  };
};
