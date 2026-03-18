import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  GraduationCap,
  BookOpen,
  UserPlus,
  Barcode,
  CircleHelp,
  LogOut,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import logo from "../../assets/image.png";
import profileImage from "../../assets/logo.png";
import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

const SUPERADMIN_SIDEBAR_STATE_KEY = "superadmin_sidebar_expanded";

export default function Sidebar() {
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(SUPERADMIN_SIDEBAR_STATE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, profile } = useAuth();

  const adminName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";

  const effectiveRole = profile?.role || role;

  const adminRoleLabel =
    effectiveRole === "collegeAdmin"
      ? "College Admin"
      : effectiveRole === "superAdmin"
      ? "Super Admin"
      : "Admin";

  const adminInitial = adminName.charAt(0).toUpperCase();

  const handleLogout = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const handleMouseEnter = () => {
    setExpanded(true);
    localStorage.setItem(SUPERADMIN_SIDEBAR_STATE_KEY, "true");
  };

  const handleMouseLeave = () => {
    setExpanded(false);
    localStorage.setItem(SUPERADMIN_SIDEBAR_STATE_KEY, "false");
  };

  const menu = [
    { label: "Dashboard", path: "/superadmin/dashboard", icon: LayoutGrid },
    { label: "Colleges", path: "/superadmin/colleges", icon: GraduationCap },
    {
      label: "Certification Config",
      path: "/superadmin/certificationconfig",
      icon: BookOpen,
    },
    { label: "Admins", path: "/superadmin/admins", icon: UserPlus },
    {
      label: "Project Codes",
      path: "/superadmin/projectcodes",
      icon: Barcode,
    },
    { label: "Help", path: "/superadmin/help", icon: CircleHelp },
  ];

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`${
        expanded ? "w-72" : "w-20"
      } h-screen sticky top-0 shrink-0 overflow-hidden bg-[#CFFF92] text-[#012920] flex flex-col justify-between
      transition-[width,transform] duration-300 ease-in-out`}
    >
      {/* TOP */}
      <div>
        {/* Logo */}
        <div className="px-4 py-8 flex items-center justify-center">
          <img
            src={expanded ? logo : profileImage}
            alt="Academy Logo"
            className={`object-contain rounded-xl transition-all duration-300 ${
              expanded ? "h-30" : "h-16 w-16  p-1"
            }`}
          />
        </div>

        {/* PROFILE */}
        <NavLink
          to="/superadmin/profile"
          className={({ isActive }) =>
            `mx-3 mt-6 flex w-[calc(100%-1.5rem)] items-center transition-all ${
              isActive
                ? "rounded-2xl bg-[#012920] p-3 gap-3 justify-center text-white"
                : expanded
                ? "rounded-2xl bg-[white/12] gap-3 justify-center text-[#012920]"
                : "rounded-xl justify-center text-[#012920]"
            }`
          }
        >
          <div
            className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl font-semibold text-lg transition-all duration-300 ${
              expanded
                ? "bg-white text-[#012920]"
                : location.pathname === "/superadmin/profile"
                ? "bg-[#012920] text-white border-none"
                : "bg-transparent text-[#012920] border-2 border-[#012920]"
            }`}
          >
            {adminInitial}
          </div>

          {expanded && (
            <div className="min-w-0 flex-1 text-left ml-3">
              <p className="truncate text-xl font-semibold leading-tight">
                {adminName}
              </p>
              <span className="block truncate text-sm opacity-80">
                {adminRoleLabel}
              </span>
            </div>
          )}
        </NavLink>

        {/* MENU */}
        <nav className="mt-8 space-y-2 px-3">
          {menu.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={label}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-xl transition ${
                  isActive
                    ? "bg-[#012920] text-white font-semibold shadow"
                    : "text-[#012920] font-bold"
                }`
              }
            >
              <Icon size={22} />
              {expanded && <span className="whitespace-nowrap">{label}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* SIGN OUT */}
      <div className="px-3 py-6 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-[#012920]/80 transition w-full"
        >
          <LogOut size={22} />
          {expanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}