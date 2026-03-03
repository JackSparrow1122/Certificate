export default function ERPFeatures() {
  const features = [
    {
      title: "Centralized Certificate Management",
      desc: "Manage student certifications, eligibility, and completion status across colleges, courses, and academic years from a single ERP system.",
      icon: "📜",
    },
    {
      title: "Student Progress Tracking",
      desc: "Track certification progress, exams attempted, and completion percentages for every student in real time.",
      icon: "📊",
    },
    {
      title: "Role-Based ERP Access",
      desc: "Secure role-based dashboards for super admins, college admins, faculty coordinators, and students.",
      icon: "🔐",
    },
    {
      title: "College & Department Management",
      desc: "Organize students by college, course, department, and batch with structured project codes and reporting.",
      icon: "🏫",
    },
  ];

  return (
    <section className="bg-white pt-16 pb-24">
      <div className="max-w-7xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">
            Everything You Need
          </h2>
          <p className="mt-4 text-lg text-gray-600 max-w-3xl mx-auto">
            A complete ERP solution designed to manage student certifications,
            academic structure, and progress tracking across institutions.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-white border rounded-2xl p-8 shadow-sm transition"
            >
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#062a4d] text-white text-xl mb-6">
                {f.icon}
              </div>

              <h3 className="text-lg font-semibold text-gray-900">
                {f.title}
              </h3>

              <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}