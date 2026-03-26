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
import { useEffect, useMemo, useState } from "react";
import {
  getAllStudents,
  getAllStudentsCount,
  getStudentsByProject,
} from "../../../services/studentService";
import { getAllAdmins } from "../../../services/userService";
import {
  getAllCertificates,
  getCertificateEnrollmentStatsByProject,
} from "../../../services/certificateService";
import { getAllColleges } from "../../../services/collegeService";
import { getAllProjectCodes } from "../../../services/projectCodeService";
import { resetLocalDb } from "../../../services/localDbService";
import {
  DB_MODES,
  getDbMode,
  setDbMode,
} from "../../../services/dbModeService";
import {
  cacheAgeLabel,
  clearAllDashboardCache,
  getCached,
  setCached,
} from "../../utils/dashboardCache";

const SIDEBAR_BLUE = "#0B2A4A";
const ACCENT_BLUE = "#1D5FA8";
const MINT = "#6BC7A7";
const AMBER = "#D29A2D";
const ROSE = "#CA5D7C";
const COLORS = [ACCENT_BLUE, MINT, AMBER, ROSE];

const parseProgress = (progressValue) => {
  const parsed = Number(
    String(progressValue || "")
      .replace("%", "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const isCollegeAdminRole = (roleValue) => {
  const normalized = String(roleValue || "")
    .trim()
    .toLowerCase();
  return normalized === "collegeadmin" || normalized === "college admin";
};

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const getProjectCodeValue = (projectCodeRow) =>
  String(projectCodeRow?.code || projectCodeRow?.projectCode || "").trim();

const deriveCollegeCodeFromProject = (projectCode) =>
  normalizeCode(String(projectCode || "").split("/")[0]);

const resolveCollegeCodeForProjectRow = (projectCodeRow) => {
  const explicitCode = normalizeCode(
    projectCodeRow?.collegeCode ||
      projectCodeRow?.college_code ||
      projectCodeRow?.collegeId ||
      "",
  );
  if (explicitCode) return explicitCode;

  const code = getProjectCodeValue(projectCodeRow);
  if (!code) return "";
  return deriveCollegeCodeFromProject(code);
};

const resolveCollegeCodeForStudent = (student) => {
  const explicitCode = normalizeCode(
    student?.collegeCode || student?.college_code || "",
  );
  if (explicitCode) return explicitCode;
  return deriveCollegeCodeFromProject(student?.projectId || student?.projectCode);
};

const getStudentResultStatus = (statusValue) => {
  const normalized = String(statusValue || "")
    .trim()
    .toLowerCase();
  if (["passed", "completed", "certified", "pass"].includes(normalized)) {
    return "passed";
  }
  if (["failed", "fail"].includes(normalized)) {
    return "failed";
  }
  return "ongoing";
};

export default function Dashboard() {
  const SA_CACHE_KEY = "superadmin_dashboard";

  const [students, setStudents] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [certStatsByProject, setCertStatsByProject] = useState({});
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [selectedCollegeCode, setSelectedCollegeCode] = useState("ALL");
  const [dbMode, setDbModeState] = useState(getDbMode());
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

  const loadDashboardData = async () => {
    const requests = [
      {
        key: "students",
        label: "students/students_list",
        // Sample up to 3000 students for chart rendering — stat card uses
        // server-side count via getAllStudentsCount for the accurate total.
        run: () => getAllStudents({ maxDocs: 3000 }),
      },
      {
        key: "totalStudentsCount",
        label: "students count",
        run: getAllStudentsCount,
      },
      { key: "admins", label: "users", run: getAllAdmins },
      { key: "certifications", label: "certificates", run: getAllCertificates },
      { key: "colleges", label: "college", run: getAllColleges },
      { key: "projectCodes", label: "projectCodes", run: getAllProjectCodes },
    ];

    const settled = await Promise.allSettled(
      requests.map((request) => request.run()),
    );

    // Only collect keys where the fetch actually succeeded
    const freshData = {};
    let anyFulfilled = false;

    settled.forEach((result, index) => {
      const request = requests[index];
      if (result.status === "fulfilled") {
        freshData[request.key] = result.value ?? [];
        anyFulfilled = true;
        return;
      }

      const error = result.reason;
      const errorCode = String(error?.code || "");
      const isPermissionIssue =
        errorCode === "permission-denied" ||
        errorCode === "failed-precondition" ||
        /insufficient permissions|permission denied/i.test(
          String(error?.message || ""),
        );

      console.error(`Dashboard data load failed for ${request.label}:`, error);
      if (isPermissionIssue) {
        console.warn(
          `Firestore access blocked for ${request.label}. Check rules and verify the logged-in user has a users/{uid} document with role superAdmin.`,
        );
      }
    });

    // Completely offline — preserve whatever cache-hydrated state is already showing
    if (!anyFulfilled) return;

    // Apply only successfully fetched keys; cached values for failed keys stay intact
    if ("students" in freshData) setStudents(freshData.students);
    if ("totalStudentsCount" in freshData)
      setTotalStudentsCount(Number(freshData.totalStudentsCount || 0));
    if ("admins" in freshData) setAdmins(freshData.admins);
    if ("certifications" in freshData)
      setCertifications(freshData.certifications);
    if ("colleges" in freshData) setColleges(freshData.colleges);
    if ("projectCodes" in freshData) setProjectCodes(freshData.projectCodes);

    const nextProjectCodes = freshData.projectCodes ?? [];
    const nextStudents = freshData.students ?? [];
    let nextCertStatsByProject = certStatsByProject;

    const projectRowsForStats = (nextProjectCodes.length > 0
      ? nextProjectCodes
      : projectCodes
    ).filter((projectCodeRow) => getProjectCodeValue(projectCodeRow));

    if (projectRowsForStats.length > 0) {
      const statsSettled = await Promise.allSettled(
        projectRowsForStats.map(async (projectCodeRow) => {
          const projectCode = getProjectCodeValue(projectCodeRow);
          const statsMap = await getCertificateEnrollmentStatsByProject(
            projectCode,
          );
          return [projectCode, Array.from(statsMap.values())];
        }),
      );

      const builtStats = {};
      statsSettled.forEach((result, index) => {
        const projectCode = getProjectCodeValue(projectRowsForStats[index]);
        if (!projectCode) return;

        if (result.status === "fulfilled") {
          builtStats[projectCode] = result.value?.[1] || [];
          return;
        }

        console.warn(
          `Certificate stats fetch failed for ${projectCode}:`,
          result.reason,
        );
      });

      if (Object.keys(builtStats).length > 0) {
        nextCertStatsByProject = builtStats;
        setCertStatsByProject(builtStats);
      }
    }

    if (nextStudents.length === 0 && nextProjectCodes.length > 0) {
      try {
        const projectStudentGroups = await Promise.allSettled(
          nextProjectCodes.slice(0, 15).map((projectCodeRow) =>
            getStudentsByProject(String(projectCodeRow?.code || "").trim(), {
              maxDocs: 200,
            }),
          ),
        );

        const fallbackStudents = [];
        projectStudentGroups.forEach((result) => {
          if (result.status !== "fulfilled") return;
          (result.value || []).forEach((student) => {
            fallbackStudents.push(student);
          });
        });

        if (fallbackStudents.length > 0) {
          setStudents(fallbackStudents);
        }
      } catch (fallbackError) {
        console.error(
          "Fallback project-wise student loading failed:",
          fallbackError,
        );
      }
    }

    // Write to cache when we got all core keys (not partial/degraded)
    const allCoreFetched =
      "students" in freshData &&
      "totalStudentsCount" in freshData &&
      "colleges" in freshData &&
      "projectCodes" in freshData;
    if (allCoreFetched) {
      setCached(SA_CACHE_KEY, {
        students: freshData.students,
        totalStudentsCount: freshData.totalStudentsCount,
        admins: freshData.admins ?? [],
        certifications: freshData.certifications ?? [],
        colleges: freshData.colleges,
        projectCodes: freshData.projectCodes,
        certStatsByProject: nextCertStatsByProject,
      });
      setCacheInfo({ cachedAt: Date.now(), isStale: false });
    }
  };

  useEffect(() => {
    let mounted = true;

    // Hydrate from cache immediately so graphs are never blank on reconnect
    const cached = getCached(SA_CACHE_KEY);
    if (cached?.data) {
      const d = cached.data;
      setStudents(d.students || []);
      setTotalStudentsCount(Number(d.totalStudentsCount || 0));
      setAdmins(d.admins || []);
      setCertifications(d.certifications || []);
      setColleges(d.colleges || []);
      setProjectCodes(d.projectCodes || []);
      setCertStatsByProject(d.certStatsByProject || {});
      setCacheInfo({ cachedAt: cached.cachedAt, isStale: cached.isStale });
    }

    const handleDbModeChange = (event) => {
      const mode = event?.detail?.mode || getDbMode();
      setDbModeState(mode);
      clearAllDashboardCache();
      if (!mounted) return;
      loadDashboardData();
    };

    const handleLocalDbReset = () => {
      if (!mounted) return;
      loadDashboardData();
    };

    loadDashboardData();
    window.addEventListener("erp:db-mode-changed", handleDbModeChange);
    window.addEventListener("erp:local-db-reset", handleLocalDbReset);

    return () => {
      mounted = false;
      window.removeEventListener("erp:db-mode-changed", handleDbModeChange);
      window.removeEventListener("erp:local-db-reset", handleLocalDbReset);
    };
  }, []);

  const handleToggleDbMode = () => {
    const nextMode = dbMode === DB_MODES.LOCAL ? DB_MODES.PROD : DB_MODES.LOCAL;
    setDbMode(nextMode);
  };

  const handleResetLocalDb = async () => {
    const confirmed = window.confirm(
      "This will clear all Local DB test data. Continue?",
    );
    if (!confirmed) return;
    await resetLocalDb();
    if (dbMode === DB_MODES.LOCAL) {
      await loadDashboardData();
    }
  };

  const totalStudents = Math.max(
    Number(totalStudentsCount || 0),
    Number(students.length || 0),
  );
  const totalColleges = colleges.length;
  const activeColleges = colleges.filter(
    (college) => String(college.status || "Active") === "Active",
  ).length;
  const totalProjectCodes = projectCodes.length;
  const totalCertificates = certifications.length;
  const totalCollegeAdmins = admins.filter((admin) =>
    isCollegeAdminRole(admin?.role),
  ).length;

  const collegeOptions = useMemo(() => {
    const optionsByCode = new Map();

    colleges.forEach((college) => {
      const code = normalizeCode(college?.college_code || college?.collegeCode);
      if (!code) return;
      const name = String(college?.college_name || code).trim();
      optionsByCode.set(code, { code, label: `${code} - ${name}` });
    });

    projectCodes.forEach((projectCodeRow) => {
      const code = resolveCollegeCodeForProjectRow(projectCodeRow);
      if (!code || optionsByCode.has(code)) return;
      optionsByCode.set(code, { code, label: code });
    });

    students.forEach((student) => {
      const code = resolveCollegeCodeForStudent(student);
      if (!code || optionsByCode.has(code)) return;
      optionsByCode.set(code, { code, label: code });
    });

    return Array.from(optionsByCode.values()).sort((a, b) =>
      String(a.code || "").localeCompare(String(b.code || "")),
    );
  }, [colleges, projectCodes, students]);

  const selectedProjects = useMemo(() => {
    if (selectedCollegeCode === "ALL") return projectCodes;
    return projectCodes.filter(
      (projectCodeRow) =>
        resolveCollegeCodeForProjectRow(projectCodeRow) === selectedCollegeCode,
    );
  }, [projectCodes, selectedCollegeCode]);

  const selectedProjectCodeSet = useMemo(
    () =>
      new Set(
        selectedProjects
          .map((projectCodeRow) => getProjectCodeValue(projectCodeRow))
          .filter(Boolean),
      ),
    [selectedProjects],
  );

  const chartStudents = useMemo(() => {
    if (selectedCollegeCode === "ALL") return students;
    if (selectedProjectCodeSet.size > 0) {
      return students.filter((student) => {
        const projectCode = String(
          student.projectId || student.projectCode || "",
        ).trim();
        return selectedProjectCodeSet.has(projectCode);
      });
    }
    return students.filter(
      (student) => resolveCollegeCodeForStudent(student) === selectedCollegeCode,
    );
  }, [students, selectedCollegeCode, selectedProjectCodeSet]);

  const studentsByProject = Object.entries(
    chartStudents.reduce((accumulator, student) => {
      const key = student.projectId || student.projectCode || "Unknown";
      accumulator[key] = (accumulator[key] || 0) + 1;
      return accumulator;
    }, {}),
  )
    .map(([projectId, count]) => ({ projectId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const progressBuckets = useMemo(() => {
    const buckets = [
      { bucket: "0-40%", count: 0 },
      { bucket: "41-70%", count: 0 },
      { bucket: "71-100%", count: 0 },
    ];

    chartStudents.forEach((student) => {
      const progress = parseProgress(student.progress);
      if (progress <= 40) buckets[0].count += 1;
      else if (progress <= 70) buckets[1].count += 1;
      else buckets[2].count += 1;
    });

    return buckets;
  }, [chartStudents]);

  const progressDistributionData = useMemo(
    () =>
      progressBuckets.map((entry) => ({
        name: entry.bucket,
        value: entry.count,
      })),
    [progressBuckets],
  );

  const certificateToOrganization = new Map(
    certifications.map((certificate) => [
      String(certificate?.id || "").trim(),
      String(certificate?.domain || "").trim() || "Other",
    ]),
  );

  const organizationEnrollmentMap = new Map();
  chartStudents.forEach((student) => {
    const studentKey = String(student?.docId || student?.id || "").trim();
    if (!studentKey) return;

    const idsFromArray = Array.isArray(student?.certificateIds)
      ? student.certificateIds
      : [];
    const idsFromResults =
      student?.certificateResults &&
      typeof student.certificateResults === "object"
        ? Object.values(student.certificateResults)
            .filter((entry) => !entry?.isDeleted)
            .map((entry) => entry?.certificateId)
            .filter(Boolean)
        : [];

    const uniqueCertificateIds = [
      ...new Set(
        [...idsFromArray, ...idsFromResults]
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];

    const organizationsForStudent = new Set(
      uniqueCertificateIds
        .map(
          (certificateId) =>
            certificateToOrganization.get(certificateId) || "Other",
        )
        .filter(Boolean),
    );

    organizationsForStudent.forEach((organization) => {
      if (!organizationEnrollmentMap.has(organization)) {
        organizationEnrollmentMap.set(organization, new Set());
      }
      organizationEnrollmentMap.get(organization).add(studentKey);
    });
  });

  const organizationEnrollmentMix = Array.from(
    organizationEnrollmentMap.entries(),
  )
    .map(([organization, studentIds]) => ({
      organization,
      count: studentIds.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const certificationResultsData = useMemo(() => {
    const statsByCertificate = new Map();

    selectedProjects.forEach((projectCodeRow) => {
      const projectCode = getProjectCodeValue(projectCodeRow);
      if (!projectCode) return;

      const statsRows = certStatsByProject[projectCode] || [];
      statsRows.forEach((stat) => {
        const certificateId = String(stat?.id || "").trim();
        const label = String(stat?.name || stat?.examCode || certificateId).trim();
        if (!label) return;

        const current = statsByCertificate.get(label) || {
          label,
          Passed: 0,
          Failed: 0,
          Ongoing: 0,
          total: 0,
        };

        const passed = Number(stat?.passedCount || 0);
        const failed = Number(stat?.failedCount || 0);
        const enrolled = Number(stat?.enrolledCount || 0);
        const ongoing = Math.max(enrolled - passed - failed, 0);

        current.Passed += passed;
        current.Failed += failed;
        current.Ongoing += ongoing;
        current.total += passed + failed + ongoing;

        statsByCertificate.set(label, current);
      });
    });

    if (statsByCertificate.size === 0) {
      chartStudents.forEach((student) => {
        const certificateResults =
          student?.certificateResults &&
          typeof student.certificateResults === "object"
            ? Object.values(student.certificateResults).filter(
                (entry) => !entry?.isDeleted,
              )
            : [];

        if (certificateResults.length > 0) {
          certificateResults.forEach((result) => {
            const label = String(
              result?.certificateName || result?.name || result?.certificateId,
            ).trim();
            if (!label) return;

            const status = getStudentResultStatus(result?.status || result?.result);
            const current = statsByCertificate.get(label) || {
              label,
              Passed: 0,
              Failed: 0,
              Ongoing: 0,
              total: 0,
            };
            if (status === "passed") current.Passed += 1;
            else if (status === "failed") current.Failed += 1;
            else current.Ongoing += 1;
            current.total += 1;
            statsByCertificate.set(label, current);
          });
        }
      });
    }

    return Array.from(statsByCertificate.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [selectedProjects, certStatsByProject, chartStudents]);

  return (
    <SuperAdminLayout>
      <section className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {cacheInfo.cachedAt > 0 && (
          <span className="mr-auto text-lg text-[#012920]">
            {cacheInfo.isStale ? "⚠\uFE0F " : ""}Last updated:{" "}
            {cacheAgeLabel(cacheInfo.cachedAt)}
          </span>
        )}
        <label className="text-sm font-semibold text-[#012920]">College</label>
        <select
          value={selectedCollegeCode}
          onChange={(event) => setSelectedCollegeCode(event.target.value)}
          className="rounded-lg border border-[#D7E2F1] bg-white px-3 py-2 text-sm font-semibold text-[#012920]"
        >
          <option value="ALL">All Colleges</option>
          {collegeOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleResetLocalDb}
          className="rounded-lg border border-[#D7E2F1] bg-[#012920] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          Reset Local DB
        </button>
        <button
          type="button"
          onClick={handleToggleDbMode}
          className="rounded-lg border border-[#D7E2F1] bg-[#012920] px-4 py-2 text-sm font-semibold text-white shadow-sm"
        >
          DB Mode: {dbMode === DB_MODES.LOCAL ? "Local" : "Production"}
        </button>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Users size={18} />}
          label="Total Students"
          value={totalStudents}
          helper="Across all project groups"
        />
        <MetricCard
          icon={<Building2 size={18} />}
          label="Active Colleges"
          value={`${activeColleges}/${totalColleges}`}
          helper="Current institution status"
        />
        <MetricCard
          icon={<GraduationCap size={18} />}
          label="Project Codes"
          value={totalProjectCodes}
          helper="Configured for batches"
        />
        <MetricCard
          icon={<BookOpenCheck size={18} />}
          label="Certificates"
          value={totalCertificates}
          helper={`${totalCollegeAdmins} college admins assigned`}
        />
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.6fr_1fr]">
        <ChartCard title="Progress Breakdown">
          <ResponsiveContainer width="100%" height={240} debounce={75}>
            <PieChart>
              <Pie
                data={progressBuckets}
                dataKey="count"
                nameKey="bucket"
                innerRadius={52}
                outerRadius={82}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              >
                {progressBuckets.map((entry, index) => (
                  <Cell
                    key={entry.bucket}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip cursor={false} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Students by Project Code">
          <ResponsiveContainer width="100%" height={240} debounce={75}>
            <BarChart data={studentsByProject}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="projectId" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={false} />
              <Bar
                dataKey="count"
                fill={ACCENT_BLUE}
                radius={[8, 8, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Organisation Enrollment Mix">
          <ResponsiveContainer width="100%" height={240} debounce={75}>
            <BarChart data={organizationEnrollmentMix}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="organization" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={false} />
              <Bar
                dataKey="count"
                fill={SIDEBAR_BLUE}
                radius={[8, 8, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <ChartCard title="Certification Results">
          <ResponsiveContainer width="100%" height={280} debounce={75}>
            <BarChart
              data={certificationResultsData}
              margin={{ top: 16, right: 12, left: 0, bottom: 52 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                interval={0}
                height={54}
                angle={-24}
                textAnchor="end"
                tick={{ fontSize: 10 }}
              />
              <YAxis allowDecimals={false} />
              <Tooltip cursor={false} />
              <Legend />
              <Bar
                dataKey="Failed"
                stackId="certResult"
                fill="#E15B64"
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="Ongoing"
                stackId="certResult"
                fill={ACCENT_BLUE}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="Passed"
                stackId="certResult"
                fill={MINT}
                radius={[6, 6, 0, 0]}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Student Progress Distribution">
          <ResponsiveContainer width="100%" height={240} debounce={75}>
            <PieChart>
              <Pie
                data={progressDistributionData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={82}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              >
                {progressDistributionData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip cursor={false} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>
    </SuperAdminLayout>
  );
}

function MetricCard({ icon, label, value, helper }) {
  return (
    <div className="rounded-2xl border border-[#012920] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-lg font-medium text-[#012920]">{label}</p>
        <span className="rounded-lg  bg-[#F5F4EB] p-2 text-[#012920]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-semibold text-[#012920]">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{helper}</p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-[#012920] bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold text-[#012920]">{title}</h2>
      {children}
    </div>
  );
}
