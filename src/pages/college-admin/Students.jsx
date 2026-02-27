import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getStudentsByProject,
  getStudentsByProjectPage,
} from "../../../services/studentService";
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
  const certificateResults =
    student?.certificateResults &&
    typeof student.certificateResults === "object"
      ? Object.values(student.certificateResults)
      : [];

  const normalizedCertificates = certificateResults
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
      student?.email || official["EMAIL ID"] || official["EMAIL ID."] || "-",
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

  const certificateIds = Array.isArray(student?.certificateIds)
    ? student.certificateIds.map((id) => String(id).trim())
    : [];
  if (targetId && certificateIds.includes(targetId)) {
    return true;
  }

  const resultMap =
    student?.certificateResults &&
    typeof student.certificateResults === "object"
      ? student.certificateResults
      : {};

  if (targetId && resultMap[targetId]) {
    return true;
  }

  const resultNameMatch = Object.values(resultMap).some(
    (entry) =>
      String(entry?.certificateName || "")
        .trim()
        .toLowerCase() === targetName,
  );
  if (resultNameMatch) {
    return true;
  }

  const certificateItems = Array.isArray(student?.certificateItems)
    ? student.certificateItems
    : [];
  if (
    certificateItems.some(
      (item) =>
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
        const studentsByProject = await getStudentsByProject(
          selectedProjectCode,
          { maxDocs: 1000 },
        );
        if (!mounted) return;
        const mappedStudents = (studentsByProject || []).map(toDisplayStudent);
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
    if (!selectedCertificate) return [];
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
  }, [selectedProjectCode, selectedCertificateId]);

  useEffect(() => {
    if (!isServerPaginationMode) return;
    loadServerPage({
      projectCode: selectedProjectCode,
      cursor: null,
      history: [],
    });
  }, [isServerPaginationMode, selectedProjectCode]);

  const totalPages = Math.max(1, Math.ceil(students.length / PAGE_SIZE));
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return students.slice(start, start + PAGE_SIZE);
  }, [students, currentPage, PAGE_SIZE]);

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
        <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
          Students
        </h1>
        <p className="text-sm text-[#415a77]">
          Select project code and certificate to view mapped students
        </p>
      </div>

      <div className="mb-4 rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#0B2A4A]">
              Project Code
            </span>
            <select
              value={selectedProjectCode}
              onChange={(event) => setSelectedProjectCode(event.target.value)}
              className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-colors
              ${loadingProjects ? "border-[#D7E2F1]" : "border-[#D7E2F1]"}
              ${!selectedProjectCode && !loadingProjects ? "ring-2 ring-yellow-300 border-yellow-500" : ""}`}
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
              <p className="mt-1 text-xs text-yellow-600">
                <em>Choose a project code to populate the student list.</em>
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#0B2A4A]">
              Certificate
            </span>
            <select
              value={selectedCertificateId}
              onChange={(event) => setSelectedCertificateId(event.target.value)}
              className={`h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-colors border-[#D7E2F1]
              ${selectedProjectCode && !selectedCertificateId && !loadingStudents ? "ring-2 ring-yellow-300 border-yellow-500" : ""}`}
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
                      : "Select certificate"}
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
                  No certificates are enrolled for this project code. Showing
                  full student list.
                </em>
              </p>
            )}
            {selectedProjectCode &&
              !selectedCertificateId &&
              !loadingStudents &&
              !shouldShowAllStudents && (
                <p className="mt-1 text-xs text-yellow-600">
                  <em>Select a certificate to view the student master list.</em>
                </p>
              )}
          </label>
        </div>
      </div>

      {selectedProjectCode &&
        (selectedCertificateId || shouldShowAllStudents) && (
          <div className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="mb-2 px-3">
              <h2 className="text-lg font-semibold text-[#0B2A4A]">
                Student Master List
              </h2>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#D7E2F1] bg-white">
              <table className="min-w-full divide-y divide-[#E6EDF6]">
                <thead className="bg-[#F5F8FD]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Student ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Project Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Email Id
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Current Year
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Certificates
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#0B2A4A]">
                      Result Status
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#E6EDF6] bg-white">
                  {(loadingProjects ||
                    loadingStudents ||
                    loadingServerPage) && (
                    <tr className="bg-gray-50">
                      <td
                        className="px-6 py-6 text-center text-sm text-gray-500"
                        colSpan={7}
                      >
                        Loading students...
                      </td>
                    </tr>
                  )}
                  {!loadingProjects &&
                    !loadingStudents &&
                    !loadingServerPage &&
                    selectedProjectCode &&
                    (selectedCertificateId || shouldShowAllStudents) &&
                    displayedStudents.length === 0 && (
                      <tr className="bg-gray-50">
                        <td
                          className="px-6 py-6 text-center text-sm text-gray-500"
                          colSpan={7}
                        >
                          No students found for selected project code and
                          certificate.
                        </td>
                      </tr>
                    )}
                  {displayedStudents.map((student) => (
                    <tr
                      key={`${student.projectCode || student.projectId || "NA"}-${student.id || student.docId || student.email || student.name}`}
                      onClick={() => setSelectedStudent(student)}
                      className="cursor-pointer transition hover:bg-gray-50"
                      style={{ pageBreakInside: "avoid", breakInside: "avoid" }}
                    >
                      <td className="wrap-break-word px-6 py-4 text-sm font-medium text-[#0B2A4A]">
                        {student.id}
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.name}
                      </td>
                      <td
                        className={`px-6 py-4 wrap-break-word text-sm text-blue-600 transition-colors ${
                          student.projectCode === selectedProjectCode
                            ? "font-semibold"
                            : ""
                        }`}
                      >
                        {student.projectCode || "-"}
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.email}
                      </td>
                      <td className="px-6 py-4 wrap-break-word">
                        <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                          {student.currentYear || "-"}
                        </span>
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.enrolledCertificates || "-"}
                      </td>
                      <td className="wrap-break-word px-6 py-4 text-sm text-[#0B2A4A]">
                        {student.certificateStatusSummary || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!loadingProjects &&
              !loadingStudents &&
              !loadingServerPage &&
              ((isServerPaginationMode && (serverHasPrev || serverHasNext)) ||
                (!isServerPaginationMode && students.length > PAGE_SIZE)) && (
                <div className="mt-3 flex items-center justify-between px-1">
                  <p className="text-xs text-[#415a77]">
                    {isServerPaginationMode
                      ? `Showing page ${serverCurrentPage}`
                      : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, students.length)} of ${students.length}`}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isServerPaginationMode) {
                          if (!serverHasPrev) return;
                          const prevCursor =
                            serverCursorHistory[
                              serverCursorHistory.length - 1
                            ] || null;
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
                        setCurrentPage((page) =>
                          Math.min(totalPages, page + 1),
                        );
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
