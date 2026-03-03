import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  getStudentsByProject,
  getStudentsByProjectCount,
} from "../../../services/studentService";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import {
  getAllColleges,
  getCollegeByCode,
} from "../../../services/collegeService";
import {
  cacheAgeLabel,
  getCached,
  setCached,
} from "../../utils/dashboardCache";
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
import { Award, BookOpenCheck, Layers3, Users } from "lucide-react";

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizeCollegeLogoUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lowerRaw = raw.toLowerCase();
  if (lowerRaw.startsWith("http://") || lowerRaw.startsWith("https://"))
    return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return "";
};

const DASHBOARD_SAMPLE_PROJECT_LIMIT = 12;
const DASHBOARD_SAMPLE_STUDENTS_PER_PROJECT = 120;

export default function AdminDashboard() {
  const { profile } = useAuth();
  const COLORS = ["#0B2A4A", "#1D5FA8", "#6BC7A7", "#D29A2D"];
  const collegeCode = String(
    profile?.collegeCode || profile?.college_code || "",
  )
    .trim()
    .toUpperCase();

  const parseProgress = (progressValue) => {
    const parsed = Number(
      String(progressValue || "")
        .replace("%", "")
        .trim(),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const hasPassedCertificate = (student) => {
    const results =
      student?.certificateResults &&
      typeof student.certificateResults === "object"
        ? Object.values(student.certificateResults).filter((r) => !r?.isDeleted)
        : [];

    if (
      results.some((result) =>
        ["passed", "completed"].includes(
          String(result?.status || result?.result || "").toLowerCase(),
        ),
      )
    ) {
      return true;
    }

    return ["passed", "completed"].includes(
      String(
        student?.certificateStatus ||
          student?.certificateResult?.status ||
          student?.certificateResult?.result ||
          "",
      ).toLowerCase(),
    );
  };

  const getStudentProgress = (student) =>
    hasPassedCertificate(student) ? 100 : parseProgress(student?.progress);

  const [students, setStudents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectStudentCounts, setProjectStudentCounts] = useState({});
  const [certifications, setCertifications] = useState([]);
  const [collegeInfo, setCollegeInfo] = useState({ name: "", logo: "" });
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [isLayoutResizing, setIsLayoutResizing] = useState(false);
  const [cacheInfo, setCacheInfo] = useState({ cachedAt: 0, isStale: false });

  useEffect(() => {
    let resizeTimer;
    const handleResize = () => {
      setIsLayoutResizing(true);
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        setIsLayoutResizing(false);
      }, 260);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const CA_CACHE_KEY = `college_admin_dashboard_${collegeCode}`;

    // Hydrate from cache immediately — prevents blank graphs on reconnect
    const cached = getCached(CA_CACHE_KEY);
    if (cached?.data && collegeCode) {
      const d = cached.data;
      setStudents(d.students || []);
      setProjects(d.projects || []);
      setProjectStudentCounts(d.projectStudentCounts || {});
      setCertifications(d.certifications || []);
      setCollegeInfo(d.collegeInfo || { name: "", logo: "" });
      setCacheInfo({ cachedAt: cached.cachedAt, isStale: cached.isStale });
    }

    const load = async () => {
      try {
        if (!collegeCode) {
          if (!mounted) return;
          setStudents([]);
          setProjects([]);
          setProjectStudentCounts({});
          setCertifications([]);
          setCollegeInfo({ name: "", logo: "" });
          return;
        }

        let college = null;
        try {
          college = await getCollegeByCode(collegeCode);
        } catch (error) {
          console.warn("Failed to fetch college by code:", error);
        }
        if (!college) {
          try {
            const allColleges = await getAllColleges();
            college =
              (allColleges || []).find((row) => {
                const byDocId =
                  normalizeCode(row?.collegeCode) ===
                  normalizeCode(collegeCode);
                const byField =
                  normalizeCode(row?.college_code) ===
                  normalizeCode(collegeCode);
                return byDocId || byField;
              }) || null;
          } catch (error) {
            console.warn("Failed to fetch colleges list:", error);
          }
        }

        const projectRows = await getProjectCodesByCollege(collegeCode);
        const normalizedProjects = (projectRows || [])
          .filter((project) => String(project?.code || "").trim())
          .sort((a, b) =>
            String(a.code || "").localeCompare(String(b.code || "")),
          );

        // Fetch counts and sampled student docs in parallel
        const sampledProjects = normalizedProjects.slice(
          0,
          DASHBOARD_SAMPLE_PROJECT_LIMIT,
        );

        const [countEntries, sampledGroups] = await Promise.all([
          // Server-side counts for ALL projects — lightweight
          Promise.all(
            normalizedProjects.map(async (project) => {
              const projectCode = String(project.code || "").trim();
              const count = await getStudentsByProjectCount(projectCode);
              return [projectCode, Number(count || 0)];
            }),
          ),
          // Sampled student docs only for chart rendering
          Promise.all(
            sampledProjects.map((project) =>
              getStudentsByProject(String(project.code || "").trim(), {
                maxDocs: DASHBOARD_SAMPLE_STUDENTS_PER_PROJECT,
              }),
            ),
          ),
        ]);

        const countsByProject = Object.fromEntries(countEntries);
        const studentsForCollege = sampledGroups.flatMap(
          (group) => group || [],
        );
        const certificateNames = new Set();

        studentsForCollege.forEach((student) => {
          const certificateResults =
            student?.certificateResults &&
            typeof student.certificateResults === "object"
              ? Object.values(student.certificateResults).filter(
                  (r) => !r?.isDeleted,
                )
              : [];

          certificateResults.forEach((result) => {
            const name = String(result?.certificateName || "").trim();
            if (name) {
              certificateNames.add(name);
            }
          });

          const legacyName = String(student?.certificate || "").trim();
          if (legacyName) {
            certificateNames.add(legacyName);
          }
        });

        if (!mounted) return;
        setStudents(studentsForCollege);
        setProjects(normalizedProjects);
        setProjectStudentCounts(countsByProject);
        setCertifications(Array.from(certificateNames));
        const newCollegeInfo = {
          name: String(
            college?.college_name || profile?.collegeName || collegeCode || "",
          ).trim(),
          logo: normalizeCollegeLogoUrl(
            college?.college_logo ||
              college?.collegeLogo ||
              college?.logo ||
              "",
          ),
        };
        setCollegeInfo(newCollegeInfo);
        setLogoLoadFailed(false);

        // Write fresh data to cache
        setCached(CA_CACHE_KEY, {
          students: studentsForCollege,
          projects: normalizedProjects,
          projectStudentCounts: countsByProject,
          certifications: Array.from(certificateNames),
          collegeInfo: newCollegeInfo,
        });
        setCacheInfo({ cachedAt: Date.now(), isStale: false });
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        // Do NOT zero out state here — cached values stay visible when offline
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [collegeCode]);

  const data = useMemo(() => {
    const byCourse = {};
    projects.forEach((p) => {
      const courseKey = p.course || p.courseCode || "Unknown";
      byCourse[courseKey] =
        (byCourse[courseKey] || 0) +
        Number(projectStudentCounts[String(p.code || "").trim()] || 0);
    });

    const barData = Object.keys(byCourse).map((k) => ({
      course: k,
      count: byCourse[k],
    }));

    const pieData = Object.keys(byCourse).map((k) => ({
      name: k,
      value: byCourse[k],
    }));

    const progressBands = [
      { name: "0-40%", value: 0 },
      { name: "41-70%", value: 0 },
      { name: "71-100%", value: 0 },
    ];

    students.forEach((student) => {
      const progress = getStudentProgress(student);
      if (progress <= 40) progressBands[0].value += 1;
      else if (progress <= 70) progressBands[1].value += 1;
      else progressBands[2].value += 1;
    });

    const avgProgress =
      students.length > 0
        ? Math.round(
            students.reduce(
              (sum, student) => sum + getStudentProgress(student),
              0,
            ) / students.length,
          )
        : 0;

    const topProjects = projects
      .map((project) => ({
        ...project,
        totalStudents: Number(
          projectStudentCounts[String(project.code || "").trim()] || 0,
        ),
      }))
      .sort((a, b) => b.totalStudents - a.totalStudents)
      .slice(0, 5);

    const totalEnrollments = Object.values(projectStudentCounts).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    );

    return {
      totalEnrollments,
      completionRate: `${avgProgress}%`,
      certificatesIssued: certifications.length,
      activeProjectCodes: projects.length,
      barData,
      pieData,
      progressBands,
      topProjects,
    };
  }, [students, projects, certifications, projectStudentCounts]);

  const certificationData = useMemo(() => {
    const statsByCertificate = {};

    students.forEach((student) => {
      const results =
        student.certificateResults &&
        typeof student.certificateResults === "object"
          ? Object.values(student.certificateResults).filter(
              (r) => !r?.isDeleted,
            )
          : [];

      // Handle new structure with multiple certificate results
      if (results.length > 0) {
        results.forEach((result) => {
          const certName = String(result?.certificateName || "").trim();
          if (!certName) return;

          if (!statsByCertificate[certName]) {
            statsByCertificate[certName] = {
              label: certName,
              Enrolled: 0,
              Passed: 0,
              Failed: 0,
            };
          }

          const s = String(result.status || result.result || "").toLowerCase();
          if (["passed", "completed"].includes(s)) {
            statsByCertificate[certName].Passed += 1;
          } else if (s === "failed") {
            statsByCertificate[certName].Failed += 1;
          } else {
            statsByCertificate[certName].Enrolled += 1;
          }
        });
      }
      // Handle legacy structure with a single certificate
      const legacyCertName = String(student.certificate || "").trim();
      if (legacyCertName && results.length === 0) {
        if (!statsByCertificate[legacyCertName]) {
          statsByCertificate[legacyCertName] = {
            label: legacyCertName,
            Enrolled: 0,
            Passed: 0,
            Failed: 0,
          };
        }
        const s = String(
          student.certificateStatus ||
            student.certificateResult?.status ||
            student.certificateResult?.result ||
            "enrolled",
        ).toLowerCase();
        if (["passed", "completed"].includes(s)) {
          statsByCertificate[legacyCertName].Passed += 1;
        } else if (s === "failed") {
          statsByCertificate[legacyCertName].Failed += 1;
        } else {
          statsByCertificate[legacyCertName].Enrolled += 1;
        }
      }
    });

    return Object.values(statsByCertificate).sort((a, b) =>
      String(a.label).localeCompare(String(b.label)),
    );
  }, [students]);

  const splitCertificateLabel = (value) => {
    const text = String(value || "").trim();
    if (!text) return [""];

    const words = text.split(/\s+/);
    const lines = [];
    const maxCharsPerLine = 14;
    const maxLines = 2;
    let currentLine = "";

    words.forEach((word) => {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        currentLine = candidate;
        return;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (lines.length > maxLines) {
      const clamped = lines.slice(0, maxLines);
      const last = clamped[maxLines - 1];
      clamped[maxLines - 1] =
        last.length > maxCharsPerLine - 1
          ? `${last.slice(0, maxCharsPerLine - 1)}…`
          : `${last}…`;
      return clamped;
    }

    return lines;
  };

  const renderCertificateTick = ({ x, y, payload }) => {
    const lines = splitCertificateLabel(payload?.value);

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="middle"
          fill="#4b5563"
          fontSize={12}
        >
          {lines.map((line, index) => (
            <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 13}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-6">
      <section className="collegeadmin-navbar-card rounded-3xl border border-[#D7E2F1] bg-white px-6 py-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#0B2A4A]">
              College Admin Control Center
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Monitor enrollments, performance trends, and certification health.
            </p>
            {cacheInfo.cachedAt > 0 && (
              <p className="mt-1 text-xs text-gray-400">
                {cacheInfo.isStale ? "⚠\uFE0F " : ""}Last updated:{" "}
                {cacheAgeLabel(cacheInfo.cachedAt)}
              </p>
            )}
          </div>
          <div className="hidden md:flex md:items-center">
            {collegeInfo.logo && !logoLoadFailed ? (
              <img
                src={collegeInfo.logo}
                alt={collegeInfo.name || "College"}
                className="max-h-24 w-auto max-w-104 rounded-lg"
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-[#0B2A4A] text-3xl font-bold text-white">
                {String(collegeCode || "CLG").slice(0, 2)}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Enrollments"
          value={data.totalEnrollments}
          icon={<Users size={18} />}
        />
        <StatCard
          title="Avg Completion"
          value={data.completionRate}
          icon={<BookOpenCheck size={18} />}
        />
        <StatCard
          title="Certificates"
          value={data.certificatesIssued}
          icon={<Award size={18} />}
        />
        <StatCard
          title="Project Codes"
          value={data.activeProjectCodes}
          icon={<Layers3 size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Enrollment by Course">
          <ResponsiveContainer width="100%" height={270} debounce={75}>
            <BarChart data={data.barData} barSize={42}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
              />
              <XAxis dataKey="course" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={false} />
              <Bar
                dataKey="count"
                fill="#1D5FA8"
                radius={[10, 10, 0, 0]}
                rootTabIndex={-1}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Certification Enrollment & Results">
          <ResponsiveContainer width="100%" height={270} debounce={75}>
            <BarChart
              data={certificationData}
              barCategoryGap="22%"
              maxBarSize={54}
              margin={{ top: 24, right: 20, left: 0, bottom: 28 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
              />
              <XAxis
                dataKey="label"
                interval={0}
                height={48}
                tickMargin={4}
                tick={renderCertificateTick}
              />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={{ fill: "#f3f4f6" }} />
              <Legend verticalAlign="top" align="right" />
              <Bar
                dataKey="Enrolled"
                name="Ongoing"
                stackId="a"
                fill="#1D5FA8"
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
              />
              <Bar
                dataKey="Passed"
                stackId="a"
                fill="#6BC7A7"
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
              />
              <Bar
                dataKey="Failed"
                stackId="a"
                fill="#EF4444"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Student Progress Distribution">
          <ResponsiveContainer width="100%" height={270} debounce={75}>
            <PieChart>
              <Pie
                data={data.progressBands}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={92}
                rootTabIndex={-1}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              >
                {data.progressBands.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip cursor={false} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Course Share">
          <ResponsiveContainer width="100%" height={260} debounce={75}>
            <PieChart>
              <Pie
                data={data.pieData}
                dataKey="value"
                nameKey="name"
                outerRadius={92}
                rootTabIndex={-1}
                label={!isLayoutResizing}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              >
                {data.pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip cursor={false} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Recent Project Batches">
          <div className="space-y-3">
            {data.topProjects.map((project) => (
              <div
                key={project.id || project.code}
                className="rounded-xl border border-[#D7E2F1] bg-[#F7FAFF] px-4 py-3"
              >
                <p className="text-sm font-semibold text-gray-900">
                  {project.code || project.id}
                </p>
                <p className="text-xs text-gray-600">{project.course}</p>
                <p className="mt-1 text-xs text-[#0B2A4A]">
                  {project.totalStudents} students
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Live Student Tracking Table">
        <div className="overflow-x-auto">
          <table className="min-w-160 w-full text-sm">
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
                <tr key={p.id || p.code} className="border-t">
                  <td className="py-2">{p.code || p.id}</td>
                  <td>{p.college || "-"}</td>
                  <td>{p.course || p.courseCode || "-"}</td>
                  <td>{p.year || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/* Helper Components */

function StatCard({ title, value, icon }) {
  return (
    <div className="rounded-2xl border border-[#D7E2F1] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#0B2A4A]/70">{title}</p>
        <span className="rounded-lg bg-[#0B2A4A]/10 p-1.5 text-[#0B2A4A]">
          {icon}
        </span>
      </div>
      <h2 className="mt-2 text-xl font-semibold text-[#0B2A4A]">{value}</h2>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-[#D7E2F1] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-[#0B2A4A]">{title}</h3>
      {children}
    </div>
  );
}
