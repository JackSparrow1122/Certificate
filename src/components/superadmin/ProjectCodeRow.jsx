import { Trash2 } from "lucide-react";

export default function ProjectCodeRow({ row }) {
  return (
    <tr className="border-b border-[#E6EDF6] transition hover:bg-[#FAFCFF] last:border-none">
      {/* Project Code */}
      <td className="px-6 py-4 text-sm font-semibold text-[#0B2A4A]">{row.code}</td>

      {/* College */}
      <td className="px-6 py-4">
        {row.matched ? (
          <span className="rounded-full bg-[#E8F7F0] px-3 py-1 text-xs font-semibold text-[#0B6E4F]">
            {row.college}
          </span>
        ) : (
          <div>
            <span className="inline-flex items-center rounded-full bg-[#FFF4D8] px-2.5 py-1 text-xs font-semibold text-[#946000]">
              ⚠ Unmapped
            </span>
            <p className="text-xs text-gray-500">{row.college}</p>
          </div>
        )}
      </td>

      {/* Course */}
      <td className="px-6 py-4 text-sm text-[#0B2A4A]">
        <p className="font-medium">{row.course}</p>
        <p className="text-xs text-gray-500">{row.year}</p>
      </td>

      {/* Metadata */}
      <td className="px-6 py-4">
        <div className="flex gap-2">
          <span className="rounded-full bg-[#EEF3FA] px-3 py-1 text-xs text-[#0B2A4A]">
            Type: {row.type}
          </span>
          <span className="rounded-full bg-[#EEF3FA] px-3 py-1 text-xs text-[#0B2A4A]">
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
