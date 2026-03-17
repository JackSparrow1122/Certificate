import AdminProfilePanel from "../../components/common/AdminProfilePanel";

export default function CollegeAdminProfile() {
  return (
    <div className="space-y-5">
      <section className="collegeadmin-navbar-card rounded-3xl bg-[#012920] p-5 text-white">
        <h1 className="text-2xl font-semibold">My Profile</h1>
        <p className="mt-1 text-sm text-white/90">
          Manage your admin profile and security settings.
        </p>
      </section>

      <AdminProfilePanel roleLabel="College Admin" />
    </div>
  );
}
