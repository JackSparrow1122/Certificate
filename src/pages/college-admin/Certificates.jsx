import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import {
  getAllCertificates,
  getCertificateEnrollmentStatsByProject,
} from "../../../services/certificateService";
import { getAllOrganizations } from "../../../services/organizationService";

export default function Certificates() {
  const { profile } = useAuth();
  const collegeCode = String(
    profile?.collegeCode || profile?.college_code || "",
  )
    .trim()
    .toUpperCase();
  // Map<certId, { id, name, examCode, enrolledCount, passedCount, failedCount }>
  // aggregated from the lightweight certificate_enrollments subcollection
  const [certStatsMap, setCertStatsMap] = useState(new Map());
  const [certifications, setCertifications] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!collegeCode) {
          if (!mounted) return;
          setCertStatsMap(new Map());
          return;
        }

        const projects = await getProjectCodesByCollege(collegeCode);
        const projectCodes = (projects || [])
          .map((p) => String(p?.code || "").trim())
          .filter(Boolean);

        // Run all three fetches in parallel:
        // 1. Enrollment stats per project code (lightweight subcollection docs)
        // 2. Full certificate metadata for enrichment
        // 3. Organization metadata
        const [perProjectStats, allCerts, orgRows] = await Promise.all([
          Promise.all(
            projectCodes.map((code) =>
              getCertificateEnrollmentStatsByProject(code).catch((err) => {
                console.warn(`Cert stats failed for ${code}:`, err);
                return new Map();
              }),
            ),
          ),
          getAllCertificates().catch((err) => {
            console.warn("Unable to fetch certificate metadata:", err);
            return [];
          }),
          getAllOrganizations().catch((err) => {
            console.warn("Unable to fetch organization metadata:", err);
            return [];
          }),
        ]);

        // Merge per-project stats into one map, accumulating counts
        const merged = new Map();
        perProjectStats.forEach((statsMap) => {
          statsMap.forEach((stat, certId) => {
            const existing = merged.get(certId);
            if (!existing) {
              merged.set(certId, { ...stat });
            } else {
              existing.enrolledCount += stat.enrolledCount;
              existing.passedCount += stat.passedCount;
              existing.failedCount += stat.failedCount;
            }
          });
        });

        if (!mounted) return;
        setCertStatsMap(merged);
        setCertifications(allCerts || []);
        setOrganizations(orgRows || []);
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
      (certifications || []).map((cert) => [
        String(cert?.id || "").trim(),
        cert,
      ]),
    );
    const organizationByName = new Map(
      (organizations || [])
        .filter((org) => String(org?.name || "").trim())
        .map((org) => [
          String(org.name || "")
            .trim()
            .toLowerCase(),
          org,
        ]),
    );

    return Array.from(certStatsMap.values())
      .map((stat) => {
        const meta = metaById.get(stat.id) || null;
        const rawOrg = String(meta?.domain || "").trim() || "-";
        const orgLookupKey = rawOrg.toLowerCase();
        const matchedOrg =
          orgLookupKey && orgLookupKey !== "-"
            ? organizationByName.get(orgLookupKey)
            : null;
        return {
          id: stat.id,
          name: String(meta?.name || stat.name || "").trim() || stat.id,
          domain: String(meta?.platform || "").trim() || "-",
          organization: matchedOrg?.name
            ? String(matchedOrg.name).trim()
            : rawOrg,
          examCode: String(meta?.examCode || stat.examCode || "").trim() || "-",
          level: String(meta?.level || "").trim() || "-",
          enrolledCount: stat.enrolledCount,
          passedCount: stat.passedCount,
          failedCount: stat.failedCount,
        };
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [certStatsMap, certifications, organizations]);

  const totalEnrolled = certificateRows.reduce(
    (sum, row) => sum + row.enrolledCount,
    0,
  );
  const totalPassed = certificateRows.reduce(
    (sum, row) => sum + row.passedCount,
    0,
  );
  const totalFailed = certificateRows.reduce(
    (sum, row) => sum + row.failedCount,
    0,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Configured Certificates"
          value={certificateRows.length}
        />
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
                <th className="py-2 pr-3">Domain</th>
                <th className="py-2 pr-3">Organisation</th>
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
                  <td className="py-2 pr-3">{row.domain}</td>
                  <td className="py-2 pr-3">{row.organization}</td>
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
