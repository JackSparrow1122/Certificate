import { useEffect, useState } from "react";
import { getAllStudents } from "../../../services/studentService";
import { getAllCertificates } from "../../../services/certificateService";

const parseProgress = (value) => {
  const parsed = Number(String(value || "").replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Certificates() {
  const [students, setStudents] = useState([]);
  const [certifications, setCertifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, c] = await Promise.all([getAllStudents(), getAllCertificates()]);
        if (!mounted) return;
        setStudents(s || []);
        setCertifications(c || []);
      } catch (error) {
        console.error("Failed to load certificate data:", error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const certificateRows = certifications.map((certificate) => {
    const enrolledStudents = students.filter((student) =>
      String(student.certificate || "")
        .toLowerCase()
        .includes(String(certificate.platform || "").toLowerCase()),
    );

    const avgProgress =
      enrolledStudents.length > 0
        ? Math.round(
            enrolledStudents.reduce(
              (sum, student) => sum + parseProgress(student.progress),
              0,
            ) / enrolledStudents.length,
          )
        : 0;

    return {
      ...certificate,
      enrolledCount: enrolledStudents.length,
      avgProgress,
    };
  });

  const totalEnrolled = certificateRows.reduce(
    (sum, row) => sum + row.enrolledCount,
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Configured Certificates" value={certificateRows.length} />
        <StatCard title="Total Enrollments" value={totalEnrolled} />
        <StatCard
          title="Avg Progress"
          value={`${Math.round(
            certificateRows.reduce((sum, row) => sum + row.avgProgress, 0) /
              Math.max(certificateRows.length, 1),
          )}%`}
        />
      </section>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Certificate Overview</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3">Certificate</th>
                <th className="py-2 pr-3">Platform</th>
                <th className="py-2 pr-3">Exam Code</th>
                <th className="py-2 pr-3">Level</th>
                <th className="py-2 pr-3">Enrolled Students</th>
                <th className="py-2">Avg Progress</th>
              </tr>
            </thead>
            <tbody>
              {certificateRows.map((row) => (
                <tr key={row.id} className="border-b">
                  <td className="py-2 pr-3 font-medium">{row.name}</td>
                  <td className="py-2 pr-3">{row.platform}</td>
                  <td className="py-2 pr-3">{row.examCode}</td>
                  <td className="py-2 pr-3">{row.level}</td>
                  <td className="py-2 pr-3">{row.enrolledCount}</td>
                  <td className="py-2">{row.avgProgress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
