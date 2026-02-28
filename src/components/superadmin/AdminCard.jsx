import AdminActionsMenu from "./AdminActionsMenu";
import { Shield } from "lucide-react";

export default function AdminCard({ admin, onEdit, onDelete }) {
  const isSuperAdmin = admin.role === "superAdmin";
  const roleBgColor = isSuperAdmin ? "bg-purple-100" : "bg-blue-100";
  const roleTextColor = isSuperAdmin ? "text-purple-600" : "text-blue-600";
  const roleLabel = isSuperAdmin ? "Super Admin" : "College Admin";

  return (
    <div className="relative bg-white rounded-2xl p-5 shadow-sm border">
      {/* Actions */}
      <div className="absolute top-4 right-4">
        <AdminActionsMenu
          onEdit={() => onEdit(admin)}
          onDelete={() => onDelete(admin)}
        />
      </div>

      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={`h-12 w-12 rounded-full ${roleBgColor} flex items-center justify-center`}
        >
          <Shield className={roleTextColor} />
        </div>

        {/* Info */}
        <div className="flex-1">
          <p className="font-semibold">{admin.name}</p>
          <p className="text-sm text-gray-500">{admin.email}</p>

          <div className="mt-2 text-sm text-gray-600 flex items-center gap-1">
            <span>🏫</span>
            <span>{admin.college}</span>
          </div>

          <div className="mt-2">
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-medium ${roleBgColor} ${roleTextColor}`}
            >
              {roleLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
