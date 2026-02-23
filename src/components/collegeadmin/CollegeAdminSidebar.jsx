import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Award,
  FileText,
  HelpCircle,
  LogOut,
} from "lucide-react";
import logo from "../../assets/logo.png";

export default function CollegeAdminSidebar() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);

  const links = [
    {
      name: "Dashboard",
      path: "/college-admin",
      end: true,
      icon: LayoutDashboard,
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
      icon: HelpCircle,
    },
  ];

  const handleSignOut = () => {
    navigate("/login");
  };

  return (
    <aside
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`h-screen bg-[#062a4d] text-white flex flex-col
      transition-all duration-300 ease-in-out
      ${collapsed ? "w-20" : "w-64"}`}
    >
      {/* LOGO */}
      <div className="h-20 flex items-center justify-center border-b border-white/10">
        <img
          src={logo}
          alt="ERP Logo"
          className={`object-contain transition-all duration-300 ${
            collapsed ? "h-8" : "h-10"
          }`}
        />
      </div>

      {/* NAV LINKS */}
      <nav className="px-2 py-6 space-y-2 flex-1">
        {links.map(({ name, path, end, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-4 px-4 py-3 rounded-lg transition
              ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-white/10"
              }`
            }
          >
            <Icon className="w-5 h-5 shrink-0" />
            {!collapsed && <span>{name}</span>}
          </NavLink>
        ))}
      </nav>

      {/* SIGN OUT */}
      <div className="px-2 pb-6">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-4 w-full px-4 py-3 rounded-lg
                     text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}