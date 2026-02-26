import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getStudentsByProject } from "../../../services/studentService";
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

  const enrolledNames = Array.isArray(student?.enrolledCertificates)
    ? student.enrolledCertificates
    : [];
  if (
    enrolledNames.some(
      (name) =>
        String(name || "")
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

export default function Students() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [projectOptions, setProjectOptions] = useState([]);
  const [certificateOptions, setCertificateOptions] = useState([]);
  const [selectedProjectCode, setSelectedProjectCode] = useState("");
  const [selectedCertificateId, setSelectedCertificateId] = useState("");
  const [projectStudents, setProjectStudents] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadProjectOptions = async () => {
      try {
        setLoadingProjects(true);
        const profileCollegeCode = String(profile?.collegeCode || profile?.college_code || "")
          .trim()
          .toUpperCase();
        if (!profileCollegeCode) {
          if (mounted) setProjectOptions([]);
          return;
        }

        const allProjectCodes = await getProjectCodesByCollege(profileCollegeCode);
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
        return;
      }

      try {
        setLoadingStudents(true);
        setSelectedCertificateId("");
        const studentsByProject =
          await getStudentsByProject(selectedProjectCode);
        if (!mounted) return;
        const mappedStudents = (studentsByProject || []).map(toDisplayStudent);
        setProjectStudents(mappedStudents);
        setCertificateOptions(
          getCertificateOptionsFromStudents(mappedStudents),
        );
      } catch (error) {
        console.error("Failed to load selected project data:", error);
        if (!mounted) return;
        setProjectStudents([]);
        setCertificateOptions([]);
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

  const students = useMemo(() => {
    if (!selectedProjectCode || !selectedCertificate) return [];
    return projectStudents.filter((student) =>
      matchesCertificate(student, selectedCertificate),
    );
  }, [projectStudents, selectedCertificate, selectedProjectCode]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Students</h1>
        <p className="text-sm text-gray-500">
          Select project code and certificate to view mapped students
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Project Code
          </span>
          <select
            value={selectedProjectCode}
            onChange={(event) => setSelectedProjectCode(event.target.value)}
            className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none"
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
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">
            Certificate
          </span>
          <select
            value={selectedCertificateId}
            onChange={(event) => setSelectedCertificateId(event.target.value)}
            className="h-10 w-full rounded-lg border border-[#D7E2F1] bg-white px-3 text-sm outline-none"
            disabled={!selectedProjectCode || loadingStudents}
          >
            <option value="">
              {!selectedProjectCode
                ? "Select project code first"
                : loadingStudents
                  ? "Loading certificates..."
                  : "Select certificate"}
            </option>
            {certificateOptions.map((certificate) => (
              <option key={certificate.id} value={String(certificate.id || "")}>
                {certificate.name || certificate.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="bg-white rounded-xl shadow border">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">Student Master List</h2>
        </div>

        <div className="p-6 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-3">
            <thead className="text-sm text-gray-500">
              <tr>
                <th className="text-left px-3">Student ID</th>
                <th className="text-left px-3">Name</th>
                <th className="text-left px-3">Project Code</th>
                <th className="text-left px-3">Email Id</th>
                <th className="text-left px-3">Current Year</th>
                <th className="text-left px-3">Certificates</th>
                <th className="text-left px-3">Result Status</th>
              </tr>
            </thead>

            <tbody>
              {(loadingProjects || loadingStudents) && (
                <tr className="bg-gray-50">
                  <td
                    className="px-3 py-6 text-center text-sm text-gray-500"
                    colSpan={7}
                  >
                    Loading students...
                  </td>
                </tr>
              )}
              {!loadingProjects && !loadingStudents && !selectedProjectCode && (
                <tr className="bg-gray-50">
                  <td
                    className="px-3 py-6 text-center text-sm text-gray-500"
                    colSpan={7}
                  >
                    Select a project code to continue.
                  </td>
                </tr>
              )}
              {!loadingProjects &&
                !loadingStudents &&
                selectedProjectCode &&
                !selectedCertificateId && (
                  <tr className="bg-gray-50">
                    <td
                      className="px-3 py-6 text-center text-sm text-gray-500"
                      colSpan={7}
                    >
                      Select a certificate to view students.
                    </td>
                  </tr>
                )}
              {!loadingProjects &&
                !loadingStudents &&
                selectedProjectCode &&
                selectedCertificateId &&
                students.length === 0 && (
                  <tr className="bg-gray-50">
                    <td
                      className="px-3 py-6 text-center text-sm text-gray-500"
                      colSpan={7}
                    >
                      No students found for selected project code and
                      certificate.
                    </td>
                  </tr>
                )}
              {students.map((student) => (
                <tr
                  key={`${student.projectCode || student.projectId || "NA"}-${student.id || student.docId || student.email || student.name}`}
                  onClick={() => setSelectedStudent(student)}
                  className="bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                >
                  <td className="px-3 py-3 font-medium">{student.id}</td>
                  <td className="px-3">{student.name}</td>
                  <td className="px-3 text-blue-600">
                    {student.projectCode || "-"}
                  </td>
                  <td className="px-3">{student.email}</td>
                  <td className="px-3">
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                      {student.currentYear || "-"}
                    </span>
                  </td>
                  <td className="px-3">
                    {student.enrolledCertificates || "-"}
                  </td>
                  <td className="px-3">
                    {student.certificateStatusSummary || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <StudentModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
