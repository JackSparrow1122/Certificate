import { Trash2 } from "lucide-react";

export default function ProjectCodeRow({ row }) {
  return (
    <tr className="border-b last:border-none">
      {/* Project Code */}
      <td className="px-6 py-4 text-sm font-medium">{row.code}</td>

      {/* College */}
      <td className="px-6 py-4">
        {row.matched ? (
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            {row.college}
          </span>
        ) : (
          <div>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-1 text-yellow-800 text-xs font-semibold">
              ⚠ Unmapped
            </span>
            <p className="text-xs text-gray-500">{row.college}</p>
          </div>
        )}
      </td>

      {/* Course */}
      <td className="px-6 py-4 text-sm">
        <p>{row.course}</p>
        <p className="text-xs text-gray-500">{row.year}</p>
      </td>

      {/* Metadata */}
      <td className="px-6 py-4">
        <div className="flex gap-2">
          <span className="px-3 py-1 rounded-full bg-gray-100 text-xs">
            Type: {row.type}
          </span>
          <span className="px-3 py-1 rounded-full bg-gray-100 text-xs">
            {row.academicYear}
          </span>
        </div>
      </td>

      {/* Delete */}
      <td className="px-6 py-4 text-right">
        <button className="text-red-500 hover:text-red-600">
          <Trash2 size={16} />
        </button>
      </td>
    </tr>
  );
}
