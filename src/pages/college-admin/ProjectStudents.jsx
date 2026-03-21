import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getStudentsByProject } from "../../../services/studentService";
import StudentModal from "../../components/StudentModal";

export default function ProjectStudents() {
  const { projectId } = useParams();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [filteredStudents, setFilteredStudents] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const s = await getStudentsByProject(projectId);
        if (!mounted) return;
        setFilteredStudents(s || []);
      } catch (error) {
        console.error("Failed to load project students:", error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [projectId]);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        Students – {projectId}
      </h1>

      <div className="bg-white rounded-xl shadow p-6">
        <table className="w-full border-separate border-spacing-y-3">
          <thead className="text-gray-500 text-sm">
            <tr>
              <th className="text-left px-3">Roll No</th>
              <th className="text-left px-3">Name</th>
              <th className="text-left px-3">Email Id</th>
              <th className="text-left px-3">Current Year</th>
              <th className="text-left px-3">Admission Year</th>
            
            </tr>
          </thead>

          <tbody>
            {filteredStudents.map((s) => (
              <tr
                key={s.id}
                onClick={() => setSelectedStudent(s)}
                className="bg-gray-50 cursor-pointer"
              >
                <td className="px-3 py-3 font-medium">{s.id}</td>
                <td className="px-3">{s.name}</td>
                <td className="px-3">{s.email}</td>
                <td className="px-3">{s.currentYear || s.currentSemester || "-"}</td>
                 <td className="px-3">{s.admissionYear}</td>
               
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      <StudentModal
        student={selectedStudent}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
