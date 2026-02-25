import { useState } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { projectCodes } from "../../data/projectCodes";
import ProjectCodeRow from "../../components/superadmin/ProjectCodeRow";
import { RefreshCcw, Upload } from "lucide-react";

export default function ProjectCodes() {
  const [search, setSearch] = useState("");

  const filtered = projectCodes.filter((p) =>
    p.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SuperAdminLayout>
      <div className="p-2 sm:p-2 md:p-3 lg:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Project Codes</h1>
            <p className="text-gray-500 text-sm">
              Manage your feedback system
            </p>
          </div>

          <button className="flex items-center gap-2 px-4 py-2 bg-[#0B2A4A] text-white rounded-lg">
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {/* Search + Actions */}
        <div className="flex items-center justify-between mb-4">
          <input
            type="text"
            placeholder="Search project codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[420px] px-4 py-2 rounded-lg border focus:outline-none"
          />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {filtered.length} Codes
            </span>

            <button className="px-4 py-2 border rounded-lg">
              Rerun Matching
            </button>

            <button className="flex items-center gap-2 px-4 py-2 bg-[#0B2A4A] text-white rounded-lg">
              <Upload size={16} />
              Import JSON
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-sm text-gray-600">
              <tr>
                <th className="px-6 py-3">Project Code</th>
                <th className="px-6 py-3">College</th>
                <th className="px-6 py-3">Course</th>
                <th className="px-6 py-3">Metadata</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((row) => (
                <ProjectCodeRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SuperAdminLayout>
  );
}
