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
import {
  getAllStudents,
  getAllStudentsCount,
  getStudentsByProject,
} from "../../../services/studentService";
import { getAllAdmins } from "../../../services/userService";
import { getAllCertificates } from "../../../services/certificateService";
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

const resolveStudentGender = (student) => {
  const officialDetails = student?.OFFICIAL_DETAILS || {};
  const raw = String(
    student?.gender ||
      officialDetails?.GENDER ||
      officialDetails?.Gender ||
      officialDetails?.gender ||
      "",
  )
    .trim()
    .toLowerCase();

  if (!raw) return "Unknown";
  if (["male", "m", "boy"].includes(raw)) return "Male";
  if (["female", "f", "girl"].includes(raw)) return "Female";
  if (["other", "others", "non-binary", "non binary"].includes(raw)) {
    return "Other";
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

const isCollegeAdminRole = (roleValue) => {
  const normalized = String(roleValue || "")
    .trim()
    .toLowerCase();
  return normalized === "collegeadmin" || normalized === "college admin";
};

export default function Dashboard() {
  const SA_CACHE_KEY = "superadmin_dashboard";

  const [students, setStudents] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
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
      });
      setCacheInfo({ cachedAt: Date.now(), isStale: false });
    }

    const nextProjectCodes = freshData.projectCodes ?? [];
    const nextStudents = freshData.students ?? [];

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
      const key = resolveStudentGender(student);
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

  const certificateToOrganization = new Map(
    certifications.map((certificate) => [
      String(certificate?.id || "").trim(),
      String(certificate?.domain || "").trim() || "Other",
    ]),
  );

  const organizationEnrollmentMap = new Map();
  students.forEach((student) => {
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

  return (
    <SuperAdminLayout>
      <section className="mb-4 flex flex-wrap items-center justify-end gap-2">
        {cacheInfo.cachedAt > 0 && (
          <span className="mr-auto text-lg text-[#012920]">
            {cacheInfo.isStale ? "⚠\uFE0F " : ""}Last updated:{" "}
            {cacheAgeLabel(cacheInfo.cachedAt)}
          </span>
        )}
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

      <section className="mt-5 grid grid-cols-1 gap-5">
        <ChartCard title="Gender Mix">
          <ResponsiveContainer width="100%" height={240} debounce={75}>
            <PieChart>
              <Pie
                data={studentsByGender}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={82}
                label={!isLayoutResizing}
                isAnimationActive={!isLayoutResizing}
                animationDuration={220}
                animationEasing="ease-out"
              >
                {studentsByGender.map((entry, index) => (
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
