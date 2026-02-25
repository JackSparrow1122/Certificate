import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getAllStudents,
  getStudentsByProject,
} from "../../../services/studentService";
import { getAllProjectCodes } from "../../../services/projectCodeService";
import StudentModal from "../../components/StudentModal";

const normalizeProjectCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const toDisplayStudent = (student) => {
  const official = student?.OFFICIAL_DETAILS || {};
  const graduation = student?.GRADUATION_DETAILS || {};

  return {
    ...student,
    id: student?.id || official.SN || student?.docId || "-",
    name:
      student?.name ||
      official["FULL NAME OF STUDENT"] ||
      student?.fullName ||
      "-",
    email:
      student?.email ||
      official["EMAIL ID"] ||
      official["EMAIL ID."] ||
      "-",
    admissionYear:
      student?.admissionYear ||
      graduation["GRADUATION ADMISSION YR"] ||
      student?.passingYear ||
      "-",
    currentSemester:
      student?.currentSemester ||
      student?.currentYear ||
      student?.semesterLabel ||
      "-",
    projectCode: student?.projectCode || student?.projectId || "-",
  };
};

export default function Students() {
  const { profile } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        setLoading(true);
        const profileCollegeCode = String(
          profile?.collegeCode || profile?.college_code || "",
        )
          .trim()
          .toUpperCase();
        const profileProjectPrefix = String(
          profile?.projectCode || profile?.projectId || "",
        )
          .split(/[/-]/)[0]
          ?.trim()
          .toUpperCase();
        const collegeCodeCandidates = new Set(
          [profileCollegeCode, profileProjectPrefix].filter(Boolean),
        );

        if (collegeCodeCandidates.size === 0) {
          if (mounted) setStudents([]);
          return;
        }

        const allProjectCodes = await getAllProjectCodes();

        const allowedProjectCodeList = (allProjectCodes || [])
          .filter((projectCode) => {
            const projectCollegeId = String(projectCode.collegeId || "")
              .trim()
              .toUpperCase();
            const codePrefix = String(projectCode.code || "")
              .split(/[/-]/)[0]
              ?.trim()
              .toUpperCase();
            return (
              collegeCodeCandidates.has(projectCollegeId) ||
              collegeCodeCandidates.has(codePrefix)
            );
          })
          .map((projectCode) => String(projectCode.code || "").trim())
          .filter(Boolean);

        const allowedProjectCodes = new Set(
          allowedProjectCodeList
            .map((code) => normalizeProjectCode(code))
            .filter(Boolean),
        );

        // Primary source: read students directly from each allowed project code bucket.
        const studentBuckets = await Promise.allSettled(
          allowedProjectCodeList.map((projectCode) => getStudentsByProject(projectCode)),
        );

        const studentsFromProjectBuckets = studentBuckets
          .filter((bucket) => bucket.status === "fulfilled")
          .flatMap((bucket) => bucket.value || []);

        // Fallback source: collection-group list, then filter by normalized project/college code.
        const allStudents = await getAllStudents();
        const fallbackStudents = (allStudents || []).filter((student) => {
          const rawProjectCode = String(
            student.projectCode || student.projectId || "",
          ).trim();
          const normalizedStudentCode = normalizeProjectCode(rawProjectCode);
          const studentCollegeCode = String(
            student.collegeCode || student.college_code || "",
          )
            .trim()
            .toUpperCase();

          if (allowedProjectCodes.has(normalizedStudentCode)) {
            return true;
          }

          if (studentCollegeCode && collegeCodeCandidates.has(studentCollegeCode)) {
            return true;
          }

          const codePrefix = rawProjectCode.split(/[/-]/)[0]?.trim().toUpperCase();
          return Boolean(codePrefix && collegeCodeCandidates.has(codePrefix));
        });

        const mergedByKey = new Map();
        [...studentsFromProjectBuckets, ...fallbackStudents].forEach((student) => {
          const row = student || {};
          const key = `${row.projectCode || row.projectId || "NA"}::${row.id || row.docId || row.email || row.name || "UNKNOWN"}`;
          if (!mergedByKey.has(key)) {
            mergedByKey.set(key, row);
          }
        });

        const data = Array.from(mergedByKey.values()).map(toDisplayStudent);

        if (!mounted) return;
        setStudents(data || []);
      } catch (error) {
        console.error("Failed to load students:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [profile]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Students</h1>
        <p className="text-sm text-gray-500">
          Students mapped to your college project codes
        </p>
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
                  <th className="text-left px-3">Admission Year</th>
               <th className="text-left px-3">Current Sem</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr className="bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-500" colSpan={6}>
                    Loading students...
                  </td>
                </tr>
              )}
              {!loading && students.length === 0 && (
                <tr className="bg-gray-50">
                  <td className="px-3 py-3 text-sm text-gray-500" colSpan={6}>
                    No students found for your college project codes.
                  </td>
                </tr>
              )}
              {students.map((s) => (
                <tr
                  key={`${s.projectCode || s.projectId || "NA"}-${s.id || s.docId || s.email || s.name}`}
                  onClick={() => setSelectedStudent(s)}
                  className="bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                >
                  <td className="px-3 py-3 font-medium">{s.id}</td>
                  <td className="px-3">{s.name}</td>
                  <td className="px-3 text-blue-600">{s.projectCode || s.projectId || "-"}</td>
                  <td className="px-3">{s.email}</td>
                   <td className="px-3">{s.admissionYear || "-"}</td>
                  <td className="px-3">
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                      {s.currentSemester || "-"}
                    </span>
                  </td>

                  
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL */}
      <StudentModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
