import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BookOpenCheck, Building2, GraduationCap, Users } from "lucide-react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { useEffect, useState } from "react";
import { getAllStudents } from "../../../services/studentService";
import { getAllAdmins } from "../../../services/userService";
import { getAllCertificates } from "../../../services/certificateService";
import { getAllColleges } from "../../../services/collegeService";
import { getAllProjectCodes } from "../../../services/projectCodeService";

const SIDEBAR_BLUE = "#0B2A4A";
const ACCENT_BLUE = "#1D5FA8";
const MINT = "#6BC7A7";
const AMBER = "#D29A2D";
const ROSE = "#CA5D7C";
const COLORS = [ACCENT_BLUE, MINT, AMBER, ROSE];

const parseProgress = (progressValue) => {
  const parsed = Number(String(progressValue || "").replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function Dashboard() {
  const [students, setStudents] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, a, c, clg, pc] = await Promise.all([
          getAllStudents(),
          getAllAdmins(),
          getAllCertificates(),
          getAllColleges(),
          getAllProjectCodes(),
        ]);
        if (!mounted) return;
        setStudents(s || []);
        setAdmins(a || []);
        setCertifications(c || []);
        setColleges(clg || []);
        setProjectCodes(pc || []);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const totalStudents = students.length;
  const totalColleges = colleges.length;
  const activeColleges = colleges.filter((college) => String(college.status || "Active") === "Active").length;
  const totalProjectCodes = projectCodes.length;
  const totalCertificates = certifications.length;
  const totalCollegeAdmins = admins.filter((admin) => admin.role === "College Admin").length;

  const studentsByProject = Object.entries(
    students.reduce((accumulator, student) => {
      const key = student.projectId || student.projectCode || "Unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([projectId, count]) => ({ projectId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const studentsByGender = Object.entries(
    students.reduce((accumulator, student) => {
      const key = student.gender || "Unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  ).map(([name, value]) => ({ name, value }));

  const progressBuckets = [
    { bucket: "0-40%", count: 0 },
    { bucket: "41-70%", count: 0 },
    { bucket: "71-100%", count: 0 },
  ];

  students.forEach((student) => {
    const progress = parseProgress(student.progress);
    if (progress <= 40) progressBuckets[0].count += 1;
    else if (progress <= 70) progressBuckets[1].count += 1;
    else progressBuckets[2].count += 1;
  });

  const topStudents = [...students]
    .sort((a, b) => parseProgress(b.progress) - parseProgress(a.progress))
    .slice(0, 6);

  const certificationByPlatform = Object.entries(
    certifications.reduce((accumulator, certificate) => {
      const key = certificate.platform || "Other";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  ).map(([platform, count]) => ({ platform, count }));

  return (
    <SuperAdminLayout>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Users size={18} />} label="Total Students" value={totalStudents} helper="Across all project groups" />
        <MetricCard icon={<Building2 size={18} />} label="Active Colleges" value={`${activeColleges}/${totalColleges}`} helper="Current institution status" />
        <MetricCard icon={<GraduationCap size={18} />} label="Project Codes" value={totalProjectCodes} helper="Configured for batches" />
        <MetricCard icon={<BookOpenCheck size={18} />} label="Certificates" value={totalCertificates} helper={`${totalCollegeAdmins} college admins assigned`} />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.6fr_1fr]">
        <ChartCard title="Progress Breakdown">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={progressBuckets} dataKey="count" nameKey="bucket" innerRadius={52} outerRadius={82}>
                {progressBuckets.map((entry, index) => (
                  <Cell key={entry.bucket} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Students by Project Code">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={studentsByProject}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="projectId" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={ACCENT_BLUE} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Platform Mix">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={certificationByPlatform}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="platform" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={SIDEBAR_BLUE} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.8fr]">
        <ChartCard title="Gender Mix">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={studentsByGender}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={82}
                label
              >
                {studentsByGender.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Performing Students</h2>
            <span className="text-xs text-gray-500">Based on progress percentage</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-2">Student</th>
                  <th className="px-2 py-2">Project</th>
                  <th className="px-2 py-2">Certificate</th>
                  <th className="px-2 py-2">Progress</th>
                  <th className="px-2 py-2">Exams</th>
                </tr>
              </thead>
              <tbody>
                {topStudents.map((student) => (
                  <tr key={student.id} className="border-b border-gray-100 text-gray-800">
                    <td className="px-2 py-2 font-medium">{student.name}</td>
                    <td className="px-2 py-2">{student.projectId}</td>
                    <td className="px-2 py-2">{student.certificate || "-"}</td>
                    <td className="px-2 py-2">{student.progress || "0%"}</td>
                    <td className="px-2 py-2">{student.exams || "0 / 0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </SuperAdminLayout>
  );
}

function MetricCard({ icon, label, value, helper }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-600">{label}</p>
        <span className="rounded-lg bg-[#0B2A4A]/10 p-2 text-[#0B2A4A]">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-gray-900">{title}</h2>
      {children}
    </div>
  );
}
