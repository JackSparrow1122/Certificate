import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getStudentsByProject } from "../../../services/studentService";
import { getStudentEnrollmentsByProject } from "../../../services/certificateService";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import { parseProjectCode } from "../../utils/projectCodeParser";
import StudentModal from "../../components/StudentModal";

const normalizeStatus = (status) => {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (["passed", "completed", "certified"].includes(value)) return "Passed";
  if (["failed"].includes(value)) return "Failed";
  return "Enrolled";
};

const normalizeCertificateName = (name) =>
  String(name || "")
    .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const getCurrentYearFromProjectCode = (projectCode) => {
  const parts = String(projectCode || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts[2] : "";
};

const normalizeYearToken = (value) => {
  const token = String(value || "").trim();
  if (!token) return "";
  if (/^\d{4}$/.test(token)) return token;
  if (/^\d{2}$/.test(token)) return `20${token}`;
  return token;
};

const getPassingYearFromAcademicYear = (academicYear) => {
  const text = String(academicYear || "").trim();
  if (!text) return "";

  const parts = text
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return normalizeYearToken(parts[1]);
  }

  return normalizeYearToken(parts[0]);
};

const getProjectCourse = (projectOption) => {
  const explicitCourse = String(projectOption?.course || "").trim();
  if (explicitCourse) return explicitCourse;
  return parseProjectCode(projectOption?.code || "").courseLabel || "";
};

const getProjectYear = (projectOption) => {
  const explicitYear = String(projectOption?.year || "").trim();
  if (explicitYear) return explicitYear;

  const parsedProject = parseProjectCode(projectOption?.code || "");
  return parsedProject.semesterLabel || parsedProject.semesterNumber || "";
};

const getProjectPassingYear = (projectOption) => {
  const code = String(projectOption?.code || "").trim();
  if (code) {
    const parts = code
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts[parts.length - 1];
    }
  }

  const parsedProject = parseProjectCode(projectOption?.code || "");
  if (parsedProject.session) {
    return String(parsedProject.session).trim();
  }

  const explicitAcademicYear = String(projectOption?.academicYear || "").trim();
  return explicitAcademicYear;
};

const toDisplayStudent = (student) => {
  const official = student?.OFFICIAL_DETAILS || {};

  // Prefer enrollment data from the new flat certificate_enrollments subcollection
  const enrollments = Array.isArray(student?._enrollments)
    ? student._enrollments
    : [];

  // Fallback to legacy certificateResults stored on the student doc
  const legacyResults =
    enrollments.length === 0 &&
    student?.certificateResults &&
    typeof student.certificateResults === "object"
      ? Object.values(student.certificateResults)
      : [];

  const source = enrollments.length > 0 ? enrollments : legacyResults;

  const normalizedCertificates = source
    .filter((result) => !result?.isDeleted)
    .map((result) => ({
      id: String(result?.certificateId || "").trim(),
      name: normalizeCertificateName(result?.certificateName),
      status: normalizeStatus(result?.status || result?.result || "enrolled"),
    }))
    .filter((item) => item.name);

  if (normalizedCertificates.length === 0 && student?.certificate) {
    normalizedCertificates.push({
      id: "",
      name: normalizeCertificateName(student.certificate),
      status: normalizeStatus(student?.certificateStatus || "enrolled"),
    });
  }

  const projectCode = student?.projectCode || student?.projectId || "-";
  const currentYearFromCode = getCurrentYearFromProjectCode(projectCode);

  return {
    ...student,
    id: student?.id || official.SN || student?.docId || "-",
    name:
      student?.name ||
      official["FULL NAME OF STUDENT"] ||
      student?.fullName ||
      "-",
    email:
      student?.email || official["EMAIL_ID"] || official["EMAIL_ID."] || "-",
    currentYear:
      currentYearFromCode ||
      student?.currentYear ||
      student?.currentSemester ||
      student?.semesterLabel ||
      "-",
    projectCode,
    enrolledCertificates:
      normalizedCertificates.length > 0
        ? normalizedCertificates.map((item) => item.name).join(", ")
        : "-",
    certificateStatusSummary:
      normalizedCertificates.length > 0
        ? normalizedCertificates
            .map((item) => `${item.name}: ${item.status}`)
            .join(" | ")
        : "-",
    certificateItems: normalizedCertificates,
  };
};

const getCertificateOptionsFromStudents = (students) => {
  const optionsByKey = new Map();

  (students || []).forEach((student) => {
    const certificateItems = Array.isArray(student?.certificateItems)
      ? student.certificateItems
      : [];

    certificateItems.forEach((certificateItem) => {
      const certificateName = normalizeCertificateName(certificateItem?.name);
      if (!certificateName) return;

      const certificateId = String(certificateItem?.id || "").trim();
      const optionId = certificateId || `name:${certificateName.toLowerCase()}`;

      if (!optionsByKey.has(optionId)) {
        optionsByKey.set(optionId, {
          id: optionId,
          actualId: certificateId,
          name: certificateName,
        });
      }
    });
  });

  return Array.from(optionsByKey.values()).sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
};

const matchesCertificate = (student, certificate) => {
  if (!certificate) return false;

  const targetId = String(certificate.id || "").trim();
  const targetName = normalizeCertificateName(certificate.name).toLowerCase();

  if (!targetName) return false;

  const enrollments = Array.isArray(student?._enrollments)
    ? student._enrollments
    : [];
  if (
    enrollments.some(
      (enrollment) =>
        enrollment.certificateId === targetId ||
        normalizeCertificateName(enrollment.certificateName).toLowerCase() ===
          targetName,
    )
  ) {
    return true;
  }

  const certificateItems = Array.isArray(student?.certificateItems)
    ? student.certificateItems
    : [];
  if (
    certificateItems.some(
      (item) =>
        String(item.id || "").trim() === targetId ||
        normalizeCertificateName(item.name).toLowerCase() === targetName,
    )
  ) {
    return true;
  }

  return (
    normalizeCertificateName(student?.certificate).toLowerCase() === targetName
  );
};

const PAGE_SIZE = 50;

export default function Students() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [projectOptions, setProjectOptions] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedPassingYear, setSelectedPassingYear] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [students, setStudents] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sortField, setSortField] = useState("id"); // 'id' | 'result'
  const [idSortDir, setIdSortDir] = useState("asc"); // 'asc' | 'desc'
  const [resultSortCycle, setResultSortCycle] = useState(0); // 0=enrolled, 1=passed, 2=failed

  const getPassingYearOptionsForSelection = (courseValue, yearValue) => {
    const passingYearSet = new Set();

    (projectOptions || []).forEach((projectOption) => {
      const optionCourse = getProjectCourse(projectOption);
      const optionYear = getProjectYear(projectOption);

      if (courseValue && optionCourse !== courseValue) return;
      if (yearValue && optionYear !== yearValue) return;

      const passingYear = getProjectPassingYear(projectOption);
      if (passingYear) passingYearSet.add(passingYear);
    });

    return Array.from(passingYearSet).sort((a, b) =>
      String(b).localeCompare(String(a), undefined, { numeric: true }),
    );
  };

  useEffect(() => {
    let mounted = true;
    const loadProjectOptions = async () => {
      try {
        setLoadingProjects(true);
        const profileCollegeCode = String(
          profile?.collegeCode || profile?.college_code || "",
        )
          .trim()
          .toUpperCase();
        if (!profileCollegeCode) {
          if (mounted) setProjectOptions([]);
          return;
        }

        const allProjectCodes =
          await getProjectCodesByCollege(profileCollegeCode);
        const filteredProjectOptions = (allProjectCodes || [])
          .filter((projectCode) => String(projectCode?.code || "").trim())
          .sort((a, b) =>
            String(a.code || "").localeCompare(String(b.code || "")),
          );

        if (!mounted) return;
        setProjectOptions(filteredProjectOptions);
      } catch (error) {
        console.error("Failed to load project options:", error);
        if (mounted) setProjectOptions([]);
      } finally {
        if (mounted) setLoadingProjects(false);
      }
    };

    loadProjectOptions();
    return () => {
      mounted = false;
    };
  }, [profile]);

  const courseOptions = useMemo(() => {
    const courseSet = new Set();
    (projectOptions || []).forEach((projectOption) => {
      const course = getProjectCourse(projectOption);
      if (course) courseSet.add(course);
    });
    return Array.from(courseSet).sort((a, b) => a.localeCompare(b));
  }, [projectOptions]);

  const yearOptions = useMemo(() => {
    const yearSet = new Set();
    (projectOptions || []).forEach((projectOption) => {
      const year = getProjectYear(projectOption);
      if (year) yearSet.add(year);
    });
    return Array.from(yearSet).sort((a, b) => {
      const aNum = Number.parseInt(String(a).replace(/\D/g, ""), 10);
      const bNum = Number.parseInt(String(b).replace(/\D/g, ""), 10);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
        return aNum - bNum;
      }
      return String(a).localeCompare(String(b));
    });
  }, [projectOptions]);

  const passingYearOptions = useMemo(() => {
    const passingYearSet = new Set();
    (projectOptions || []).forEach((projectOption) => {
      const passingYear = getProjectPassingYear(projectOption);
      if (passingYear) passingYearSet.add(passingYear);
    });
    return Array.from(passingYearSet).sort((a, b) =>
      String(b).localeCompare(String(a), undefined, { numeric: true }),
    );
  }, [projectOptions]);

  const filteredPassingYearOptions = useMemo(() => {
    if (!selectedCourse && !selectedYear) return passingYearOptions;
    return getPassingYearOptionsForSelection(selectedCourse, selectedYear);
  }, [projectOptions, selectedCourse, selectedYear, passingYearOptions]);

  const hasActiveFilters =
    Boolean(selectedCourse) ||
    Boolean(selectedYear) ||
    Boolean(selectedPassingYear);

  const matchingProjectCodes = useMemo(() => {
    if (!hasActiveFilters) return [];

    return (projectOptions || [])
      .filter((projectOption) => {
        const optionCourse = getProjectCourse(projectOption);
        const optionYear = getProjectYear(projectOption);
        const optionPassingYear = getProjectPassingYear(projectOption);

        if (selectedCourse && optionCourse !== selectedCourse) return false;
        if (selectedYear && optionYear !== selectedYear) return false;
        if (selectedPassingYear && optionPassingYear !== selectedPassingYear)
          return false;
        return true;
      })
      .map((projectOption) => String(projectOption?.code || "").trim())
      .filter(Boolean);
  }, [
    projectOptions,
    selectedCourse,
    selectedYear,
    selectedPassingYear,
    hasActiveFilters,
  ]);

  const certificateOptions = useMemo(
    () => getCertificateOptionsFromStudents(students),
    [students],
  );

  const selectedCertificate = useMemo(
    () =>
      certificateOptions.find(
        (certificate) => String(certificate.id) === selectedCertificateId,
      ) || null,
    [certificateOptions, selectedCertificateId],
  );

  useEffect(() => {
    let mounted = true;
    const loadFilteredStudents = async () => {
      if (!hasActiveFilters) {
        setStudents([]);
        setCurrentPage(1);
        return;
      }

      if (matchingProjectCodes.length === 0) {
        setStudents([]);
        setCurrentPage(1);
        return;
      }

      try {
        setLoadingStudents(true);
        setCurrentPage(1);

        const studentsByProjectCode = await Promise.all(
          matchingProjectCodes.map(async (projectCode) => {
            const [studentsForProject, enrollmentsMap] = await Promise.all([
              getStudentsByProject(projectCode, { maxDocs: 5000 }),
              getStudentEnrollmentsByProject(projectCode),
            ]);

            return (studentsForProject || []).map((student) => {
              const studentId = student.docId || student.id || "";
              const enrollments = enrollmentsMap.get(studentId) || [];
              return toDisplayStudent({
                ...student,
                projectCode: student?.projectCode || projectCode,
                _enrollments: enrollments,
              });
            });
          }),
        );

        if (!mounted) return;

        setStudents(studentsByProjectCode.flat());
      } catch (error) {
        console.error("Failed to load filtered students:", error);
        if (!mounted) return;
        setStudents([]);
      } finally {
        if (mounted) setLoadingStudents(false);
      }
    };

    loadFilteredStudents();
    return () => {
      mounted = false;
    };
  }, [hasActiveFilters, matchingProjectCodes]);

  useEffect(() => {
    setSelectedCertificateId("");
  }, [selectedCourse, selectedYear, selectedPassingYear]);

  useEffect(() => {
    if (!selectedCertificateId) return;
    const exists = certificateOptions.some(
      (certificate) => String(certificate.id) === selectedCertificateId,
    );
    if (!exists) {
      setSelectedCertificateId("");
    }
  }, [certificateOptions, selectedCertificateId]);

  const filteredStudents = useMemo(() => {
    if (!selectedCertificate) return students;
    return students.filter((student) =>
      matchesCertificate(student, selectedCertificate),
    );
  }, [students, selectedCertificate]);

  useEffect(() => {
    setCurrentPage(1);
    setSortField("id");
    setIdSortDir("asc");
    setResultSortCycle(0);
  }, [
    selectedCourse,
    selectedYear,
    selectedPassingYear,
    selectedCertificateId,
  ]);

  const hasEnrolledStudents = useMemo(() => {
    return filteredStudents.some((student) => {
      const items = selectedCertificate
        ? (student.certificateItems || []).filter(
            (item) =>
              String(item.name || "")
                .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
                .trim()
                .toLowerCase() ===
              String(selectedCertificate.name || "")
                .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
                .trim()
                .toLowerCase(),
          )
        : student.certificateItems || [];
      return items.some((i) => i.status === "Enrolled");
    });
  }, [filteredStudents, selectedCertificate]);

  const getStudentPrimaryStatus = (student, cycle, withEnrolled) => {
    const items = selectedCertificate
      ? (student.certificateItems || []).filter(
          (item) =>
            String(item.name || "")
              .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
              .trim()
              .toLowerCase() ===
            String(selectedCertificate.name || "")
              .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
              .trim()
              .toLowerCase(),
        )
      : student.certificateItems || [];

    // Return the status that ranks highest in the current sort cycle
    const statuses = items.map((i) => i.status);
    if (withEnrolled) {
      if (cycle === 0) {
        if (statuses.some((s) => s === "Enrolled")) return "Enrolled";
        if (statuses.some((s) => s === "Passed")) return "Passed";
        return "Failed";
      }
      if (cycle === 1) {
        if (statuses.some((s) => s === "Passed")) return "Passed";
        if (statuses.some((s) => s === "Enrolled")) return "Enrolled";
        return "Failed";
      }
      // cycle === 2
      if (statuses.some((s) => s === "Failed")) return "Failed";
      if (statuses.some((s) => s === "Passed")) return "Passed";
      return "Enrolled";
    } else {
      // only pass/fail
      if (cycle === 0) {
        if (statuses.some((s) => s === "Passed")) return "Passed";
        return "Failed";
      }
      // cycle === 1
      if (statuses.some((s) => s === "Failed")) return "Failed";
      return "Passed";
    }
  };

  const getStatusRank = (status, cycle, withEnrolled) => {
    if (withEnrolled) {
      if (cycle === 0)
        return status === "Enrolled" ? 0 : status === "Passed" ? 1 : 2;
      if (cycle === 1)
        return status === "Passed" ? 0 : status === "Enrolled" ? 1 : 2;
      return status === "Failed" ? 0 : status === "Passed" ? 1 : 2;
    } else {
      // only pass/fail — 2-step cycle
      if (cycle === 0) return status === "Passed" ? 0 : 1;
      return status === "Failed" ? 0 : 1;
    }
  };

  const handleIdSortClick = () => {
    if (sortField !== "id") {
      setSortField("id");
      setIdSortDir("asc");
    } else {
      setIdSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
    setCurrentPage(1);
  };

  const handleResultSortClick = () => {
    if (sortField !== "result") {
      setSortField("result");
      setResultSortCycle(0);
    } else {
      const maxCycle = hasEnrolledStudents ? 3 : 2;
      setResultSortCycle((c) => (c + 1) % maxCycle);
    }
    setCurrentPage(1);
  };

  const handleCourseChange = (courseValue) => {
    setSelectedCourse(courseValue);

    if (!courseValue) {
      setSelectedYear("");
      setSelectedPassingYear("");
      return;
    }

    if (!selectedYear) return;
    const nextPassingYearOptions = getPassingYearOptionsForSelection(
      courseValue,
      selectedYear,
    );
    setSelectedPassingYear(nextPassingYearOptions[0] || "");
  };

  const handleYearChange = (yearValue) => {
    setSelectedYear(yearValue);

    if (!yearValue) {
      setSelectedPassingYear("");
      return;
    }

    const nextPassingYearOptions = getPassingYearOptionsForSelection(
      selectedCourse,
      yearValue,
    );
    setSelectedPassingYear(nextPassingYearOptions[0] || "");
  };

  const handleResetFilters = () => {
    setSelectedCourse("");
    setSelectedYear("");
    setSelectedPassingYear("");
    setSelectedCertificateId("");
  };

  const sortedStudents = useMemo(() => {
    const list = [...filteredStudents];
    if (sortField === "id") {
      list.sort((a, b) => {
        const cmp = String(a.id || "").localeCompare(
          String(b.id || ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
        return idSortDir === "asc" ? cmp : -cmp;
      });
    } else if (sortField === "result") {
      list.sort((a, b) => {
        const aRank = getStatusRank(
          getStudentPrimaryStatus(a, resultSortCycle, hasEnrolledStudents),
          resultSortCycle,
          hasEnrolledStudents,
        );
        const bRank = getStatusRank(
          getStudentPrimaryStatus(b, resultSortCycle, hasEnrolledStudents),
          resultSortCycle,
          hasEnrolledStudents,
        );
        if (aRank !== bRank) return aRank - bRank;
        return String(a.id || "").localeCompare(String(b.id || ""), undefined, {
          numeric: true,
        });
      });
    }
    return list;
  }, [
    filteredStudents,
    sortField,
    idSortDir,
    resultSortCycle,
    hasEnrolledStudents,
    selectedCertificate,
  ]);

  const totalPages = Math.max(1, Math.ceil(sortedStudents.length / PAGE_SIZE));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedStudents.slice(start, start + PAGE_SIZE);
  }, [sortedStudents, currentPage, PAGE_SIZE]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-semibold leading-tight text-[#012920] sm:text-4xl">
          Students
        </h1>
        <p className="text-sm text-[#012920]">
          Filter students by course, year, and passing year from project code
          data
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-[#012920] bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Course
            </span>
            <select
              value={selectedCourse}
              onChange={(event) => handleCourseChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none transition-colors"
              disabled={loadingProjects}
            >
              <option value="">All Courses</option>
              {courseOptions.map((course) => (
                <option key={course} value={course}>
                  {course}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Year
            </span>
            <select
              value={selectedYear}
              onChange={(event) => handleYearChange(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none transition-colors"
              disabled={loadingProjects || !selectedCourse}
            >
              <option value="">
                {!selectedCourse ? "Select course first" : "All Years"}
              </option>
              {yearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Certificate
            </span>
            <select
              value={selectedCertificateId}
              onChange={(event) => setSelectedCertificateId(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none transition-colors"
              disabled={
                !hasActiveFilters ||
                loadingStudents ||
                certificateOptions.length === 0
              }
            >
              <option value="">
                {!hasActiveFilters
                  ? "Select filters first"
                  : loadingStudents
                    ? "Loading certificates..."
                    : certificateOptions.length === 0
                      ? "No certificates enrolled"
                      : "All Certificates"}
              </option>
              {certificateOptions.map((certificate) => (
                <option
                  key={certificate.id}
                  value={String(certificate.id || "")}
                >
                  {certificate.name || certificate.id}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Passing Year
            </span>
            <select
              value={selectedPassingYear}
              onChange={(event) => setSelectedPassingYear(event.target.value)}
              className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none transition-colors"
              disabled={
                loadingProjects || filteredPassingYearOptions.length === 0
              }
            >
              <option value="">All Passing Years</option>
              {filteredPassingYearOptions.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleResetFilters}
            className="rounded-lg border border-[#012920] bg-white px-3 py-1.5 text-sm font-medium text-[#012920] transition-colors hover:bg-[#F0F7F5]"
            disabled={
              !selectedCourse &&
              !selectedYear &&
              !selectedPassingYear &&
              !selectedCertificateId
            }
          >
            Reset Filters
          </button>
        </div>

        {!hasActiveFilters && !loadingProjects && (
          <p className="mt-2 text-xs text-[#012920]">
            <em>Select at least one filter to load students.</em>
          </p>
        )}
      </div>

      {hasActiveFilters && (
        <div className="rounded-2xl border border-[#012920] bg-white p-4 sm:p-5">
          <div className="mb-2 px-3">
            <h2 className="text-lg font-semibold text-[#0B2A4A]">
              Student Master List
            </h2>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#D7E2F1] bg-white">
            <table className="min-w-full divide-y divide-[#E6EDF6]">
              <thead className="bg-[#012920]">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-white">
                    <button
                      type="button"
                      onClick={handleIdSortClick}
                      className="flex items-center gap-2 px-1 py-0.5 transition-colors"
                      title={
                        sortField === "id"
                          ? idSortDir === "asc"
                            ? "Sorted A→Z (click for Z→A)"
                            : "Sorted Z→A (click for A→Z)"
                          : "Sort by Student ID"
                      }
                    >
                      Student ID
                      <span className="text-[14px] leading-none">
                        {sortField === "id" ? (
                          idSortDir === "asc" ? (
                            "▲"
                          ) : (
                            "▼"
                          )
                        ) : (
                          <span className="opacity-30">⇅</span>
                        )}
                      </span>
                    </button>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    Email Id
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                    Current Year
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wider text-white">
                    <button
                      type="button"
                      onClick={handleResultSortClick}
                      className="flex items-center gap-2 px-1 py-0.5 transition-colors"
                      title={
                        sortField !== "result"
                          ? "Sort by Result Status"
                          : hasEnrolledStudents
                            ? [
                                "Enrolled first (click for Passed first)",
                                "Passed first (click for Failed first)",
                                "Failed first (click for Enrolled first)",
                              ][resultSortCycle]
                            : [
                                "Passed first (click for Failed first)",
                                "Failed first (click for Passed first)",
                              ][resultSortCycle]
                      }
                    >
                      Result Status
                      <span className="text-[14px] leading-none">
                        {sortField === "result" ? (
                          <span
                            className={
                              hasEnrolledStudents
                                ? [
                                    "text-blue-500",
                                    "text-green-600",
                                    "text-red-500",
                                  ][resultSortCycle]
                                : ["text-green-600", "text-red-500"][
                                    resultSortCycle
                                  ]
                            }
                          >
                            {hasEnrolledStudents
                              ? ["●E", "●P", "●F"][resultSortCycle]
                              : ["●P", "●F"][resultSortCycle]}
                          </span>
                        ) : (
                          <span className="opacity-30">⇅</span>
                        )}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#E6EDF6] bg-white">
                {(loadingProjects || loadingStudents) && (
                  <tr className="bg-gray-50">
                    <td
                      className="px-6 py-6 text-center text-sm text-gray-500"
                      colSpan={5}
                    >
                      Loading students...
                    </td>
                  </tr>
                )}
                {!loadingProjects &&
                  !loadingStudents &&
                  hasActiveFilters &&
                  paginatedStudents.length === 0 && (
                    <tr className="bg-gray-50">
                      <td
                        className="px-6 py-6 text-center text-sm text-gray-500"
                        colSpan={5}
                      >
                        No students found for the selected filters.
                      </td>
                    </tr>
                  )}
                {paginatedStudents.map((student) => {
                  const certItemsToShow = selectedCertificate
                    ? (student.certificateItems || []).filter(
                        (item) =>
                          String(item.name || "")
                            .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
                            .trim()
                            .toLowerCase() ===
                          String(selectedCertificate.name || "")
                            .replace(/\s*\(\s*all\s*\)\s*/gi, " ")
                            .trim()
                            .toLowerCase(),
                      )
                    : student.certificateItems || [];

                  return (
                    <tr
                      key={`${student.projectCode || student.projectId || "NA"}-${student.id || student.docId || student.email || student.name}`}
                      onClick={() => setSelectedStudent(student)}
                      className="cursor-pointer transition"
                      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
                    >
                      <td className="wrap-break-word px-6 py-4 text-sm font-medium text-[#0B2A4A]">
                        {student.id}
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.name}
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.email}
                      </td>
                      <td className="px-6 py-4 wrap-break-word">
                        <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                          {student.currentYear || "-"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {certItemsToShow.length === 0 ? (
                          <span className="text-sm text-gray-400">-</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {certItemsToShow.map((item, idx) => {
                              const statusColor =
                                item.status === "Passed"
                                  ? "bg-green-100 text-green-700"
                                  : item.status === "Failed"
                                    ? "bg-red-100 text-red-600"
                                    : "bg-blue-100 text-blue-700";
                              return (
                                <span
                                  key={item.id || idx}
                                  className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}
                                >
                                  {item.name}: {item.status}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loadingProjects &&
            !loadingStudents &&
            sortedStudents.length > PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between px-1">
                <p className="text-xs text-[#415a77]">
                  {`Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, sortedStudents.length)} of ${sortedStudents.length}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((page) => Math.max(1, page - 1));
                    }}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-[#D7E2F1] bg-white px-3 py-1.5 text-xs font-medium text-[#0B2A4A] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-medium text-[#0B2A4A]">
                    {`Page ${currentPage} of ${totalPages}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPage((page) => Math.min(totalPages, page + 1));
                    }}
                    disabled={currentPage === totalPages}
                    className="rounded-lg border border-[#D7E2F1] bg-white px-3 py-1.5 text-xs font-medium text-[#0B2A4A] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      <StudentModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
