const YEAR_ORDINAL_REGEX = /(\d+)/;

export const getYearNumberFromProjectCode = (projectCode) => {
  const parts = String(projectCode || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) return null;
  const yearToken = parts[2];
  const match = String(yearToken).match(YEAR_ORDINAL_REGEX);
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

export const deriveSemesterDisplayFromEnrollments = ({
  enrollments,
  fallback = "-",
}) => {
  const rows = Array.isArray(enrollments) ? enrollments : [];

  const hasEven = rows.some((item) => {
    const type = String(item?.semesterType || "")
      .trim()
      .toLowerCase();
    if (type === "even") return true;

    const number = Number.parseInt(
      String(item?.semesterNumber || "").trim(),
      10,
    );
    return Number.isFinite(number) && number > 0 && number % 2 === 0;
  });

  if (hasEven) return "Even";

  const hasOdd = rows.some((item) => {
    const type = String(item?.semesterType || "")
      .trim()
      .toLowerCase();
    if (type === "odd") return true;

    const number = Number.parseInt(
      String(item?.semesterNumber || "").trim(),
      10,
    );
    return Number.isFinite(number) && number > 0 && number % 2 === 1;
  });

  if (hasOdd) return "Odd";

  return fallback;
};
