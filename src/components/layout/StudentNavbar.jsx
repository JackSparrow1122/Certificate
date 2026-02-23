import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const titleByPath = {
  "/student": "Dashboard",
  "/student/dashboard": "Dashboard",
  "/student/profile": "Profile",
};

export default function StudentNavbar({ onMenuClick }) {
  const location = useLocation();
  const { user, profile } = useAuth();
  const heading = titleByPath[location.pathname] || "Student Portal";
  const studentName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Student";
  const studentInitial = studentName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-20 bg-white px-4 sm:px-6 py-3 sm:py-4 border-b flex items-center justify-between">
      <div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">{heading}</h1>
        </div>
        <p className="text-xs sm:text-sm text-gray-500">Welcome back, {studentName}</p>
      </div>

      <div className="hidden sm:flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-200 text-[#0B2A4A] font-semibold flex items-center justify-center">
          {studentInitial}
        </div>
        <span className="text-sm text-gray-700">{studentName}</span>
      </div>
    </header>
  );
}
