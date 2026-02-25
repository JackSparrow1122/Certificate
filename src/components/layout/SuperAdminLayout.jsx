import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useLocation } from "react-router-dom";

export default function SuperAdminLayout({ children }) {
  const location = useLocation();
  const showTopbar =
    location.pathname === "/superadmin/dashboard" ||
    location.pathname === "/superadmin";

  return (
    <div className="flex h-screen bg-[#F3F6FA]">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        {showTopbar && <Topbar />}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
