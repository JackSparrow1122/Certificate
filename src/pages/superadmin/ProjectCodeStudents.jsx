import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { getProjectCodeById } from "../../../services/projectCodeService";
import {
  getStudentsByProject,
  updateStudent,
} from "../../../services/studentService";
import {
  getStudentsByCertificateInProject,
  getStudentEnrollmentsByProject,
} from "../../../services/certificateService";
import { Pencil, RotateCcw } from "lucide-react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import AddStudentModal from "../../components/superadmin/AddStudentModal";
import { ExcelStudentImport } from "../../components/superadmin/ExcelStudentImport";

// Extract current year from the 3rd segment of a project code like "COLLEGE/BATCH/YEAR"
function getCurrentYearFromProjectCode(projectCode) {
  const parts = String(projectCode || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts[2] : "";
}

// Helper function to extract display fields from nested student data
function extractStudentDisplayData(student, projectCodeStr) {
  const enrollmentStatus = student.enrollmentStatus || null;
  // _enrollments = all certificate enrollments for this student (when no cert filter)
  const allEnrollments = Array.isArray(student._enrollments)
    ? student._enrollments
    : [];
  const official = student.OFFICIAL_DETAILS || {};
  return {
    id: student.id,
    docId: student.docId || student.id,
    name: official["FULL NAME OF STUDENT"] || "-",
    email:
      student.email || official["EMAIL_ID"] || official["EMAIL_ID."] || "-",
    currentYear:
      getCurrentYearFromProjectCode(projectCodeStr || student.projectCode) ||
      "-",
    enrollmentStatus,
    allEnrollments,
  };
}

export default function ProjectCodeStudents() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const location = useLocation();
  const certificateId = location.state?.certificateId || null;
  const [projectCode, setProjectCode] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);
  const [filters, setFilters] = useState({
    rollNo: "",
    name: "",
  });

  useEffect(() => {
    fetchData();
  }, [projectId, certificateId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const projectData = await getProjectCodeById(projectId);
      if (!projectData) {
        setError("Project code not found");
        return;
      }
      setProjectCode(projectData);

      // If a certificateId filter is present, fetch only enrolled students
      let studentsData;
      if (certificateId) {
        studentsData = await getStudentsByCertificateInProject(
          certificateId,
          projectData.code,
        );
      } else {
        // Fetch all students + their enrollments in parallel
        const [allStudents, enrollmentsMap] = await Promise.all([
          getStudentsByProject(projectData.code),
          getStudentEnrollmentsByProject(projectData.code),
        ]);
        studentsData = (allStudents || []).map((s) => {
          const sid = s.docId || s.id || "";
          return { ...s, _enrollments: enrollmentsMap.get(sid) || [] };
        });
      }
      setStudents(studentsData);
    } catch (err) {
      setError("Failed to load data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-500">Loading...</div>
        </div>
      </SuperAdminLayout>
    );
  }

  if (error) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="text-red-500">{error}</div>
        </div>
      </SuperAdminLayout>
    );
  }

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      rollNo: "",
      name: "",
    });
  };

  const handleEditClick = (e, studentDocId) => {
    e.stopPropagation();
    const raw = students.find((s) => (s.docId || s.id) === studentDocId);
    if (!raw) return;
    setEditingStudent(raw);
    setEditForm({
      fullName: raw.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"] || "",
      email: raw.OFFICIAL_DETAILS?.["EMAIL_ID"] || "",
      mobile: raw.OFFICIAL_DETAILS?.["MOBILE NO."] || "",
      dob: raw.OFFICIAL_DETAILS?.["BIRTH DATE"] || "",
      gender: raw.OFFICIAL_DETAILS?.["GENDER"] || "",
      tenthPercent: raw.TENTH_DETAILS?.["10th OVERALL MARKS %"] ?? "",
      twelfthPercent: raw.TWELFTH_DETAILS?.["12th OVERALL MARKS %"] ?? "",
      diplomaCourse: raw.DIPLOMA_DETAILS?.["DIPLOMA COURSE"] || "",
      diplomaSpec: raw.DIPLOMA_DETAILS?.["DIPLOMA SPECIALIZATION"] || "",
      diplomaYear: raw.DIPLOMA_DETAILS?.["DIPLOMA PASSING YR"] || "",
      diplomaPercent: raw.DIPLOMA_DETAILS?.["DIPLOMA OVERALL MARKS %"] ?? "",
      ugCourse: raw.GRADUATION_DETAILS?.["GRADUATION COURSE"] || "",
      ugSpec: raw.GRADUATION_DETAILS?.["GRADUATION SPECIALIZATION"] || "",
      ugYear: raw.GRADUATION_DETAILS?.["GRADUATION PASSING YR"] || "",
      ugPercent: raw.GRADUATION_DETAILS?.["GRADUATION OVERALL MARKS %"] ?? "",
      pgCourse: raw.POST_GRADUATION_DETAILS?.["COURSE"] || "",
      pgSpec: raw.POST_GRADUATION_DETAILS?.["SPECIALIZATION"] || "",
      pgYear: raw.POST_GRADUATION_DETAILS?.["PASSING YEAR"] || "",
      pgPercent: raw.POST_GRADUATION_DETAILS?.["OVERALL MARKS %"] ?? "",
    });
    setEditError(null);
  };

  const handleEditFormChange = (e) =>
    setEditForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditLoading(true);
    setEditError(null);
    try {
      const toNum = (v) => (v !== "" && v !== undefined ? parseFloat(v) : "");
      const updateData = {
        OFFICIAL_DETAILS: {
          ...editingStudent.OFFICIAL_DETAILS,
          "FULL NAME OF STUDENT": editForm.fullName,
          EMAIL_ID: editForm.email,
          "MOBILE NO.": editForm.mobile,
          "BIRTH DATE": editForm.dob,
          GENDER: editForm.gender,
        },
        TENTH_DETAILS: {
          ...editingStudent.TENTH_DETAILS,
          "10th OVERALL MARKS %": toNum(editForm.tenthPercent),
        },
        TWELFTH_DETAILS: {
          ...editingStudent.TWELFTH_DETAILS,
          "12th OVERALL MARKS %": toNum(editForm.twelfthPercent),
        },
        DIPLOMA_DETAILS: {
          ...editingStudent.DIPLOMA_DETAILS,
          "DIPLOMA COURSE": editForm.diplomaCourse,
          "DIPLOMA SPECIALIZATION": editForm.diplomaSpec,
          "DIPLOMA PASSING YR": editForm.diplomaYear,
          "DIPLOMA OVERALL MARKS %": toNum(editForm.diplomaPercent),
        },
        GRADUATION_DETAILS: {
          ...editingStudent.GRADUATION_DETAILS,
          "GRADUATION COURSE": editForm.ugCourse,
          "GRADUATION SPECIALIZATION": editForm.ugSpec,
          "GRADUATION PASSING YR": editForm.ugYear,
          "GRADUATION OVERALL MARKS %": toNum(editForm.ugPercent),
        },
        POST_GRADUATION_DETAILS: {
          ...editingStudent.POST_GRADUATION_DETAILS,
          COURSE: editForm.pgCourse,
          SPECIALIZATION: editForm.pgSpec,
          "PASSING YEAR": editForm.pgYear,
          "OVERALL MARKS %": toNum(editForm.pgPercent),
        },
      };
      await updateStudent(projectCode.code, editingStudent.id, updateData);
      setEditingStudent(null);
      await fetchData();
    } catch (err) {
      setEditError("Failed to update student. Please try again.");
      console.error(err);
    } finally {
      setEditLoading(false);
    }
  };

  const filteredStudents = students
    .map((s) => extractStudentDisplayData(s, projectCode?.code))
    .filter((student) => {
      const rollNo = String(student.id || "");
      const name = String(student.name || "");
      return (
        rollNo.toLowerCase().includes(filters.rollNo.toLowerCase()) &&
        name.toLowerCase().includes(filters.name.toLowerCase())
      );
    });

  return (
    <SuperAdminLayout>
      <div className="px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
        <div className="w-full space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/superadmin/project-codes/${projectId}/certificates`,
                  )
                }
                className="mb-2 rounded-lg bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white"
              >
                ← Back to Certificates
              </button>
              <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
                Students List
                {certificateId && (
                  <span className="ml-2 text-lg text-gray-500 font-normal">
                    (filtered by certificate)
                  </span>
                )}
              </h1>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A]"
              >
                + Bulk Add Students
              </button>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A]"
              >
                + Add New Student
              </button>
            </div>
          </div>

          <section>
            <h2 className="mb-3 text-2xl font-semibold tracking-wide text-[#0B2A4A]">
              FILTERS
            </h2>
            <div className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="w-full min-w-45 flex-1 text-sm font-medium text-[#0B2A4A]">
                  Roll No.
                  <input
                    type="text"
                    value={filters.rollNo}
                    onChange={(e) =>
                      handleFilterChange("rollNo", e.target.value)
                    }
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  />
                </label>
                <label className="w-full min-w-45 flex-1 text-sm font-medium text-[#0B2A4A]">
                  Name
                  <input
                    type="text"
                    value={filters.name}
                    onChange={(e) => handleFilterChange("name", e.target.value)}
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[#003B7A] px-4 text-sm font-semibold text-white"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="mb-2 grid grid-cols-[1.5fr_2fr_2.5fr_1.2fr_2fr_40px] gap-3 px-3 text-sm font-semibold text-[#0B2A4A]">
              <p>Student ID</p>
              <p>Name</p>
              <p>Email ID</p>
              <p>Current Year</p>
              <p>Result Status</p>
              <p />
            </div>

            <div className="space-y-2.5">
              {filteredStudents.map((student) => (
                <div
                  key={student.docId || student.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    student.docId &&
                    navigate(
                      `/superadmin/students/${student.docId}/certificate-progress`,
                      {
                        state: { projectCode: projectCode?.code || "" },
                      },
                    )
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (student.docId) {
                        navigate(
                          `/superadmin/students/${student.docId}/certificate-progress`,
                          {
                            state: { projectCode: projectCode?.code || "" },
                          },
                        );
                      }
                    }
                  }}
<<<<<<< HEAD
                  className="grid cursor-pointer grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.6fr_1fr_1fr_40px] items-center gap-3 rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors"
=======
                  className="grid cursor-pointer grid-cols-[1.5fr_2fr_2.5fr_1.2fr_2fr_40px] items-center gap-3 rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors hover:bg-gray-50 hover:transform-none! hover:shadow-none!"
>>>>>>> d3fd5265673b5713920e0afdc690a3a1fbb1e3b0
                >
                  <p className="pointer-events-none justify-self-start text-left font-medium text-[#0B2A4A]">
                    {student.id || "-"}
                  </p>
                  <p>{student.name || "-"}</p>
                  <p className="truncate">{student.email || "-"}</p>
                  <p>
                    <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs">
                      {student.currentYear || "-"}
                    </span>
                  </p>
                  <div>
                    {certificateId && student.enrollmentStatus ? (
                      <span
                        className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                          student.enrollmentStatus === "passed"
                            ? "bg-green-100 text-green-700"
                            : student.enrollmentStatus === "failed"
                              ? "bg-red-100 text-red-600"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {student.enrollmentStatus.charAt(0).toUpperCase() +
                          student.enrollmentStatus.slice(1)}
                      </span>
                    ) : student.allEnrollments.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {student.allEnrollments.map((e, idx) => {
                          const statusColor =
                            e.status === "passed"
                              ? "bg-green-100 text-green-700"
                              : e.status === "failed"
                                ? "bg-red-100 text-red-600"
                                : "bg-blue-100 text-blue-700";
                          return (
                            <span
                              key={e.certificateId || idx}
                              className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}
                            >
                              {e.certificateName}:{" "}
                              {e.status.charAt(0).toUpperCase() +
                                e.status.slice(1)}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </div>
                  <span
                    className="justify-self-end text-gray-400 transition-colors"
                    onClick={(e) =>
                      handleEditClick(e, student.docId || student.id)
                    }
                  >
                    <Pencil size={16} />
                  </span>
                </div>
              ))}
            </div>

            {filteredStudents.length === 0 && (
              <div className="rounded-xl border border-[#D7E2F1] bg-white px-5 py-8 text-center text-sm text-gray-600">
                No students found
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddStudentModal && (
        <AddStudentModal
          projectCode={projectCode?.code || projectId}
          onClose={() => setShowAddStudentModal(false)}
          onStudentAdded={fetchData}
        />
      )}

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setEditingStudent(null)}
          />
          <div className="relative z-10 mx-4 w-full max-w-2xl rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[#0B2A4A]">
                  Edit Student
                </h2>
                <p className="text-sm text-[#415a77] mt-0.5">
                  {editingStudent.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"] ||
                    editingStudent.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="rounded-lg p-1.5 text-[#415a77] transition-colors"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mb-4 rounded-lg bg-red-100 p-2.5 text-sm text-red-700">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSave} className="space-y-5">
              {/* Personal Info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77] mb-3">
                  Personal Information
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Full Name
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={editForm.fullName}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={editForm.email}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Mobile No.
                    </label>
                    <input
                      type="tel"
                      name="mobile"
                      value={editForm.mobile}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      name="dob"
                      value={editForm.dob}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Gender
                    </label>
                    <select
                      name="gender"
                      value={editForm.gender}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    >
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Academic Info */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77] mb-3">
                  Academic Details
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      10th Overall %
                    </label>
                    <input
                      type="number"
                      name="tenthPercent"
                      value={editForm.tenthPercent}
                      onChange={handleEditFormChange}
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      12th Overall %
                    </label>
                    <input
                      type="number"
                      name="twelfthPercent"
                      value={editForm.twelfthPercent}
                      onChange={handleEditFormChange}
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                </div>
              </div>

              {/* Diploma */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77] mb-3">
                  Diploma Details
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Course
                    </label>
                    <input
                      type="text"
                      name="diplomaCourse"
                      value={editForm.diplomaCourse}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Specialization
                    </label>
                    <input
                      type="text"
                      name="diplomaSpec"
                      value={editForm.diplomaSpec}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Passing Year
                    </label>
                    <input
                      type="text"
                      name="diplomaYear"
                      value={editForm.diplomaYear}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Overall %
                    </label>
                    <input
                      type="number"
                      name="diplomaPercent"
                      value={editForm.diplomaPercent}
                      onChange={handleEditFormChange}
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                </div>
              </div>

              {/* Graduation */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77] mb-3">
                  Graduation Details
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Course
                    </label>
                    <input
                      type="text"
                      name="ugCourse"
                      value={editForm.ugCourse}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Specialization
                    </label>
                    <input
                      type="text"
                      name="ugSpec"
                      value={editForm.ugSpec}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Passing Year
                    </label>
                    <input
                      type="text"
                      name="ugYear"
                      value={editForm.ugYear}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Overall %
                    </label>
                    <input
                      type="number"
                      name="ugPercent"
                      value={editForm.ugPercent}
                      onChange={handleEditFormChange}
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                </div>
              </div>

              {/* Post Graduation */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77] mb-3">
                  Post Graduation Details
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Course
                    </label>
                    <input
                      type="text"
                      name="pgCourse"
                      value={editForm.pgCourse}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Specialization
                    </label>
                    <input
                      type="text"
                      name="pgSpec"
                      value={editForm.pgSpec}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Passing Year
                    </label>
                    <input
                      type="text"
                      name="pgYear"
                      value={editForm.pgYear}
                      onChange={handleEditFormChange}
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#0B2A4A]">
                      Overall %
                    </label>
                    <input
                      type="number"
                      name="pgPercent"
                      value={editForm.pgPercent}
                      onChange={handleEditFormChange}
                      step="0.01"
                      min="0"
                      max="100"
                      className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none focus:border-[#0B2A4A]"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="rounded-lg border border-[#CBD8EA] bg-white px-4 py-2 text-sm font-semibold text-[#0B2A4A] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="rounded-lg bg-[#0B2A4A] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60 transition-colors"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowImportModal(false)}
          />
          <div className="relative bg-white rounded-lg shadow-lg p-6 w-full max-w-md z-10">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 text-gray-400"
            >
              ✕
            </button>
            <h2 className="text-xl font-semibold mb-4 pr-6">
              Bulk Import Students from Excel
            </h2>
            <ExcelStudentImport
              projectCode={projectCode?.code || projectId}
              onStudentAdded={(success) => {
                // Only close modal and refresh when import succeeded.
                if (success) {
                  setShowImportModal(false);
                  setTimeout(() => fetchData(), 700);
                } else {
                  // keep modal open so user can see error messages
                  // optionally focus/scroll to error — no-op for now
                }
              }}
            />
          </div>
        </div>
      )}
    </SuperAdminLayout>
  );
}
