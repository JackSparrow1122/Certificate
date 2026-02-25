import { useAuth } from "../../context/AuthContext";

export default function Topbar() {
  const { user, profile } = useAuth();
  const adminName =
    profile?.name || user?.displayName || user?.email?.split("@")[0] || "Admin";
  const adminInitial = adminName.charAt(0).toUpperCase();

  return (
    <div className="border-b border-white/60 bg-white/70 px-4 py-4 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-[#0B2A4A] via-[#1D5FA8] to-[#6BC7A7] px-5 py-4 text-white shadow-sm">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Superadmin</h1>
          <p className="text-xs text-white/90 sm:text-sm">Welcome back, {adminName}</p>
        </div>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">Control Room</span>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-sm font-bold text-[#0B2A4A]">
            {adminInitial}
          </div>
        </div>
      </div>
    </div>
  );
}
