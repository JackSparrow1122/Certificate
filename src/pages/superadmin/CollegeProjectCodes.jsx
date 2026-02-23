import { useParams, useNavigate } from "react-router-dom";
import { projectCodes } from "../../data/projectCodes";
import Sidebar from "../../components/layout/Sidebar";

export default function CollegeProjectCodes() {
  const { collegeId } = useParams();
  const navigate = useNavigate();

const filtered = projectCodes.filter(
  (p) => p.collegeId === collegeId
);
  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 p-8 space-y-6">
        <h1 className="text-2xl font-semibold">
          Project Codes
        </h1>

        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left">Project Code</th>
                <th className="px-6 py-3">Course</th>
                <th className="px-6 py-3">Type</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.code}
                  className="border-t cursor-pointer hover:bg-gray-50"
                  onClick={() =>
                    navigate(
                      `/superadmin/project-codes/${row.code}/students`
                    )
                  }
                >
                  <td className="px-6 py-4 font-medium">
                    {row.code}
                  </td>
                  <td className="px-6 py-4">{row.course}</td>
                  <td className="px-6 py-4">{row.type}</td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No project codes found for this college
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}