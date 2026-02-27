import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getProjectCodeById } from "../../../services/projectCodeService";
import { getStudentsByProject } from "../../../services/studentService";
import { Pencil, RotateCcw } from "lucide-react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import AddStudentModal from "../../components/superadmin/AddStudentModal";
import { ExcelStudentImport } from "../../components/superadmin/ExcelStudentImport";

// Helper function to extract display fields from nested student data
function extractStudentDisplayData(student) {
  return {
    id: student.id,
    docId: student.docId || student.id,
    name: student.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"] || "-",
    dob: student.OFFICIAL_DETAILS?.["BIRTH DATE"] || "-",
    tenthPercentage: student.TENTH_DETAILS?.["10th OVERALL MARKS %"] || "-",
    twelfthOrDiplomaPercentage:
      student.TWELFTH_DETAILS?.["12th OVERALL MARKS %"] ||
      student.DIPLOMA_DETAILS?.["DIPLOMA OVERALL MARKS %"] ||
      "-",
    ugPercentage:
      student.GRADUATION_DETAILS?.["GRADUATION OVERALL MARKS %"] || "-",
    pgPercentage: student.POST_GRADUATION_DETAILS?.["OVERALL MARKS %"] || "-",
  };
}

export default function ProjectCodeStudents() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projectCode, setProjectCode] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filters, setFilters] = useState({
    rollNo: "",
    name: "",
  });

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      // First get the project code details
      const projectData = await getProjectCodeById(projectId);
      if (!projectData) {
        setError("Project code not found");
        return;
      }
      setProjectCode(projectData);

      // Then get students for this project code
      const studentsData = await getStudentsByProject(projectData.code);
      setStudents(studentsData);
    } catch (error) {
      setError("Failed to load data");
      console.error(error);
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

  const filteredStudents = students
    .map(extractStudentDisplayData)
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
                    `/superadmin/colleges/${projectCode?.collegeId || ""}/project-codes`,
                  )
                }
                className="mb-2 rounded-lg bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
              >
                ← Back to Project Codes
              </button>
              <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
                Students List
              </h1>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A] hover:bg-[#cdd9e8]"
              >
                + Bulk Add Students
              </button>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A] hover:bg-[#cdd9e8]"
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
            <div className="mb-2 grid grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.6fr_1fr_1fr_40px] gap-3 px-3 text-sm font-semibold text-[#0B2A4A]">
              <p>Student Name</p>
              <p>Roll No.</p>
              <p>DOB</p>
              <p>10th %tage</p>
              <p>12th/Diploma %tage</p>
              <p>UG %tage</p>
              <p>PG %tage</p>
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
                  className="grid cursor-pointer grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.6fr_1fr_1fr_40px] items-center gap-3 rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors hover:bg-gray-50 hover:transform-none! hover:shadow-none!"
                >
                  <p className="pointer-events-none justify-self-start text-left font-medium text-[#0B2A4A]">
                    {student.name || "-"}
                  </p>
                  <p>{student.id || "-"}</p>
                  <p>{student.dob || "-"}</p>
                  <p>{student.tenthPercentage ?? "-"}</p>
                  <p>{student.twelfthOrDiplomaPercentage ?? "-"}</p>
                  <p>{student.ugPercentage ?? "-"}</p>
                  <p>{student.pgPercentage ?? "-"}</p>
                  <span className="justify-self-end text-gray-600">
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

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowImportModal(false)}
          />
          <div className="relative bg-white rounded-lg shadow-lg p-6 w-full max-w-md z-10">
            <button
              onClick={() => setShowImportModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
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
