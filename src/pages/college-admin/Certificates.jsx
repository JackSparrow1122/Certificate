import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getStudentsByProject } from "../../../services/studentService";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import { getCertificatesByIds } from "../../../services/certificateService";

const getResultStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (["passed", "pass", "completed", "certified"].includes(normalized)) {
    return "passed";
  }
  if (["failed", "fail"].includes(normalized)) {
    return "failed";
  }
  return "enrolled";
};

export default function Certificates() {
  const { profile } = useAuth();
  const collegeCode = String(profile?.collegeCode || profile?.college_code || "")
    .trim()
    .toUpperCase();
  const [students, setStudents] = useState([]);
  const [certifications, setCertifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!collegeCode) {
          if (!mounted) return;
          setStudents([]);
          return;
        }

        const projects = await getProjectCodesByCollege(collegeCode);
        const studentGroups = await Promise.all(
          (projects || []).map((project) =>
            getStudentsByProject(String(project?.code || "").trim()),
          ),
        );
        const s = studentGroups.flatMap((group) => group || []);
        const certificateIds = [
          ...new Set(
            (s || []).flatMap((student) => {
              const fromArray = Array.isArray(student?.certificateIds)
                ? student.certificateIds
                : [];
              const fromResults =
                student?.certificateResults &&
                typeof student.certificateResults === "object"
                  ? Object.keys(student.certificateResults)
                  : [];
              return [...fromArray, ...fromResults]
                .map((id) => String(id || "").trim())
                .filter(Boolean);
            }),
          ),
        ];
        const c =
          certificateIds.length > 0 ? await getCertificatesByIds(certificateIds) : [];
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
  }, [collegeCode]);

  const certificateRows = useMemo(() => {
    const metaById = new Map(
      (certifications || []).map((certificate) => [
        String(certificate?.id || "").trim(),
        certificate,
      ]),
    );
    const metaByName = new Map(
      (certifications || []).map((certificate) => [
        String(certificate?.name || "")
          .trim()
          .toLowerCase(),
        certificate,
      ]),
    );
    const byCertificate = new Map();

    (students || []).forEach((student) => {
      const results =
        student?.certificateResults && typeof student.certificateResults === "object"
          ? Object.values(student.certificateResults)
          : [];

      if (results.length > 0) {
        results.forEach((result, index) => {
          const name = String(result?.certificateName || "").trim();
          if (!name) return;

          const key = String(result?.certificateId || "").trim() || `name:${name.toLowerCase()}`;
          const metadata =
            (result?.certificateId && metaById.get(String(result.certificateId).trim())) ||
            metaByName.get(name.toLowerCase()) ||
            null;
          const current = byCertificate.get(key) || {
            id: key,
            name,
            platform:
              String(metadata?.platform || "").trim() ||
              String(result?.platform || "").trim() ||
              "-",
            examCode:
              String(metadata?.examCode || "").trim() ||
              String(result?.examCode || "").trim() ||
              "-",
            level:
              String(metadata?.level || "").trim() ||
              String(result?.level || "").trim() ||
              "-",
            enrolledCount: 0,
            passedCount: 0,
            failedCount: 0,
          };

          current.enrolledCount += 1;
          const resultStatus = getResultStatus(result?.status || result?.result);
          if (resultStatus === "passed") current.passedCount += 1;
          if (resultStatus === "failed") current.failedCount += 1;
          if (index === 0) {
            current.platform = current.platform || "-";
            current.examCode = current.examCode || "-";
            current.level = current.level || "-";
          }
          byCertificate.set(key, current);
        });
        return;
      }

      const legacyName = String(student?.certificate || "").trim();
      if (!legacyName) return;
      const key = `name:${legacyName.toLowerCase()}`;
      const metadata = metaByName.get(legacyName.toLowerCase()) || null;
      const current = byCertificate.get(key) || {
        id: key,
        name: legacyName,
        platform: String(metadata?.platform || "").trim() || "-",
        examCode: String(metadata?.examCode || "").trim() || "-",
        level: String(metadata?.level || "").trim() || "-",
        enrolledCount: 0,
        passedCount: 0,
        failedCount: 0,
      };
      current.enrolledCount += 1;
      byCertificate.set(key, current);
    });

    return Array.from(byCertificate.values())
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [students, certifications]);

  const totalEnrolled = certificateRows.reduce(
    (sum, row) => sum + row.enrolledCount,
    0,
  );
  const totalPassed = certificateRows.reduce((sum, row) => sum + row.passedCount, 0);
  const totalFailed = certificateRows.reduce((sum, row) => sum + row.failedCount, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Configured Certificates" value={certificateRows.length} />
        <StatCard title="Total Enrollments" value={totalEnrolled} />
        <ResultSummaryCard
          totalEnrolled={totalEnrolled}
          totalPassed={totalPassed}
          totalFailed={totalFailed}
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
                <th className="py-2">Result Status</th>
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
                  <td className="py-2">
                    <StatusPills
                      enrolledCount={row.enrolledCount}
                      passedCount={row.passedCount}
                      failedCount={row.failedCount}
                    />
                  </td>
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

function ResultSummaryCard({ totalEnrolled, totalPassed, totalFailed }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow">
      <p className="text-sm text-gray-500">Result Status</p>
      <div className="mt-3">
        <StatusPills
          enrolledCount={totalEnrolled}
          passedCount={totalPassed}
          failedCount={totalFailed}
        />
      </div>
    </div>
  );
}

function StatusPills({ enrolledCount, passedCount, failedCount }) {
  const hasDeclaredResult = passedCount > 0 || failedCount > 0;

  if (!hasDeclaredResult) {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
        Enrolled: {enrolledCount}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {passedCount > 0 && (
        <span className="inline-flex rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
          Passed: {passedCount}
        </span>
      )}
      {failedCount > 0 && (
        <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
          Failed: {failedCount}
        </span>
      )}
    </div>
  );
}
