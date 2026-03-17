import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { LayoutGrid, Users, Award, CircleHelp, LogOut, X } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import logo from "../../assets/image.png";
import profileImage from "../../assets/logo.png";
import { useAuth } from "../../context/AuthContext";

const COLLEGEADMIN_SIDEBAR_STATE_KEY = "collegeadmin_sidebar_expanded";

export default function CollegeAdminSidebar({ mobileMenuOpen, setMobileMenuOpen }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(COLLEGEADMIN_SIDEBAR_STATE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const { user, role, profile } = useAuth();
  const isExpanded = mobileMenuOpen || expanded;

  const adminName = profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";
  const roleLabel =
    role === "collegeAdmin"
      ? "College Admin"
      : role === "superAdmin"
      ? "Super Admin"
      : "Admin";
  const adminInitial = adminName.charAt(0).toUpperCase();

  const links = [
    { name: "Dashboard", path: "/college-admin/dashboard", end: true, icon: LayoutGrid },
    { name: "Students", path: "/college-admin/students", icon: Users },
    { name: "Certificates", path: "/college-admin/certificates", icon: Award },
    { name: "Help", path: "/college-admin/help", icon: CircleHelp },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
    localStorage.clear();
    setMobileMenuOpen(false);
    navigate("/login", { replace: true });
  };

  const handleMouseEnter = () => {
    setExpanded(true);
    localStorage.setItem(COLLEGEADMIN_SIDEBAR_STATE_KEY, "true");
  };

  const handleMouseLeave = () => {
    setExpanded(false);
    localStorage.setItem(COLLEGEADMIN_SIDEBAR_STATE_KEY, "false");
  };

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`fixed inset-y-0 left-0 z-40 bg-[#acf74d] text-[#012920] flex flex-col justify-between transform-gpu transition-transform duration-300 ease-in-out
        w-72 md:sticky md:top-0 md:h-screen md:shrink-0 md:overflow-hidden md:transition-[width,transform] md:translate-x-0
        ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        ${isExpanded ? "md:w-72" : "md:w-20"}`}
    >
      <div>
        {/* Mobile Close */}
        <div className="flex md:hidden justify-end px-3 pt-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded-lg border border-white/20 p-2"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Logo */}
        <div className="px-4 py-8 flex items-center justify-center">
          <img
            src={isExpanded ? logo : profileImage}
            alt="ERP Logo"
            className={`object-contain rounded-xl transition-all duration-300 ${
              isExpanded ? "h-30" : "h-16 w-16  p-1"
            }`}
          />
        </div>

        {/* Profile */}
        <NavLink
          to="/college-admin/profile"
          className={({ isActive }) =>
            `mx-3 mt-6 flex w-[calc(100%-1.5rem)] items-center transition-all ${
              isActive
                ? "rounded-2xl bg-[#012920] p-1 gap-3 justify-center text-white"
                : isExpanded
                ? "rounded-2xl bg-[white/12] gap-3 justify-center text-[#012920]"
                : "rounded-xl justify-center text-[#012920]"
            }`
          }
        >
          <div
            className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl font-semibold text-lg transition-all duration-300 ${
              isExpanded
                ? "bg-white text-[#012920] border-none"
                : window.location.pathname === "/college-admin/profile"
                ? "bg-[#012920] text-white border-none"
                : "bg-transparent text-[#012920] border-2 border-[#012920]"
            }`}
          >
            {adminInitial}
          </div>
          {isExpanded && (
            <div className="min-w-0 flex-1 text-left ml-3">
              <p className="truncate text-xl font-semibold leading-tight">{adminName}</p>
              <span className="block truncate text-sm opacity-80">{roleLabel}</span>
            </div>
          )}
        </NavLink>

        {/* Nav Links */}
        <nav className="mt-8 space-y-2 px-3">
          {links.map(({ name, path, end, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-xl transition ${
                  isActive
                    ? "bg-[#012920] text-white font-semibold shadow"
                    : "text-[#012920] font-bold"
                }`
              }
            >
              <Icon size={22} />
              {isExpanded && <span className="whitespace-nowrap">{name}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sign Out */}
      <div className="px-3 py-6 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-[#012920]/80 transition w-full"
        >
          <LogOut size={22} />
          {isExpanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}