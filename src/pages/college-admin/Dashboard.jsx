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
import { getCertificateEnrollmentStatsByProject } from "../../../services/certificateService";
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
const extractPassYearFromProjectCode = (code) => {
  const parts = String(code || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts[parts.length - 1];
};

const deriveCourseFromProjectCode = (code) => {
  const parts = String(code || "")
    .split("/")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (parts.includes("MBA")) return "MBA";
  if (parts.includes("ENGG") || parts.includes("ENGINEERING")) return "Engineering";
  return "Other";
};

export default function AdminDashboard() {
  const { profile } = useAuth();
  const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444"];
  const collegeCode = String(
    profile?.collegeCode || profile?.college_code || "",
  )
    .trim()
    .toUpperCase();
  const [selectedYear, setSelectedYear] = useState("All");
  const [selectedCourse, setSelectedCourse] = useState("All");
  const [selectedPassYear, setSelectedPassYear] = useState("All");

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
    hasPassedCertificate(student)
      ? 100
      : (() => {
          const results =
            student?.certificateResults &&
            typeof student.certificateResults === "object"
              ? Object.values(student.certificateResults).filter((r) => !r?.isDeleted)
              : [];

          const anyFailed = results.some((r) =>
            ["failed"].includes(String(r?.status || r?.result || "").toLowerCase()),
          );

          if (anyFailed) return 50;
          return parseProgress(student?.progress);
        })();

  const [students, setStudents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectStudentCounts, setProjectStudentCounts] = useState({});
  const [certifications, setCertifications] = useState([]);
  const [perProjectCertStats, setPerProjectCertStats] = useState([]);
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
          .map((project) => {
            const code = String(project.code || "").trim();
            const derivedCourse = deriveCourseFromProjectCode(code);
            return {
              ...project,
              course: project.course || project.courseCode || derivedCourse,
            };
          })
          .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));

        // Fetch counts and sampled student docs in parallel
        const sampledProjects = normalizedProjects.slice(
          0,
          DASHBOARD_SAMPLE_PROJECT_LIMIT,
        );

        const [countEntries, sampledGroups, perProjectStats] = await Promise.all([
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
          Promise.all(
            normalizedProjects.map(async (project) => {
              const code = String(project.code || "").trim();
              try {
                return await getCertificateEnrollmentStatsByProject(code);
              } catch (err) {
                console.warn("Cert stats failed for", code, err);
                return new Map();
              }
            }),
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
        setPerProjectCertStats(perProjectStats);
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

  const courseOptions = useMemo(() => {
    const courses = new Set(
      projects.map((p) => String(p.course || p.courseCode || "").trim()).filter(Boolean),
    );
    return ["All", ...Array.from(courses).sort()];
  }, [projects]);

  const academicYears = useMemo(() => {
    const years = new Set(
      projects.map((p) => String(p.year || p.academicYear || "").trim()).filter(Boolean),
    );
    return ["All", ...Array.from(years).sort()];
  }, [projects]);

  const passYearOptions = useMemo(() => {
    const years = new Set(
      projects.map((p) => extractPassYearFromProjectCode(p.code)).filter(Boolean),
    );
    return ["All", ...Array.from(years).sort()];
  }, [projects]);
  const filteredData = useMemo(() => {
    const projectMetaByCode = new Map(
      projects.map((p) => [
        String(p.code || "").trim(),
        {
          year: String(p.year || p.academicYear || "").trim(),
          course: String(p.course || p.courseCode || deriveCourseFromProjectCode(p.code)).trim(),
          passYear: extractPassYearFromProjectCode(p.code),
        },
      ]),
    );

    const filteredProjects = projects.filter((p) => {
      const meta = projectMetaByCode.get(String(p.code || "").trim()) || {
        year: "",
        course: "",
        passYear: "",
      };
      const yearOk = selectedYear === "All" || meta.year === selectedYear;
      const courseOk = selectedCourse === "All" || meta.course === selectedCourse;
      const passOk = selectedPassYear === "All" || meta.passYear === selectedPassYear;
      return yearOk && courseOk && passOk;
    });

    const filteredProjectCounts = Object.fromEntries(
      Object.entries(projectStudentCounts).filter(([code]) => {
        const meta = projectMetaByCode.get(String(code || "").trim()) || {
          year: "",
          course: "",
          passYear: "",
        };
        const yearOk = selectedYear === "All" || meta.year === selectedYear;
        const courseOk = selectedCourse === "All" || meta.course === selectedCourse;
        const passOk = selectedPassYear === "All" || meta.passYear === selectedPassYear;
        return yearOk && courseOk && passOk;
      }),
    );

    const filteredStudents =
      selectedYear === "All" && selectedCourse === "All" && selectedPassYear === "All"
        ? students
        : students.filter((student) => {
            const projectCode = String(student.projectId || student.projectCode || "").trim();
            const meta = projectMetaByCode.get(projectCode) || {
              year: "",
              course: "",
              passYear: "",
            };
            const yearOk = selectedYear === "All" || meta.year === selectedYear;
            const courseOk = selectedCourse === "All" || meta.course === selectedCourse;
            const passOk = selectedPassYear === "All" || meta.passYear === selectedPassYear;

            // If course is missing on student, derive from project code for matching
            if (!courseOk) {
              const derivedCourse = deriveCourseFromProjectCode(projectCode);
              if (selectedCourse !== "All" && derivedCourse === selectedCourse) {
                return yearOk && passOk;
              }
            }

            return yearOk && courseOk && passOk;
          });

    const filteredCertStats = perProjectCertStats
      .filter((stats, index) => {
        const code = String(projects[index]?.code || "").trim();
        const meta = projectMetaByCode.get(code) || {
          year: "",
          course: "",
          passYear: "",
        };
        const yearOk = selectedYear === "All" || meta.year === selectedYear;
        const courseOk = selectedCourse === "All" || meta.course === selectedCourse;
        const passOk = selectedPassYear === "All" || meta.passYear === selectedPassYear;
        return yearOk && courseOk && passOk;
      })
      .filter(Boolean);

    const certIds = new Set();
    filteredStudents.forEach((student) => {
      const results =
        student?.certificateResults && typeof student.certificateResults === "object"
          ? Object.values(student.certificateResults).filter((r) => !r?.isDeleted)
          : [];

      results.forEach((result, idx) => {
        const id = String(result.certificateId || result.id || `${student.id || ""}-cert-${idx}`).trim();
        if (id) certIds.add(id);
      });

      if (results.length === 0 && student?.certificate) {
        const legacyId = `legacy-${student.id || student.docId || student.email || Math.random()}`;
        certIds.add(legacyId);
      }
    });

    filteredCertStats.forEach((statsMap) => {
      statsMap.forEach((_, certId) => {
        const id = String(certId || "").trim();
        if (id) certIds.add(id);
      });
    });

    return {
      filteredProjects,
      filteredProjectCounts,
      filteredStudents,
      filteredCertStats,
      certCount: certIds.size,
    };
  }, [projects, projectStudentCounts, students, selectedYear, selectedCourse, selectedPassYear, perProjectCertStats]);

  const data = useMemo(() => {
    const { filteredProjects, filteredProjectCounts, filteredStudents, certCount } = filteredData;

    const byCourse = { Engineering: 0, MBA: 0 };
    filteredProjects.forEach((p) => {
      const courseKey = deriveCourseFromProjectCode(p.code) || p.course || p.courseCode || "Other";
      const normalizedCourse =
        courseKey.toLowerCase().includes("mba")
          ? "MBA"
          : courseKey.toLowerCase().includes("eng")
            ? "Engineering"
            : null;
      if (!normalizedCourse) return;
      byCourse[normalizedCourse] =
        (byCourse[normalizedCourse] || 0) +
        Number(filteredProjectCounts[String(p.code || "").trim()] || 0);
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

    filteredStudents.forEach((student) => {
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

    const topProjects = filteredProjects
      .map((project) => ({
        ...project,
        totalStudents: Number(
          filteredProjectCounts[String(project.code || "").trim()] || 0,
        ),
      }))
      .sort((a, b) => b.totalStudents - a.totalStudents)
      .slice(0, 5);

    const totalEnrollments = Object.values(filteredProjectCounts).reduce(
      (sum, count) => sum + Number(count || 0),
      0,
    );

    return {
      totalEnrollments,
      completionRate: `${avgProgress}%`,
      certificatesIssued: certCount,
      activeProjectCodes: filteredProjects.length,
      barData,
      pieData,
      progressBands,
      topProjects,
    };
  }, [filteredData]);

  const certificationData = useMemo(() => {
    const statsByCertificate = {};

    const { filteredStudents, filteredCertStats } = filteredData;

    filteredStudents.forEach((student) => {
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

    // Merge in aggregated enrollment stats (per filtered project) to ensure bar chart shows data
    filteredCertStats.forEach((statsMap) => {
      statsMap.forEach((stat, certId) => {
        if (!statsByCertificate[certId]) {
          statsByCertificate[certId] = {
            label: stat.name || certId,
            Enrolled: 0,
            Passed: 0,
            Failed: 0,
          };
        }
        statsByCertificate[certId].Enrolled += stat.enrolledCount || 0;
        statsByCertificate[certId].Passed += stat.passedCount || 0;
        statsByCertificate[certId].Failed += stat.failedCount || 0;
      });
    });

    return Object.values(statsByCertificate).sort((a, b) =>
      String(a.label).localeCompare(String(b.label)),
    );
  }, [filteredData]);

  const splitCertificateLabel = (value) => {
    const text = String(value || "").trim();
    if (!text) return [""];

    const words = text.split(/\s+/);
    const lines = [];
    const maxCharsPerLine = 16;
    const maxLines = 3;
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
        last.length > maxCharsPerLine - 2
          ? `${last.slice(0, maxCharsPerLine - 2)}…`
          : `${last}…`;
      return clamped;
    }

    return lines;
  };

  const renderCertificateTick = ({ x, y, payload }) => {
    const text = String(payload?.value || "").trim();

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={4}
          textAnchor="end"
          fill="#6B7280"
          fontSize={11}
          fontWeight={500}
          transform="rotate(-45)"
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-6 bg-gray-50">
      <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-md">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Dashboard
            </h1>
            <p className="mt-2 text-base text-gray-600">
              Monitor enrollments, performance, and certification metrics
            </p>
            {cacheInfo.cachedAt > 0 && (
              <p className="mt-3 text-xs font-medium text-gray-500">
                {cacheInfo.isStale ? "⚠️ " : "✓ "}
                {cacheAgeLabel(cacheInfo.cachedAt)}
              </p>
            )}
          </div>
          <div className="hidden md:flex md:items-center md:justify-center">
            {collegeInfo.logo && !logoLoadFailed ? (
              <img
                src={collegeInfo.logo}
                alt={collegeInfo.name || "College"}
                className="max-h-20 w-auto max-w-48 object-contain"
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-xl font-bold text-white">
                {String(collegeCode || "CLG").slice(0, 2)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <label className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Year</span>
          <select
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {academicYears.map((year) => (
              <option key={year} value={year}>
                {year === "All" ? "All Years" : year}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Course</span>
          <select
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            {courseOptions.map((course) => (
              <option key={course} value={course}>
                {course === "All" ? "All Courses" : course}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-700">Pass Year</span>
          <select
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            value={selectedPassYear}
            onChange={(e) => setSelectedPassYear(e.target.value)}
          >
            {passYearOptions.map((year) => (
              <option key={year} value={year}>
                {year === "All" ? "All Years" : year}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Enrollments"
          value={data.totalEnrollments}
          icon={<Users size={20} />}
          color="blue"
        />
        <StatCard
          title="Avg Completion"
          value={data.completionRate}
          icon={<BookOpenCheck size={20} />}
          color="emerald"
        />
        <StatCard
          title="Certificates"
          value={data.certificatesIssued}
          icon={<Award size={20} />}
          color="amber"
        />
        <StatCard
          title="Project Codes"
          value={data.activeProjectCodes}
          icon={<Layers3 size={20} />}
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Enrollment by Course">
          <ResponsiveContainer width="100%" height={300} debounce={75}>
            <BarChart data={data.barData} barSize={48}>
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="#E5E7EB"
              />
              <XAxis dataKey="course" tick={{ fontSize: 13, fill: "#6B7280" }} />
              <YAxis tick={{ fontSize: 13, fill: "#6B7280" }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#F3F4F6" }}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                }}
              />
              <Bar
                dataKey="count"
                fill="#3B82F6"
                radius={[12, 12, 0, 0]}
                rootTabIndex={-1}
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Certification Results">
          <ResponsiveContainer width="100%" height={340} debounce={75}>
            <BarChart
              data={certificationData}
              barCategoryGap="18%"
              maxBarSize={54}
              margin={{ top: 24, right: 24, left: 0, bottom: 60 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="#E5E7EB"
              />
              <XAxis
                dataKey="label"
                interval={0}
                height={50}
                tickMargin={8}
                tick={renderCertificateTick}
              />
              <YAxis tick={{ fontSize: 13, fill: "#6B7280" }} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "#F3F4F6" }}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                }}
              />
              <Legend verticalAlign="top" align="right" />
              <Bar
                dataKey="Enrolled"
                name="Ongoing"
                stackId="a"
                fill="#3B82F6"
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
              />
              <Bar
                dataKey="Passed"
                stackId="a"
                fill="#10B981"
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
              />
              <Bar
                dataKey="Failed"
                stackId="a"
                fill="#EF4444"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
              />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Student Progress Distribution">
          <ResponsiveContainer width="100%" height={320} debounce={75}>
            <PieChart>
              <Pie
                data={data.progressBands}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={110}
                rootTabIndex={-1}
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {data.progressBands.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Course Distribution">
          <ResponsiveContainer width="100%" height={320} debounce={75}>
            <PieChart>
              <Pie
                data={data.pieData}
                dataKey="value"
                nameKey="name"
                outerRadius={110}
                rootTabIndex={-1}
                label
                isAnimationActive={!isLayoutResizing}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {data.pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "8px",
                }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Panel title="Top Projects by Enrollment">
          <div className="space-y-3">
            {data.topProjects.map((project, idx) => (
              <div
                key={project.id || project.code}
                className="group flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white px-4 py-3 transition hover:border-gray-300 hover:shadow-sm"
              >
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{project.code || project.id}</p>
                  <p className="text-xs text-gray-600">{project.course}</p>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <Users size={16} className="text-gray-400" />
                  <span className="font-semibold text-gray-900">{project.totalStudents}</span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Project Codes Overview">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Project Code</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">College</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Course</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Year</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p, idx) => (
                <tr
                  key={p.id || p.code}
                  className="border-b border-gray-100 transition hover:bg-gray-50"
                >
                  <td className="px-6 py-3 font-medium text-gray-900">{p.code || p.id}</td>
                  <td className="px-6 py-3 text-gray-600">{p.college || "-"}</td>
                  <td className="px-6 py-3 text-gray-600">{p.course || p.courseCode || "-"}</td>
                  <td className="px-6 py-3 text-gray-600">{p.year || "-"}</td>
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

function StatCard({ title, value, icon, color = "blue" }) {
  const colorClasses = {
    blue: "from-blue-50 to-blue-100 text-blue-600 bg-blue-100",
    emerald: "from-emerald-50 to-emerald-100 text-emerald-600 bg-emerald-100",
    amber: "from-amber-50 to-amber-100 text-amber-600 bg-amber-100",
    rose: "from-rose-50 to-rose-100 text-rose-600 bg-rose-100",
  };

  const iconBg = colorClasses[color] || colorClasses.blue;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</p>
        <span className={`rounded-lg ${iconBg} p-2.5`}>{icon}</span>
      </div>
      <h2 className="mt-4 text-3xl font-bold text-gray-900">{value}</h2>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}
