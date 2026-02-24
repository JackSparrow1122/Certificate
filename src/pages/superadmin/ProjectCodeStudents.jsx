import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { getProjectCodeById } from "../../../services/projectCodeService";
import { getStudentsByProject } from "../../../services/studentService";
import { Pencil, RotateCcw } from "lucide-react";
import Sidebar from "../../components/layout/Sidebar";
import AddStudentModal from "../../components/superadmin/AddStudentModal";

export default function ProjectCodeStudents() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projectCode, setProjectCode] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
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
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="text-gray-500">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />
        <div className="flex-1 p-8 flex items-center justify-center">
          <div className="text-red-500">{error}</div>
        </div>
      </div>
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

  const filteredStudents = students.filter((student) => {
    const rollNo = String(student.id || "");
    const name = String(student.name || "");
    return (
      rollNo.toLowerCase().includes(filters.rollNo.toLowerCase()) &&
      name.toLowerCase().includes(filters.name.toLowerCase())
    );
  });

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 px-5 py-8 lg:px-6">
        <div className="w-full space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/superadmin/colleges/${projectCode?.collegeId || ""}/project-codes`,
                  )
                }
                className="mb-2 rounded-md bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
              >
                ← Back to Project Codes
              </button>
              <h1 className="text-[3rem] font-medium leading-none text-gray-900 sm:text-[2.2rem]">
                Students List
              </h1>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => alert("Bulk add students will be enabled soon.")}
                className="rounded-lg bg-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-400"
              >
                + Bulk Add Students
              </button>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="rounded-lg bg-gray-300 px-5 py-2.5 text-sm font-medium text-gray-900 hover:bg-gray-400"
              >
                + Add New Student
              </button>
            </div>
          </div>

          <section>
            <h2 className="mb-3 text-[2rem] leading-none font-medium tracking-wide text-gray-900">
              FILTERS
            </h2>
            <div className="rounded-[2rem] bg-gray-300 p-6">
              <div className="flex flex-wrap items-end gap-6">
                <label className="w-full min-w-[180px] flex-1 text-lg text-gray-900 sm:text-base">
                  Roll No.
                  <input
                    type="text"
                    value={filters.rollNo}
                    onChange={(e) => handleFilterChange("rollNo", e.target.value)}
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-base outline-none sm:text-sm"
                  />
                </label>
                <label className="w-full min-w-[180px] flex-1 text-lg text-gray-900 sm:text-base">
                  Name
                  <input
                    type="text"
                    value={filters.name}
                    onChange={(e) => handleFilterChange("name", e.target.value)}
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-base outline-none sm:text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#003B7A] px-5 py-2 text-sm font-semibold text-white"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-gray-300 p-6">
            <div className="mb-3 grid grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.6fr_1fr_1fr_40px] gap-3 px-3 text-base font-medium text-gray-900 lg:text-sm">
              <p>Student Name</p>
              <p>Roll No.</p>
              <p>DOB</p>
              <p>10th %tage</p>
              <p>12th/Diploma %tage</p>
              <p>UG %tage</p>
              <p>PG %tage</p>
              <p />
            </div>

            <div className="space-y-3">
              {filteredStudents.map((student) => (
                <div
                  key={student.docId || student.id}
                  className="grid grid-cols-[2fr_1.3fr_1.3fr_1.1fr_1.6fr_1fr_1fr_40px] items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 text-base text-gray-900 lg:text-sm"
                >
                  <button
                    type="button"
                    onClick={() =>
                      student.docId &&
                      navigate(`/superadmin/students/${student.docId}/certificate-progress`)
                    }
                    className="justify-self-start text-left font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {student.name || "-"}
                  </button>
                  <p>{student.id || "-"}</p>
                  <p>{student.dob || "-"}</p>
                  <p>{student.tenthPercentage ?? "-"}</p>
                  <p>{student.twelfthPercentage ?? "-"}</p>
                  <p>{student.ugPercentage ?? "-"}</p>
                  <p>{student.pgPercentage ?? "-"}</p>
                  <span className="justify-self-end text-gray-600">
                    <Pencil size={18} />
                  </span>
                </div>
              ))}
            </div>

            {filteredStudents.length === 0 && (
              <div className="rounded-xl bg-gray-100 px-5 py-8 text-center text-gray-600">
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
    </div>
  );
}
