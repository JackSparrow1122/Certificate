import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getStudentsByProject,
  getStudentsByProjectPage,
} from "../../../services/studentService";
import { getStudentEnrollmentsByProject } from "../../../services/certificateService";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import StudentModal from "../../components/StudentModal";

const normalizeStatus = (status) => {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (["passed", "completed", "certified"].includes(value)) return "Passed";
  if (["failed"].includes(value)) return "Failed";
  return "Enrolled";
};

const getCurrentYearFromProjectCode = (projectCode) => {
  const parts = String(projectCode || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts[2] : "";
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
      name: String(result?.certificateName || "").trim(),
      status: normalizeStatus(result?.status || result?.result || "enrolled"),
    }))
    .filter((item) => item.name);

  if (normalizedCertificates.length === 0 && student?.certificate) {
    normalizedCertificates.push({
      id: "",
      name: String(student.certificate).trim(),
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
      const certificateName = String(certificateItem?.name || "").trim();
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
  const targetName = String(certificate.name || "")
    .trim()
    .toLowerCase();

  if (!targetName) return false;

  // Check new flat enrollments first (_enrollments attached during load)
  const enrollments = Array.isArray(student?._enrollments)
    ? student._enrollments
    : [];
  if (
    enrollments.some(
      (e) =>
        e.certificateId === targetId ||
        String(e.certificateName || "")
          .trim()
          .toLowerCase() === targetName,
    )
  ) {
    return true;
  }

  // Check certificateItems (computed by toDisplayStudent)
  const certificateItems = Array.isArray(student?.certificateItems)
    ? student.certificateItems
    : [];
  if (
    certificateItems.some(
      (item) =>
        String(item.id || "").trim() === targetId ||
        String(item.name || "")
          .trim()
          .toLowerCase() === targetName,
    )
  ) {
    return true;
  }

  return (
    String(student?.certificate || "")
      .trim()
      .toLowerCase() === targetName
  );
};

const PAGE_SIZE = 50;

export default function Students() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [projectOptions, setProjectOptions] = useState([]);
  const [certificateOptions, setCertificateOptions] = useState([]);
  const [selectedProjectCode, setSelectedProjectCode] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [projectStudents, setProjectStudents] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [serverPageStudents, setServerPageStudents] = useState([]);
  const [serverCursor, setServerCursor] = useState(null);
  const [serverCursorHistory, setServerCursorHistory] = useState([]);
  const [serverNextCursor, setServerNextCursor] = useState(null);
  const [loadingServerPage, setLoadingServerPage] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sortField, setSortField] = useState("id"); // 'id' | 'result'
  const [idSortDir, setIdSortDir] = useState("asc"); // 'asc' | 'desc'
  const [resultSortCycle, setResultSortCycle] = useState(0); // 0=enrolled, 1=passed, 2=failed

  const loadServerPage = async ({
    projectCode,
    cursor = null,
    history = [],
  }) => {
    if (!projectCode) {
      setServerPageStudents([]);
      setServerCursor(null);
      setServerCursorHistory([]);
      setServerNextCursor(null);
      return;
    }

    setLoadingServerPage(true);
    try {
      const response = await getStudentsByProjectPage(projectCode, {
        pageSize: PAGE_SIZE,
        cursor,
      });
      const mappedStudents = (response?.students || []).map(toDisplayStudent);
      setServerPageStudents(mappedStudents);
      setServerCursor(cursor);
      setServerCursorHistory(history);
      setServerNextCursor(
        response?.hasMore ? response?.nextCursor || null : null,
      );
    } catch (error) {
      console.error("Failed to load paged students:", error);
      setServerPageStudents([]);
      setServerNextCursor(null);
    } finally {
      setLoadingServerPage(false);
    }
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

  useEffect(() => {
    let mounted = true;
    const loadProjectData = async () => {
      if (!selectedProjectCode) {
        setCertificateOptions([]);
        setSelectedCertificateId("");
        setProjectStudents([]);
        setServerPageStudents([]);
        setServerCursor(null);
        setServerCursorHistory([]);
        setServerNextCursor(null);
        return;
      }

      try {
        setLoadingStudents(true);
        setSelectedCertificateId("");
        setCurrentPage(1);
        const [studentsByProject, enrollmentsMap] = await Promise.all([
          getStudentsByProject(selectedProjectCode, { maxDocs: 5000 }),
          getStudentEnrollmentsByProject(selectedProjectCode),
        ]);
        if (!mounted) return;

        // Attach enrollment data to each student object
        const studentsWithEnrollments = (studentsByProject || []).map((s) => {
          const studentId = s.docId || s.id || "";
          const enrollments = enrollmentsMap.get(studentId) || [];
          return { ...s, _enrollments: enrollments };
        });

        const mappedStudents = studentsWithEnrollments.map(toDisplayStudent);
        setProjectStudents(mappedStudents);
        setCertificateOptions(
          getCertificateOptionsFromStudents(mappedStudents),
        );
        setServerPageStudents([]);
        setServerCursor(null);
        setServerCursorHistory([]);
        setServerNextCursor(null);
      } catch (error) {
        console.error("Failed to load selected project data:", error);
        if (!mounted) return;
        setProjectStudents([]);
        setCertificateOptions([]);
        setServerPageStudents([]);
        setServerCursor(null);
        setServerCursorHistory([]);
        setServerNextCursor(null);
      } finally {
        if (mounted) setLoadingStudents(false);
      }
    };

    loadProjectData();
    return () => {
      mounted = false;
    };
  }, [selectedProjectCode]);

  const selectedCertificate = useMemo(
    () =>
      certificateOptions.find(
        (certificate) => String(certificate.id) === selectedCertificateId,
      ) || null,
    [certificateOptions, selectedCertificateId],
  );

  const shouldShowAllStudents =
    Boolean(selectedProjectCode) &&
    !loadingStudents &&
    certificateOptions.length === 0;

  const isServerPaginationMode =
    Boolean(selectedProjectCode) && shouldShowAllStudents;

  const students = useMemo(() => {
    if (!selectedProjectCode) return [];
    if (certificateOptions.length === 0) return projectStudents;
    // If no certificate is selected, show ALL students
    if (!selectedCertificate) return projectStudents;
    // If a certificate is selected, filter to only those enrolled in that cert
    return projectStudents.filter((student) =>
      matchesCertificate(student, selectedCertificate),
    );
  }, [
    projectStudents,
    selectedCertificate,
    selectedProjectCode,
    certificateOptions.length,
  ]);

  useEffect(() => {
    setCurrentPage(1);
    setSortField("id");
    setIdSortDir("asc");
    setResultSortCycle(0);
  }, [selectedProjectCode, selectedCertificateId]);

  useEffect(() => {
    if (!isServerPaginationMode) return;
    loadServerPage({
      projectCode: selectedProjectCode,
      cursor: null,
      history: [],
    });
  }, [isServerPaginationMode, selectedProjectCode]);

  // Determine if any student in current filtered list has an Enrolled status
  const hasEnrolledStudents = useMemo(() => {
    return students.some((student) => {
      const items = selectedCertificate
        ? (student.certificateItems || []).filter(
            (item) =>
              String(item.name || "")
                .trim()
                .toLowerCase() ===
              String(selectedCertificate.name || "")
                .trim()
                .toLowerCase(),
          )
        : student.certificateItems || [];
      return items.some((i) => i.status === "Enrolled");
    });
  }, [students, selectedCertificate]);

  const getStudentPrimaryStatus = (student, cycle, withEnrolled) => {
    const items = selectedCertificate
      ? (student.certificateItems || []).filter(
          (item) =>
            String(item.name || "")
              .trim()
              .toLowerCase() ===
            String(selectedCertificate.name || "")
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

  const sortedStudents = useMemo(() => {
    const list = [...students];
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
    students,
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

  const displayedStudents = isServerPaginationMode
    ? serverPageStudents
    : paginatedStudents;

  const serverCurrentPage = serverCursorHistory.length + 1;
  const serverHasPrev = serverCursorHistory.length > 0;
  const serverHasNext = Boolean(serverNextCursor);

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
          Select project code and certificate to view mapped students
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-[#012920] bg-white p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Project Code
            </span>
            <select
              value={selectedProjectCode}
              onChange={(event) => setSelectedProjectCode(event.target.value)}
              className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-colors
              ${loadingProjects ? "border-[#D7E2F1]" : "border-[#D7E2F1]"}
              ${!selectedProjectCode && !loadingProjects ? "ring-2 ring-[#012920] border-[#012920]" : ""}`}
              disabled={loadingProjects}
            >
              <option value="">
                {loadingProjects
                  ? "Loading project codes..."
                  : "Select project code"}
              </option>
              {projectOptions.map((projectOption) => (
                <option
                  key={projectOption.id}
                  value={String(projectOption.code || "")}
                >
                  {projectOption.code}
                </option>
              ))}
            </select>
            {!selectedProjectCode && !loadingProjects && (
              <p className="mt-1 text-xs text-[#012920]">
                <em>Choose a project code to populate the student list.</em>
              </p>
            )}
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
                !selectedProjectCode || loadingStudents || shouldShowAllStudents
              }
            >
              <option value="">
                {!selectedProjectCode
                  ? "Select project code first"
                  : loadingStudents
                    ? "Loading certificates..."
                    : shouldShowAllStudents
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
            {shouldShowAllStudents && (
              <p className="mt-1 text-xs text-blue-600">
                <em>
                  No certificates enrolled for this project. Showing all
                  students.
                </em>
              </p>
            )}
            {selectedProjectCode &&
              !loadingStudents &&
              !shouldShowAllStudents && (
                <p className="mt-1 text-xs text-[#415a77]">
                  <em>
                    Select a certificate to filter, or leave blank to show all.
                  </em>
                </p>
              )}
          </label>
        </div>
      </div>

      {selectedProjectCode && !loadingStudents && (
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
                {(loadingProjects || loadingStudents || loadingServerPage) && (
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
                  !loadingServerPage &&
                  selectedProjectCode &&
                  displayedStudents.length === 0 && (
                    <tr className="bg-gray-50">
                      <td
                        className="px-6 py-6 text-center text-sm text-gray-500"
                        colSpan={5}
                      >
                        No students found for the selected filters.
                      </td>
                    </tr>
                  )}
                {displayedStudents.map((student) => {
                  // Determine which cert items to display based on filter
                  const certItemsToShow = selectedCertificate
                    ? (student.certificateItems || []).filter(
                        (item) =>
                          String(item.name || "")
                            .trim()
                            .toLowerCase() ===
                          String(selectedCertificate.name || "")
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
            !loadingServerPage &&
            ((isServerPaginationMode && (serverHasPrev || serverHasNext)) ||
              (!isServerPaginationMode &&
                sortedStudents.length > PAGE_SIZE)) && (
              <div className="mt-3 flex items-center justify-between px-1">
                <p className="text-xs text-[#415a77]">
                  {isServerPaginationMode
                    ? `Showing page ${serverCurrentPage}`
                    : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, sortedStudents.length)} of ${sortedStudents.length}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isServerPaginationMode) {
                        if (!serverHasPrev) return;
                        const prevCursor =
                          serverCursorHistory[serverCursorHistory.length - 1] ||
                          null;
                        const nextHistory = serverCursorHistory.slice(0, -1);
                        loadServerPage({
                          projectCode: selectedProjectCode,
                          cursor: prevCursor,
                          history: nextHistory,
                        });
                        return;
                      }
                      setCurrentPage((page) => Math.max(1, page - 1));
                    }}
                    disabled={
                      isServerPaginationMode
                        ? !serverHasPrev
                        : currentPage === 1
                    }
                    className="rounded-lg border border-[#D7E2F1] bg-white px-3 py-1.5 text-xs font-medium text-[#0B2A4A] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-medium text-[#0B2A4A]">
                    {isServerPaginationMode
                      ? `Page ${serverCurrentPage}`
                      : `Page ${currentPage} of ${totalPages}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (isServerPaginationMode) {
                        if (!serverHasNext) return;
                        loadServerPage({
                          projectCode: selectedProjectCode,
                          cursor: serverNextCursor,
                          history: [...serverCursorHistory, serverCursor],
                        });
                        return;
                      }
                      setCurrentPage((page) => Math.min(totalPages, page + 1));
                    }}
                    disabled={
                      isServerPaginationMode
                        ? !serverHasNext
                        : currentPage === totalPages
                    }
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
