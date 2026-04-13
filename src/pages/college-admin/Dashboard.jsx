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
  consumeInitialRevalidationToken,
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

const normalizeCourseLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  if (upper.includes("ENGG") || upper.includes("ENGINEER") || upper === "ENG") {
    return "Engineering";
  }
  if (upper.includes("MBA")) return "MBA";
  if (upper.includes("BBA")) return "BBA";
  if (upper.includes("MCA")) return "MCA";
  if (upper.includes("BCA")) return "BCA";

  return raw;
};

const deriveCourseFromProjectCode = (code) => {
  const parts = String(code || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  const courseToken = parts[1] || "";
  return normalizeCourseLabel(courseToken);
};

const deriveYearFromProjectCode = (code) => {
  const parts = String(code || "")
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);

  // Expect project code format like YEAR/COURSE/PASSYEAR, e.g. 2024/ENGG/2027
  return parts[0] || "";
};

export default function AdminDashboard() {
  const { profile, user } = useAuth();
  const COLORS = [
    "#3B82F6",
    "#10B981",
    "#F59E0B",
    "#EF4444",
    "#8B5CF6",
    "#EC4899",
  ];
  const collegeCode = String(
    profile?.collegeCode || profile?.college_code || "",
  )
    .trim()
    .toUpperCase();
  const adminName =
    profile?.name ||
    profile?.fullName ||
    profile?.adminName ||
    user?.displayName ||
    profile?.email?.split("@")[0] ||
    user?.email?.split("@")[0] ||
    "Admin";
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

  const passedStatuses = ["passed", "completed", "certified", "pass"];
  const failedStatuses = ["failed", "fail"];

  const hasPassedCertificate = (student) => {
    const results =
      student?.certificateResults &&
      typeof student.certificateResults === "object"
        ? Object.values(student.certificateResults).filter((r) => !r?.isDeleted)
        : [];

    if (
      results.some((result) =>
        passedStatuses.includes(
          String(result?.status || result?.result || "").toLowerCase(),
        ),
      )
    ) {
      return true;
    }

    return passedStatuses.includes(
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
              ? Object.values(student.certificateResults).filter(
                  (r) => !r?.isDeleted,
                )
              : [];

          const anyFailed = results.some((r) =>
            failedStatuses.includes(
              String(r?.status || r?.result || "").toLowerCase(),
            ),
          );

          const legacyStatus = String(
            student?.certificateStatus ||
              student?.certificateResult?.status ||
              student?.certificateResult?.result ||
              "",
          ).toLowerCase();

          if (anyFailed || failedStatuses.includes(legacyStatus)) return 55; // failed means partial completion (41-70%)
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
    const shouldRevalidate = consumeInitialRevalidationToken();
    if (cached?.data && collegeCode) {
      const d = cached.data;
      setStudents(d.students || []);
      setProjects(d.projects || []);
      setProjectStudentCounts(d.projectStudentCounts || {});
      setCertifications(d.certifications || []);
      setCollegeInfo(d.collegeInfo || { name: "", logo: "" });
      setCacheInfo({ cachedAt: cached.cachedAt, isStale: cached.isStale });
      if (!cached.isStale && !shouldRevalidate) {
        return () => {
          mounted = false;
        };
      }
    }

    const load = async () => {
      try {
        const collegeCodeValue = String(
          profile?.collegeCode || profile?.college_code || "",
        )
          .trim()
          .toUpperCase();

        console.log("=== Dashboard Load Started ===");
        console.log("College Code:", collegeCodeValue);
        console.log("Profile:", profile);

        if (!collegeCodeValue) {
          console.warn("No collegeCode available");
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
            const course =
              derivedCourse ||
              normalizeCourseLabel(project.course || project.courseCode) ||
              "Unknown";
            return {
              ...project,
              course,
            };
          })
          .sort((a, b) =>
            String(a.code || "").localeCompare(String(b.code || "")),
          );

        // Fetch counts and sampled student docs in parallel
        const sampledProjects = normalizedProjects.slice(
          0,
          DASHBOARD_SAMPLE_PROJECT_LIMIT,
        );

        const [countEntries, sampledGroups, perProjectStats] =
          await Promise.all([
            // Server-side counts for ALL projects — lightweight and quota-safe.
            Promise.allSettled(
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

        const countsByProject = {};
        countEntries.forEach((entry, index) => {
          const projectCode = String(
            normalizedProjects[index]?.code || "",
          ).trim();
          if (!projectCode) return;
          if (entry.status === "fulfilled" && Array.isArray(entry.value)) {
            countsByProject[projectCode] = Number(entry.value[1] || 0);
            return;
          }
          const error = entry.reason;
          const message = String(error?.message || "");
          const code = String(error?.code || "").toLowerCase();
          const isQuotaError =
            code.includes("resource-exhausted") ||
            code.includes("quota") ||
            /quota exceeded|too many requests|resource-exhausted/i.test(
              message,
            );
          if (!isQuotaError) {
            console.warn(`Student count failed for ${projectCode}:`, error);
          }
          countsByProject[projectCode] = 0;
        });
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

        console.log("=== College Info Debug ===");
        console.log("College object:", college);
        console.log(
          "College logo field value:",
          college?.college_logo || college?.collegeLogo || college?.logo,
        );
        console.log("Final normalized logo URL:", newCollegeInfo.logo);
        console.log("College name:", newCollegeInfo.name);

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
        const message = String(error?.message || "");
        const code = String(error?.code || "").toLowerCase();
        const isQuotaError =
          code.includes("resource-exhausted") ||
          code.includes("quota") ||
          /quota exceeded|too many requests|resource-exhausted/i.test(message);
        if (!isQuotaError) {
          console.error("Failed to load dashboard data:", error);
        } else {
          console.warn(
            "Dashboard load throttled by Firestore quota; showing available cached/fallback data.",
          );
        }
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
      projects
        .map((p) =>
          String(
            p.course ||
              p.courseCode ||
              deriveCourseFromProjectCode(p.code) ||
              "",
          ).trim(),
        )
        .filter(Boolean),
    );
    return ["All", ...Array.from(courses).sort()];
  }, [projects]);

  const academicYears = useMemo(() => {
    const years = new Set(
      projects
        .map((p) =>
          String(
            p.year || p.academicYear || deriveYearFromProjectCode(p.code) || "",
          ).trim(),
        )
        .filter(Boolean),
    );
    return ["All", ...Array.from(years).sort()];
  }, [projects]);

  const passYearOptions = useMemo(() => {
    const years = new Set(
      projects
        .map((p) => extractPassYearFromProjectCode(p.code))
        .filter(Boolean),
    );
    return ["All", ...Array.from(years).sort()];
  }, [projects]);
  const filteredData = useMemo(() => {
    const projectMetaByCode = new Map(
      projects.map((p) => [
        String(p.code || "").trim(),
        {
          year: String(
            p.year || p.academicYear || deriveYearFromProjectCode(p.code) || "",
          ).trim(),
          course: String(
            p.course || p.courseCode || deriveCourseFromProjectCode(p.code),
          ).trim(),
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
      const courseOk =
        selectedCourse === "All" || meta.course === selectedCourse;
      const passOk =
        selectedPassYear === "All" || meta.passYear === selectedPassYear;
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
        const courseOk =
          selectedCourse === "All" || meta.course === selectedCourse;
        const passOk =
          selectedPassYear === "All" || meta.passYear === selectedPassYear;
        return yearOk && courseOk && passOk;
      }),
    );

    const filteredStudents =
      selectedYear === "All" &&
      selectedCourse === "All" &&
      selectedPassYear === "All"
        ? students
        : students.filter((student) => {
            const projectCode = String(
              student.projectId || student.projectCode || "",
            ).trim();
            const meta = projectMetaByCode.get(projectCode) || {
              year: "",
              course: "",
              passYear: "",
            };
            const yearOk = selectedYear === "All" || meta.year === selectedYear;
            const courseOk =
              selectedCourse === "All" || meta.course === selectedCourse;
            const passOk =
              selectedPassYear === "All" || meta.passYear === selectedPassYear;

            // If course is missing on student, derive from project code for matching
            if (!courseOk) {
              const derivedCourse = deriveCourseFromProjectCode(projectCode);
              if (
                selectedCourse !== "All" &&
                derivedCourse === selectedCourse
              ) {
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
        const courseOk =
          selectedCourse === "All" || meta.course === selectedCourse;
        const passOk =
          selectedPassYear === "All" || meta.passYear === selectedPassYear;
        return yearOk && courseOk && passOk;
      })
      .filter(Boolean);

    const certIds = new Set();
    filteredStudents.forEach((student) => {
      const results =
        student?.certificateResults &&
        typeof student.certificateResults === "object"
          ? Object.values(student.certificateResults).filter(
              (r) => !r?.isDeleted,
            )
          : [];

      results.forEach((result, idx) => {
        const id = String(
          result.certificateId ||
            result.id ||
            `${student.id || ""}-cert-${idx}`,
        ).trim();
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
  }, [
    projects,
    projectStudentCounts,
    students,
    selectedYear,
    selectedCourse,
    selectedPassYear,
    perProjectCertStats,
  ]);

  const data = useMemo(() => {
    const {
      filteredProjects,
      filteredProjectCounts,
      filteredStudents,
      certCount,
    } = filteredData;

    const byCourse = new Map();

    filteredProjects.forEach((p) => {
      const courseLabel =
        normalizeCourseLabel(p.course || p.courseCode) ||
        deriveCourseFromProjectCode(p.code) ||
        "Unknown";
      const current = byCourse.get(courseLabel) || 0;
      byCourse.set(
        courseLabel,
        current +
          Number(filteredProjectCounts[String(p.code || "").trim()] || 0),
      );
    });

    const barData = Array.from(byCourse.entries())
      .map(([course, count]) => ({
        course,
        count,
      }))
      .sort((a, b) => a.course.localeCompare(b.course));

    const pieData = Array.from(byCourse.entries())
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Compute progress using the richest available source: certificate stats first,
    // then fall back to sampled student docs. This avoids empty graphs when student
    // sampling misses projects but enrollment stats exist.
    const progressBands = [
      { name: "0-40%", value: 0 },
      { name: "41-70%", value: 0 },
      { name: "71-100%", value: 0 },
    ];

    let avgProgress = 0;

    const addToBands = (progress) => {
      if (progress <= 40) progressBands[0].value += 1;
      else if (progress <= 70) progressBands[1].value += 1;
      else progressBands[2].value += 1;
    };

    // 1) Prefer aggregated certificate enrollment stats if they have data
    let statsTotal = 0;
    let statsWeighted = 0;

    filteredData.filteredCertStats.forEach((statsMap) => {
      statsMap.forEach((stat) => {
        const passedCount = Number(stat.passedCount || 0);
        const failedCount = Number(stat.failedCount || 0);
        const enrolledCount = Number(stat.enrolledCount || 0);
        const ongoingCount = Math.max(
          0,
          enrolledCount - passedCount - failedCount,
        );

        if (passedCount > 0) {
          addToBands(100);
          statsWeighted += passedCount * 100;
          statsTotal += passedCount;
        }
        if (failedCount > 0) {
          addToBands(55);
          statsWeighted += failedCount * 55;
          statsTotal += failedCount;
        }
        if (ongoingCount > 0) {
          addToBands(20);
          statsWeighted += ongoingCount * 20;
          statsTotal += ongoingCount;
        }
      });
    });

    if (statsTotal > 0) {
      avgProgress = Math.round(statsWeighted / statsTotal);
    } else {
      // 2) Fall back to sampled students
      filteredStudents.forEach((student) =>
        addToBands(getStudentProgress(student)),
      );

      const total = filteredStudents.length;
      if (total > 0) {
        avgProgress = Math.round(
          filteredStudents.reduce(
            (sum, student) => sum + getStudentProgress(student),
            0,
          ) / total,
        );
      }
    }

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
    const certsWithStats = new Set();

    // 1. Merge in aggregated enrollment stats (per filtered project)
    filteredCertStats.forEach((statsMap, idx) => {
      statsMap.forEach((stat, certId) => {
        const label = String(stat.name || certId).trim();
        certsWithStats.add(label);

        if (!statsByCertificate[label]) {
          statsByCertificate[label] = {
            label: label,
            Enrolled: 0,
            Passed: 0,
            Failed: 0,
          };
        }
        // Calculate ongoing students: total enrolled - passed - failed
        const totalEnrolled = stat.enrolledCount || 0;
        const passed = stat.passedCount || 0;
        const failed = stat.failedCount || 0;
        const ongoingCount = Math.max(0, totalEnrolled - passed - failed);

        statsByCertificate[label].Enrolled += ongoingCount;
        statsByCertificate[label].Passed += passed;
        statsByCertificate[label].Failed += failed;
      });
    });

    // 2. Process students for legacy/missing stats (avoid double counting)
    filteredStudents.forEach((student) => {
      const results =
        student.certificateResults &&
        typeof student.certificateResults === "object"
          ? Object.values(student.certificateResults).filter(
              (r) => !r?.isDeleted,
            )
          : [];

      if (results.length > 0) {
        results.forEach((result) => {
          const certName = String(result?.certificateName || "").trim();
          if (!certName || certsWithStats.has(certName)) return;

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

      const legacyCertName = String(student.certificate || "").trim();
      if (legacyCertName && results.length === 0) {
        if (certsWithStats.has(legacyCertName)) return;

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

    return Object.values(statsByCertificate)
      .filter((c) => c.Enrolled + c.Passed + c.Failed > 0)
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [filteredData]);

  // Calculate max total for consistent Y-axis scaling in certification chart
  // This ensures bars with the same total number of students have equal heights
  const maxCertTotal = useMemo(() => {
    if (!certificationData || certificationData.length === 0) return 10;

    let maxTotal = 0;
    certificationData.forEach((cert) => {
      const enrolled = parseInt(cert.Enrolled) || 0;
      const passed = parseInt(cert.Passed) || 0;
      const failed = parseInt(cert.Failed) || 0;
      const total = enrolled + passed + failed;

      if (total > maxTotal) {
        maxTotal = total;
      }
    });

    // Ensure we have a reasonable max, with 15% padding for visual space
    return Math.max(Math.ceil(maxTotal * 1.15), 10);
  }, [certificationData]);

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
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 px-8 py-6 shadow-lg">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="mt-2 text-base font-medium text-slate-600">
              Welcome back,{" "}
              <span className="text-blue-600 font-semibold">{adminName}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {collegeInfo.logo && !logoLoadFailed ? (
              <img
                src={collegeInfo.logo}
                alt={collegeInfo.name || "College"}
                className="h-20 w-auto max-w-60 object-contain rounded-lg"
                referrerPolicy="no-referrer"
                onError={() => setLogoLoadFailed(true)}
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-400 text-xl font-bold text-white shadow-md">
                {String(collegeCode || "CLG").slice(0, 2)}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-100 bg-white px-8 py-6 shadow-md">
        <div className="flex flex-wrap items-center gap-8">
          <label className="flex items-center gap-3 group">
            <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition">
              Year
            </span>
            <select
              className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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

          <label className="flex items-center gap-3 group">
            <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition">
              Course
            </span>
            <select
              className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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

          <label className="flex items-center gap-3 group">
            <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-600 transition">
              Pass Year
            </span>
            <select
              className="rounded-lg border-2 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
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
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Total Enrollments"
          value={data.totalEnrollments}
          icon={<Users size={24} />}
          color="blue"
        />
        <StatCard
          title="Avg Completion"
          value={data.completionRate}
          icon={<BookOpenCheck size={24} />}
          color="emerald"
        />
        <StatCard
          title="Certificates"
          value={data.certificatesIssued}
          icon={<Award size={24} />}
          color="amber"
        />
        <StatCard
          title="Project Codes"
          value={data.activeProjectCodes}
          icon={<Layers3 size={24} />}
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
        <PanelCard title="Certification Results">
          <ResponsiveContainer width="100%" height={360} debounce={75}>
            <BarChart
              data={certificationData}
              barCategoryGap="18%"
              maxBarSize={54}
              margin={{ top: 24, right: 24, left: 0, bottom: 60 }}
            >
              <CartesianGrid
                strokeDasharray="0"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                interval={0}
                height={50}
                tickMargin={8}
                tick={renderCertificateTick}
              />
              <YAxis
                type="number"
                domain={[0, maxCertTotal]}
                range={[340 - 60, 20]}
                tick={{ fontSize: 13, fill: "#4b5563" }}
                allowDecimals={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: "16px" }}
              />
              <Bar
                dataKey="Enrolled"
                name="Ongoing"
                stackId="a"
                fill="#3b82f6"
                radius={[12, 12, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              />
              <Bar
                dataKey="Passed"
                stackId="a"
                fill="#10b981"
                radius={[12, 12, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              />
              <Bar
                dataKey="Failed"
                stackId="a"
                fill="#ef4444"
                radius={[12, 12, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
        <PanelCard title="Enrollment by Course">
          <ResponsiveContainer width="100%" height={360} debounce={75}>
            <BarChart data={data.barData} barSize={48}>
              <CartesianGrid
                strokeDasharray="0"
                stroke="#e5e7eb"
                vertical={false}
              />
              <XAxis
                dataKey="course"
                tick={{ fontSize: 13, fill: "#4b5563" }}
              />
              <YAxis
                tick={{ fontSize: 13, fill: "#4b5563" }}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(59, 130, 246, 0.1)" }}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              />
              <Bar
                dataKey="count"
                fill="#3b82f6"
                radius={[12, 12, 0, 0]}
                rootTabIndex={-1}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>

      <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2">
        <PanelCard title="Course Distribution">
          <ResponsiveContainer width="100%" height={340} debounce={75}>
            <PieChart>
              <Pie
                data={data.pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={110}
                rootTabIndex={-1}
                label={{ fontSize: 12, fill: "#374151" }}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              >
                {data.pieData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </PanelCard>
        <PanelCard title="Student Progress Distribution">
          <ResponsiveContainer width="100%" height={340} debounce={75}>
            <PieChart>
              <Pie
                data={data.progressBands}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                rootTabIndex={-1}
                label={{ fontSize: 12, fill: "#374151" }}
                isAnimationActive={!isLayoutResizing}
                animationDuration={500}
                animationEasing="ease-in-out"
              >
                {data.progressBands.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "2px solid #e5e7eb",
                  borderRadius: "12px",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                }}
              />
              <Legend verticalAlign="bottom" height={36} />
            </PieChart>
          </ResponsiveContainer>
        </PanelCard>
      </div>
    </div>
  );
}
/* Helper Components */
function StatCard({ title, value, icon, color = "blue" }) {
  const colorConfig = {
    blue: {
      bg: "from-blue-50 to-blue-100",
      iconBg: "from-blue-600 to-blue-500",
      text: "text-blue-600",
    },
    emerald: {
      bg: "from-emerald-50 to-emerald-100",
      iconBg: "from-emerald-600 to-emerald-500",
      text: "text-emerald-600",
    },
    amber: {
      bg: "from-amber-50 to-amber-100",
      iconBg: "from-amber-600 to-amber-500",
      text: "text-amber-600",
    },
    rose: {
      bg: "from-rose-50 to-rose-100",
      iconBg: "from-rose-600 to-rose-500",
      text: "text-rose-600",
    },
  };

  const config = colorConfig[color] || colorConfig.blue;

  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-8 shadow-lg hover:shadow-2xl transition duration-300 hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
            {title}
          </p>
          <h3 className="mt-4 text-4xl font-bold text-slate-900">{value}</h3>
        </div>
        <div
          className={`rounded-2xl bg-gradient-to-br ${config.iconBg} p-4 text-white shadow-lg group-hover:scale-110 transition duration-300`}
        >
          {icon}
        </div>
      </div>
      <div
        className={`mt-4 h-1 w-12 rounded-full bg-gradient-to-r ${config.iconBg}`}
      ></div>
    </div>
  );
}

function PanelCard({ title, children }) {
  return (
    <div className="group rounded-2xl border border-slate-100 bg-white p-8 shadow-lg hover:shadow-xl transition duration-300">
      <h2 className="mb-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-2xl font-bold text-transparent">
        {title}
      </h2>
      <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        {children}
      </div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-lg">
      <h3 className="mb-6 text-xl font-bold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}
