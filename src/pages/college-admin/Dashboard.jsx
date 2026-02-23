// npm install recharts
import { useMemo } from "react";
import { projects } from "../../data/projects";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export default function AdminDashboard() {
  const COLORS = ["#2563eb", "#16a34a", "#dc2626", "#f59e0b"];

  const data = useMemo(() => {
    const byCourse = {};
    projects.forEach((p) => {
      byCourse[p.course] = (byCourse[p.course] || 0) + 1;
    });

    const barData = Object.keys(byCourse).map((k) => ({
      course: k,
      count: byCourse[k],
    }));

    const pieData = Object.keys(byCourse).map((k) => ({
      name: k,
      value: byCourse[k],
    }));

    const total = pieData.reduce((a, b) => a + b.value, 0);
    const max = Math.max(...pieData.map((d) => d.value));
    const percent = total ? Math.round((max / total) * 100) : 0;

    return {
      totalEnrollments: projects.length,
      completionRate: 68,
      certificatesIssued: Math.floor(projects.length * 0.68),
      barData,
      pieData,
      percent,
    };
  }, []);

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard title="Total Enrollments" value={data.totalEnrollments} />
        <StatCard title="Completion Rate" value={`${data.completionRate}%`} />
        <StatCard title="Certificates Issued" value={data.certificatesIssued} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Enrollment by Department */}
        <div className="bg-white rounded-xl shadow p-6 h-[340px]">
  <h3 className="font-semibold mb-4">Enrollments by Department</h3>

  <ResponsiveContainer width="100%" height="100%">
    <BarChart
      data={data.barData}
      barSize={48}
      margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        vertical={false}
        stroke="#e5e7eb"
      />
      
      <XAxis
  dataKey="course"
  interval={0}
  angle={-20}
  textAnchor="end"
  height={70}
  tick={{ fontSize: 11 }}
  axisLine={false}
  tickLine={false}
/>
      <YAxis
        allowDecimals={false}
        tick={{ fontSize: 12 }}
        axisLine={false}
        tickLine={false}
      />
      <Tooltip
        cursor={{ fill: "#f1f5f9" }}
        contentStyle={{
          borderRadius: "8px",
          border: "none",
          boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
        }}
      />
      <Bar
  dataKey="count"
  radius={[12, 12, 0, 0]}
  fill="url(#colorGradient)"
  isAnimationActive={false}
/>
      <defs>
        <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>
      </defs>
    </BarChart>
  </ResponsiveContainer>
</div>

        {/* Course Popularity */}
  <div className="bg-white rounded-xl shadow p-6 h-[360px]">
  <h3 className="font-semibold mb-4">Course Popularity</h3>

  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={data.pieData}
        dataKey="value"
        nameKey="name"
        innerRadius={70}
        outerRadius={95}
        paddingAngle={6}
        stroke="none"
      >
        {data.pieData.map((_, i) => (
          <Cell
            key={i}
            fill={COLORS[i % COLORS.length]}
          />
        ))}
      </Pie>

      {/* Center Text */}
      <text
        x="50%"
        y="45%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-2xl font-bold fill-gray-800"
      >
        {data.percent}%
      </text>
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="text-sm fill-gray-500"
      >
        Top Course
      </text>

      <Tooltip />

      {/* Legend moved BELOW */}
      <Legend
        verticalAlign="bottom"
        iconType="circle"
        height={60}
        wrapperStyle={{
          fontSize: "12px",
          paddingTop: "12px",
        }}
      />
    </PieChart>
  </ResponsiveContainer>
</div>
</div>
            

      {/* Live Student Tracking Table */}
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold mb-4">
          Live Student Tracking Table
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">Project Code</th>
              <th>College</th>
              <th>Course</th>
              <th>Year</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-2">{p.id}</td>
                <td>{p.college}</td>
                <td>{p.course}</td>
                <td>{p.year}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* Helper Components */

function StatCard({ title, value }) {
  return (
    <div className="bg-white rounded-xl shadow p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="text-2xl font-semibold mt-2">{value}</h2>
    </div>
  );
}