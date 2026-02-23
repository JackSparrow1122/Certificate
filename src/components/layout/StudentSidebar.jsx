import { NavLink, useNavigate } from "react-router-dom";
import { LayoutGrid, User, LogOut, X } from "lucide-react";
import logo from "../../assets/logo.png";
import profileImage from "../../assets/image.jpg";
import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";

const links = [
  {
    name: "Dashboard",
    path: "/student/dashboard",
    end: true,
    icon: LayoutGrid,
  },
  {
    name: "Profile",
    path: "/student/profile",
    icon: User,
  },
];

export default function StudentSidebar({ mobileMenuOpen, setMobileMenuOpen }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { user, role, profile } = useAuth();
  const isExpanded = mobileMenuOpen || expanded;

  const studentName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Student";
  const roleLabel = role === "student" ? "Student" : "User";
  const studentInitial = studentName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await signOut(auth);
    localStorage.clear();
    setMobileMenuOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={`fixed inset-y-0 left-0 z-40 bg-[#0B2A4A] text-white flex flex-col justify-between transition-all duration-300 ease-in-out
        w-72 -translate-x-full md:translate-x-0 md:sticky md:top-0 md:h-screen md:shrink-0 md:overflow-hidden
        ${mobileMenuOpen ? "translate-x-0" : ""}
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
        <div className="px-4 py-8 border-b border-white/10 flex items-center justify-center">
          <img
            src={isExpanded ? logo : profileImage}
            alt="ERP Logo"
            className={`object-contain rounded-xl transition-all duration-300 ${
              isExpanded ? "h-20" : "h-12 w-12 bg-white"
            }`}
          />
        </div>

        {/* Profile */}
        <div
          className={`mx-3 mt-6 flex items-center transition-all ${
            isExpanded
              ? "rounded-xl bg-white/10 p-4 gap-3 justify-start"
              : "p-2 justify-center"
          }`}
        >
          <div className="h-12 w-12 shrink-0 rounded-xl bg-gray-300 text-[#0B2A4A] font-semibold leading-none flex items-center justify-center">
            {studentInitial}
          </div>
          {isExpanded && (
            <div>
              <p className="font-semibold leading-tight">{studentName}</p>
              <span className="text-sm opacity-70">{roleLabel}</span>
            </div>
          )}
        </div>

        {/* Nav Links */}
        <nav className="mt-8 space-y-2 px-3">
          {links.map(({ path, end, name, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-4 px-4 py-3 rounded-xl transition ${
                  isActive
                    ? "bg-white text-[#0B2A4A] font-semibold shadow"
                    : "text-white/90 hover:bg-white/10"
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
          className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/80 hover:bg-white/10 hover:text-red-400 transition w-full"
        >
          <LogOut size={22} />
          {isExpanded && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
