import { useAuth } from "../../context/AuthContext";

export default function Topbar() {
  const { user, profile } = useAuth();
  const adminName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";

  return (
    <div className="border-b border-[#D7E2F1] px-4 py-4 sm:px-6">
      <div className="superadmin-navbar-card flex items-center justify-between rounded-2xl bg-[#012920] px-5 py-4 text-white">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Superadmin</h1>
          <p className="text-xs text-white sm:text-sm">
            Welcome back, {adminName}
          </p>
        </div>
      </div>
    </div>
  );
}
