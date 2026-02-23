import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, User } from "lucide-react";
import logo from "../../assets/logo.png";
import { useState } from "react";

const links = [
  {
    name: "Dashboard",
    path: "/student/dashboard",
    end: true,
    icon: LayoutDashboard,
  },
  {
    name: "Profile",
    path: "/student/profile",
    icon: User,
  },
];

export default function StudentSidebar() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(true);

  return (
    <aside
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`h-screen bg-[#062a4d] text-white flex flex-col
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-20" : "w-64"}`}
    >
      {/* LOGO */}
      <div className="h-20 flex items-center justify-center px-4 border-b border-white/10">
        <img
          src={logo}
          alt="ERP Logo"
          className={`object-contain transition-all duration-300
            ${collapsed ? "h-8" : "h-10"}`}
        />
      </div>

      {/* NAV LINKS */}
      <nav className="flex-1 px-2 py-6 space-y-2">
        {links.map(({ path, end, name, icon: Icon }) => (
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
            {!collapsed && (
              <span className="whitespace-nowrap">{name}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* SIGN OUT */}
      <div className="px-2 pb-6">
        <button
          onClick={() => navigate("/login")}
          className="flex items-center gap-4 w-full px-4 py-3 rounded-lg
                     text-red-400 hover:bg-red-500/10 hover:text-red-300 transition"
        >
          <span className="text-lg">⎋</span>
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}