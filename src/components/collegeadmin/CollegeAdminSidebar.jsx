import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutGrid,
  Users,
  Award,
  FileText,
  CircleHelp,
  LogOut,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import logo from "../../assets/logo.png";
import profileImage from "../../assets/image.jpg";
import { useAuth } from "../../context/AuthContext";

export default function CollegeAdminSidebar() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { user, role, profile } = useAuth();

  const adminName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";
  const roleLabel =
    role === "collegeAdmin" ? "College Admin" : role === "superAdmin" ? "Super Admin" : "Admin";
  const adminInitial = adminName.charAt(0).toUpperCase();

  const links = [
    {
      name: "Dashboard",
      path: "/college-admin",
      end: true,
      icon: LayoutGrid,
    },
    {
      name: "Students",
      path: "/college-admin/students",
      icon: Users,
    },
    {
      name: "Certificates",
      path: "/college-admin/certificates",
      icon: Award,
    },
    {
      name: "Exams",
      path: "/college-admin/exams",
      icon: FileText,
    },
    {
      name: "Help",
      path: "/college-admin/help",
      icon: CircleHelp,
    },
  ];

  const handleSignOut = async () => {
    await signOut(auth);
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const handleProfileClick = () => {
    navigate("/college-admin/profile");
  };

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`${
        expanded ? "w-72" : "w-20"
      } h-screen sticky top-0 shrink-0 overflow-hidden bg-[#0B2A4A] text-white flex flex-col justify-between transition-all duration-300 ease-in-out`}
    >
      <div>
        {/* Logo */}
        <div className="px-4 py-8 border-b border-white/10 flex items-center justify-center">
          <img
            src={expanded ? logo : profileImage}
            alt="ERP Logo"
            className={`object-contain rounded-xl transition-all duration-300 ${
              expanded ? "h-20" : "h-12 w-12 bg-white"
            }`}
          />
        </div>

        {/* Profile */}
        <button
          type="button"
          onClick={handleProfileClick}
          className={`mx-3 mt-6 flex items-center transition-all ${
            expanded
              ? "rounded-xl bg-white/10 p-3 gap-3 justify-start hover:bg-white/20"
              : "rounded-xl p-2 justify-center hover:bg-white/10"
          }`}
          title="Open Profile"
        >
          <div className="h-10 w-10 shrink-0 rounded-xl bg-gray-300 text-[#0B2A4A] text-lg font-semibold leading-none flex items-center justify-center">
            {adminInitial}
          </div>
          {expanded && (
            <div>
              <p className="text-lg font-semibold leading-tight">{adminName}</p>
              <span className="text-xs opacity-70">{roleLabel}</span>
            </div>
          )}
        </button>

        {/* Nav Links */}
        <nav className="mt-8 space-y-2 px-3">
          {links.map(({ name, path, end, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-xl transition ${
                  isActive
                    ? "bg-white text-[#0B2A4A] font-semibold shadow"
                    : "text-white/90 hover:bg-white/10"
                }`
              }
            >
              <Icon size={22} />
              {expanded && <span className="whitespace-nowrap">{name}</span>}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Sign Out */}
      <div className="px-3 py-6 border-t border-white/10">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-red-400 transition w-full"
        >
          <LogOut size={22} />
          {expanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
