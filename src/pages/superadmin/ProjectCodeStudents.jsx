import { useParams } from "react-router-dom";
import { students } from "../../data/students";

export default function ProjectCodeStudents() {
  const { projectCode } = useParams();

  const filtered = students.filter(
    (s) => s.projectCode === projectCode
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        Students – {projectCode}
      </h1>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3">Email</th>
              <th className="px-6 py-3">Status</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-6 py-4">{s.name}</td>
                <td className="px-6 py-4">{s.email}</td>
                <td className="px-6 py-4">{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}