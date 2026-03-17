import { useState } from "react";
import { Menu } from "lucide-react";
import StudentSidebar from "./StudentSidebar";
import StudentNavbar from "./StudentNavbar";
import { Outlet, useLocation } from "react-router-dom";

export default function StudentLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const hideNavbar = location.pathname === "/student/profile";

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F5F4EB]">
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 md:hidden ${
          mobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <StudentSidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* MAIN CONTENT */}
      <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-y-auto">
        {!hideNavbar && (
          <StudentNavbar onMenuClick={() => setMobileMenuOpen(true)} />
        )}
        {hideNavbar && (
          <div className="px-4 pt-4 sm:px-6 md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 shadow-sm"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-x-hidden p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
