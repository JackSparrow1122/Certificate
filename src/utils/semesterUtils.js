const YEAR_ORDINAL_REGEX = /(\d+)/;

export const getYearNumberFromProjectCode = (projectCode) => {
  const raw = String(projectCode || "").trim();
  if (!raw) return null;

  const tokenRegex = /(?:^|[\/-])(\d+)(?:st|nd|rd|th)(?:$|[\/-])/i;
  const tokenMatch = raw.match(tokenRegex);
  if (tokenMatch) {
    const yearNumber = Number.parseInt(tokenMatch[1], 10);
    return Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null;
  }

  const parts = raw
    .split(/[\/-]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const candidate = parts.find((part) => /\d/.test(part)) || "";
  const match = String(candidate).match(YEAR_ORDINAL_REGEX);
  if (!match) return null;

  const yearNumber = Number.parseInt(match[1], 10);
  return Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null;
};

export const getSemesterOptionsFromProjectCode = (projectCode) => {
  const yearNumber = getYearNumberFromProjectCode(projectCode);
  if (!yearNumber) return [];

  const oddSemester = (yearNumber - 1) * 2 + 1;
  const evenSemester = oddSemester + 1;
  return [oddSemester, evenSemester];
};

export const getSemesterType = (semesterNumber) => {
  const sem = Number.parseInt(String(semesterNumber || "").trim(), 10);
  if (!Number.isFinite(sem) || sem <= 0) return "";
  return sem % 2 === 0 ? "even" : "odd";
};

export const buildSemesterDictionary = (projectCode) => {
  const yearNumber = getYearNumberFromProjectCode(projectCode);
  if (!yearNumber) return {};

  const [oddSemester, evenSemester] =
    getSemesterOptionsFromProjectCode(projectCode);
  return {
    [String(yearNumber)]: {
      odd: [oddSemester],
      even: [evenSemester],
      all: [oddSemester, evenSemester],
    },
  };
};

const toSemesterNumber = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const deriveCurrentSemesterFromEnrollments = ({
  enrollments,
  fallback = "-",
}) => {
  const rows = Array.isArray(enrollments) ? enrollments : [];
  const evenSemesters = [];
  const oddSemesters = [];
  let hasEvenType = false;
  let hasOddType = false;

  rows.forEach((item) => {
    const number = toSemesterNumber(item?.semesterNumber);
    if (Number.isFinite(number)) {
      if (number % 2 === 0) {
        evenSemesters.push(number);
      } else {
        oddSemesters.push(number);
      }
      return;
    }

    const type = String(item?.semesterType || "")
      .trim()
      .toLowerCase();
    if (type === "even") hasEvenType = true;
    if (type === "odd") hasOddType = true;
  });

  if (evenSemesters.length > 0) {
    return Math.max(...evenSemesters);
  }

  if (oddSemesters.length > 0) {
    return Math.max(...oddSemesters);
  }

  const fallbackSemester = toSemesterNumber(fallback);
  if (Number.isFinite(fallbackSemester)) {
    if (hasEvenType && fallbackSemester % 2 === 0) return fallbackSemester;
    if (!hasEvenType && hasOddType && fallbackSemester % 2 === 1) {
      return fallbackSemester;
    }
    return fallbackSemester;
  }

  return fallback;
};

export const deriveSemesterDisplayFromEnrollments = ({
  enrollments,
  fallback = "-",
}) => {
  const derived = deriveCurrentSemesterFromEnrollments({
    enrollments,
    fallback,
  });
  const numeric = toSemesterNumber(derived);
  if (Number.isFinite(numeric)) {
    return `Semester ${numeric}`;
  }
  return derived;
};

export const deriveCurrentSemesterNumberFromEnrollments = ({
  enrollments,
  fallback = "-",
}) => {
  const derived = deriveCurrentSemesterFromEnrollments({
    enrollments,
    fallback,
  });
  return toSemesterNumber(derived) ?? derived;
};
