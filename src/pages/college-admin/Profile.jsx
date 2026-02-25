import AdminProfilePanel from "../../components/common/AdminProfilePanel";

export default function CollegeAdminProfile() {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-gradient-to-r from-[#0B2A4A] via-[#1D5FA8] to-[#6BC7A7] p-5 text-white shadow-sm">
        <h1 className="text-2xl font-semibold">My Profile</h1>
        <p className="mt-1 text-sm text-white/90">Manage your admin profile and security settings.</p>
      </section>

      <AdminProfilePanel roleLabel="College Admin" />
    </div>
  );
}
