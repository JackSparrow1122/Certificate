const parseSemesterNumber = (value) => {
  const match = String(value || "")
    .trim()
    .match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getCurrentYearFromProjectCode = (projectCodeValue) => {
  const parts = String(projectCodeValue || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length >= 3 ? parts[2] : "";
};

export const deriveCurrentSemesterFromEnrollments = (
  enrollments = [],
  fallback = "",
) => {
  const semesterNumbers = (Array.isArray(enrollments) ? enrollments : [])
    .map((entry) =>
      parseSemesterNumber(
        entry?.assignedSemesterNumber || entry?.semesterNumber || "",
      ),
    )
    .filter((value) => Number.isFinite(value));

  if (semesterNumbers.length === 0) {
    return String(fallback || "").trim();
  }

  const evenSemesters = semesterNumbers.filter((value) => value % 2 === 0);
  const oddSemesters = semesterNumbers.filter((value) => value % 2 !== 0);

  const selected =
    evenSemesters.length > 0
      ? Math.max(...evenSemesters)
      : Math.max(...oddSemesters);

  return `${selected}`;
};

export const deriveHighestSemesterFromEnrollments = (
  enrollments = [],
  fallback = "",
) => {
  const semesterNumbers = (Array.isArray(enrollments) ? enrollments : [])
    .map((entry) =>
      parseSemesterNumber(
        entry?.assignedSemesterNumber || entry?.semesterNumber || "",
      ),
    )
    .filter((value) => Number.isFinite(value));

  if (semesterNumbers.length === 0) {
    return String(fallback || "").trim();
  }

  return `${Math.max(...semesterNumbers)}`;
};
