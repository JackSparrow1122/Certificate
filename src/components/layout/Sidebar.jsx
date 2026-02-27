import { NavLink, useNavigate } from "react-router-dom";
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
import logo from "../../assets/logo.png";
import profileImage from "../../assets/image.jpg";
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

  const handleProfileClick = () => {
    navigate("/superadmin/profile");
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
      } h-screen sticky top-0 shrink-0 overflow-hidden bg-[#0B2A4A] text-white flex flex-col justify-between
         transition-all duration-300 ease-in-out`}
    >
      {/* TOP */}
      <div>
        {/* Logo */}
        <div className="px-4 py-8 border-b border-white/10 flex items-center justify-center">
          <img
            src={expanded ? logo : profileImage}
            alt="Academy Logo"
            className={`object-contain rounded-xl transition-all duration-300 ${
              expanded ? "h-20" : "h-12 w-12 bg-white"
            }`}
          />
        </div>

        {/* Profile */}
        <button
          type="button"
          onClick={handleProfileClick}
          className={`mx-3 mt-6 flex w-[calc(100%-1.5rem)] items-center transition-all ${
            expanded
              ? "rounded-2xl bg-white/12 p-3.5 gap-3 justify-center hover:bg-white/20"
              : "rounded-xl p-2 justify-center hover:bg-white/10"
          }`}
          title="Open Profile"
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-gray-300 text-[#0B2A4A] text-lg font-semibold leading-none flex items-center justify-center">
            {adminInitial}
          </div>
          {expanded && (
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-xl font-semibold leading-tight">
                {adminName}
              </p>
              <span className="block truncate text-sm opacity-80">
                {adminRoleLabel}
              </span>
            </div>
          )}
        </button>

        {/* Menu */}
        <nav className="mt-8 space-y-2 px-3">
          {menu.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={label}
              to={path}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-xl transition
                ${
                  isActive
                    ? "bg-white text-[#0B2A4A] font-semibold shadow"
                    : "text-white/90 hover:bg-white/10"
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
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-red-400 transition w-full"
        >
          <LogOut size={22} />
          {expanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
