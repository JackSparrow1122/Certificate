import { useState } from "react";
import StudentSidebar from "../layout/StudentSidebar";
import StudentNavbar from "../layout/StudentNavbar";
import { Outlet } from "react-router-dom";

export default function StudentLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen bg-gray-100 overflow-x-hidden">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <StudentSidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* MAIN CONTENT */}
      <div className="flex flex-col flex-1 min-w-0 w-full">
        <StudentNavbar onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="p-4 sm:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
