import { Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export default function CollegeAdminNavbar({ onMenuClick }) {
  const { user, profile } = useAuth();
  const adminName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";

  return (
    <header className="h-16 bg-white border-b flex items-center px-4 sm:px-6 md:px-8 gap-3">
      <button
        type="button"
        onClick={onMenuClick}
        className="md:hidden inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <p className="text-sm sm:text-base text-gray-500">
        Welcome back, <span className="font-medium">{adminName}</span>.
      </p>
    </header>
  );
}
