import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import {
  getAllCertificates,
  getCertificateEnrollmentStatsByProject,
} from "../../../services/certificateService";
import { getAllOrganizations } from "../../../services/organizationService";

const EMPTY_BREAKDOWN = { enrolledCount: 0, passedCount: 0, failedCount: 0 };

const normalizeStream = (rawCourse, projectCode) => {
  const rawValue =
    String(rawCourse || "").trim() ||
    String(projectCode || "")
      .trim()
      .split("/")[1] ||
    "";
  const normalized = rawValue.toLowerCase();

  if (normalized.includes("mba")) return "MBA";
 
  if (
    normalized.includes("engineering") ||
    normalized.includes("engineer") ||
    normalized.includes("btech") ||
    normalized.includes("cse") ||
    normalized.includes("it") ||
    normalized.includes("ece") ||
    normalized.includes("aiml")
  ) {
    return "Engineering";
  }
  return "Other";
};

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
  const [filters, setFilters] = useState({
    certificate: "",
    domain: "",
    organization: "",
    level: "",
    stream: "all",
    result: "all",
  });

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
        const projectEntries = (projects || [])
          .map((project) => {
            const code = String(project?.code || "").trim();
            if (!code) return null;
            return {
              code,
              stream: normalizeStream(project?.course, code),
            };
          })
          .filter(Boolean);
        const projectCodes = projectEntries.map((entry) => entry.code);

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
        perProjectStats.forEach((statsMap, index) => {
          const stream = projectEntries[index]?.stream || "Other";
          statsMap.forEach((stat, certId) => {
            const target = merged.get(certId) || {
              ...stat,
              enrolledCount: 0,
              passedCount: 0,
              failedCount: 0,
              streamBreakdown: {
                Engineering: { ...EMPTY_BREAKDOWN },
                MBA: { ...EMPTY_BREAKDOWN },
                Other: { ...EMPTY_BREAKDOWN },
              },
            };

            target.enrolledCount += stat.enrolledCount;
            target.passedCount += stat.passedCount;
            target.failedCount += stat.failedCount;

            const streamBucket = target.streamBreakdown[stream]
              ? target.streamBreakdown[stream]
              : target.streamBreakdown.Other;
            streamBucket.enrolledCount += stat.enrolledCount;
            streamBucket.passedCount += stat.passedCount;
            streamBucket.failedCount += stat.failedCount;

            merged.set(certId, target);
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
        
        const engineeringBreakdown = stat.streamBreakdown?.Engineering || { ...EMPTY_BREAKDOWN };
        const mbaBreakdown = stat.streamBreakdown?.MBA || { ...EMPTY_BREAKDOWN };
        const otherBreakdown = stat.streamBreakdown?.Other || { ...EMPTY_BREAKDOWN };
        
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
          engineering: engineeringBreakdown,
          mba: mbaBreakdown,
          other: otherBreakdown,
        };
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [certStatsMap, certifications, organizations]);

  const filterOptions = useMemo(() => {
    const domains = [...new Set(certificateRows.map((row) => row.domain))].sort();
    const organizationsList = [
      ...new Set(certificateRows.map((row) => row.organization)),
    ].sort();
    const levels = [...new Set(certificateRows.map((row) => row.level))].sort();
    return {
      domains,
      organizations: organizationsList,
      levels,
    };
  }, [certificateRows]);

  const filteredCertificateRows = useMemo(() => {
    const certQuery = filters.certificate.trim().toLowerCase();
    return certificateRows.filter((row) => {
      const matchesCertificate = certQuery
        ? row.name.toLowerCase().includes(certQuery) ||
          row.examCode.toLowerCase().includes(certQuery)
        : true;
      const matchesDomain = !filters.domain || row.domain === filters.domain;
      const matchesOrganization =
        !filters.organization || row.organization === filters.organization;
      const matchesLevel = !filters.level || row.level === filters.level;
      const matchesStream =
        filters.stream === "all"
          ? true
          : filters.stream === "engineering"
            ? row.engineering.enrolledCount > 0
            : filters.stream === "mba"
              ? row.mba.enrolledCount > 0
              : row.other.enrolledCount > 0;
      const hasDeclaredResult = row.passedCount > 0 || row.failedCount > 0;
      const matchesResult =
        filters.result === "all"
          ? true
          : filters.result === "passed"
            ? row.passedCount > 0
            : filters.result === "failed"
              ? row.failedCount > 0
              : filters.result === "declared"
                ? hasDeclaredResult
                : !hasDeclaredResult;

      return (
        matchesCertificate &&
        matchesDomain &&
        matchesOrganization &&
        matchesLevel &&
        matchesStream &&
        matchesResult
      );
    });
  }, [certificateRows, filters]);

  const totalEnrolled = filteredCertificateRows.reduce(
    (sum, row) => sum + row.enrolledCount,
    0,
  );
  const totalPassed = filteredCertificateRows.reduce(
    (sum, row) => sum + row.passedCount,
    0,
  );
  const totalFailed = filteredCertificateRows.reduce(
    (sum, row) => sum + row.failedCount,
    0,
  );
  const engineeringTotals = filteredCertificateRows.reduce(
    (acc, row) => {
      acc.enrolledCount += row.engineering.enrolledCount;
      acc.passedCount += row.engineering.passedCount;
      acc.failedCount += row.engineering.failedCount;
      return acc;
    },
    { ...EMPTY_BREAKDOWN },
  );
  const mbaTotals = filteredCertificateRows.reduce(
    (acc, row) => {
      acc.enrolledCount += row.mba.enrolledCount;
      acc.passedCount += row.mba.passedCount;
      acc.failedCount += row.mba.failedCount;
      return acc;
    },
    { ...EMPTY_BREAKDOWN },
  );
  const otherTotals = filteredCertificateRows.reduce(
    (acc, row) => {
      acc.enrolledCount += row.other.enrolledCount;
      acc.passedCount += row.other.passedCount;
      acc.failedCount += row.other.failedCount;
      return acc;
    },
    { ...EMPTY_BREAKDOWN },
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certificates</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          title="Visible Certificates"
          value={`${filteredCertificateRows.length} / ${certificateRows.length}`}
        />
        <StatCard title="Total Enrollments" value={totalEnrolled} />
        <ResultSummaryCard
          totalEnrolled={totalEnrolled}
          totalPassed={totalPassed}
          totalFailed={totalFailed}
        />
      </section>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StreamSummaryCard title="Engineering" breakdown={engineeringTotals} />
        <StreamSummaryCard title="MBA" breakdown={mbaTotals} />
        <StreamSummaryCard title="Other" breakdown={otherTotals} />
      </section>

      <section className="rounded-xl bg-white p-6 border border-[#012920] shadow">
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
                <th className="py-2 pr-3">Engineering (E/P/F)</th>
                <th className="py-2 pr-3">MBA (E/P/F)</th>
                <th className="py-2 pr-3">Other (E/P/F)</th>
                <th className="py-2 pr-3">Enrolled Students</th>
                <th className="py-2">Result Status</th>
              </tr>
              <tr className="border-b bg-gray-50 text-left">
                <th className="py-2 pr-3">
                  <input
                    type="text"
                    value={filters.certificate}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        certificate: event.target.value,
                      }))
                    }
                    placeholder="Search name/exam"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                </th>
                <th className="py-2 pr-3">
                  <select
                    value={filters.domain}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        domain: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">All</option>
                    {filterOptions.domains.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="py-2 pr-3">
                  <select
                    value={filters.organization}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        organization: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">All</option>
                    {filterOptions.organizations.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="py-2 pr-3" />
                <th className="py-2 pr-3">
                  <select
                    value={filters.level}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        level: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">All</option>
                    {filterOptions.levels.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="py-2 pr-3">
                  <select
                    value={filters.stream}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        stream: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="all">All streams</option>
                    <option value="engineering">Engineering</option>
                    <option value="mba">MBA</option>
                    <option value="other">Other</option>
                  </select>
                </th>
                <th className="py-2 pr-3" />
                <th className="py-2">
                  <select
                    value={filters.result}
                    onChange={(event) =>
                      setFilters((prev) => ({
                        ...prev,
                        result: event.target.value,
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="all">All results</option>
                    <option value="declared">Declared</option>
                    <option value="pending">Pending</option>
                    <option value="passed">Has passed</option>
                    <option value="failed">Has failed</option>
                  </select>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCertificateRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-gray-500"
                    colSpan={10}
                  >
                    No certificates match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredCertificateRows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2 pr-3 font-medium">{row.name}</td>
                    <td className="py-2 pr-3">{row.domain}</td>
                    <td className="py-2 pr-3">{row.organization}</td>
                    <td className="py-2 pr-3">{row.examCode}</td>
                    <td className="py-2 pr-3">{row.level}</td>
                    <td className="py-2 pr-3">
                      <CompactBreakdown breakdown={row.engineering} />
                    </td>
                    <td className="py-2 pr-3">
                      <CompactBreakdown breakdown={row.mba} />
                    </td>
                    <td className="py-2 pr-3">
                      <CompactBreakdown breakdown={row.other} />
                    </td>
                    <td className="py-2 pr-3">{row.enrolledCount}</td>
                    <td className="py-2">
                      <StatusPills
                        enrolledCount={row.enrolledCount}
                        passedCount={row.passedCount}
                        failedCount={row.failedCount}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-xl bg-white p-5 border border-1 border-[#012920]  shadow">
      <p className="text-sm text-[#012920]">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-[#012920]">{value}</p>
    </div>
  );
}

function ResultSummaryCard({ totalEnrolled, totalPassed, totalFailed }) {
  return (
    <div className="rounded-xl bg-white p-5 border border-[#012920] shadow">
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

function StreamSummaryCard({ title, breakdown }) {
  return (
    <div className="rounded-xl bg-white p-5 border border-[#012920] shadow">
      <p className="text-sm text-gray-500">{title} Students</p>
      <div className="mt-3">
        <StatusPills
          enrolledCount={breakdown.enrolledCount}
          passedCount={breakdown.passedCount}
          failedCount={breakdown.failedCount}
        />
      </div>
    </div>
  );
}

function CompactBreakdown({ breakdown }) {
  return (
    <span className="font-medium">
      {breakdown.enrolledCount}/{breakdown.passedCount}/{breakdown.failedCount}
    </span>
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
    <div className="flex flex-wrap gap-2 ">
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
