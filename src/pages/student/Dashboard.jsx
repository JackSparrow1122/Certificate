import {
  Award,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getStudentForAuthUser } from "../../../services/studentService";
import {
  getCertificatesByIds,
  getStudentEnrollmentsByProject,
  getEnrollmentsByStudentEmail,
  getEnrollmentsByStudentId,
} from "../../../services/certificateService";
import { getAllOrganizations } from "../../../services/organizationService";

const getCurrentYearFromProjectCode = (projectCodeValue) => {
  const parts = String(projectCodeValue || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return parts[2];
  }

  return "";
};

const normalizeCertificateStatus = (status) => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (["passed", "completed", "certified"].includes(normalized))
    return "passed";
  if (["failed"].includes(normalized)) return "failed";
  return "enrolled";
};

const getOptimizedLogoUrl = (logoUrl) => {
  const raw = String(logoUrl || "").trim();
  if (!raw) return "";

  if (!/res\.cloudinary\.com/i.test(raw)) {
    return raw;
  }

  const marker = "/upload/";
  const markerIndex = raw.indexOf(marker);
  if (markerIndex === -1) return raw;

  const head = raw.slice(0, markerIndex + marker.length);
  const tail = raw.slice(markerIndex + marker.length);
  const [firstSegment = ""] = tail.split("/");
  const hasTransformation =
    firstSegment.includes(",") ||
    (!/^v\d+$/.test(firstSegment) && firstSegment !== "");

  if (hasTransformation) {
    return raw;
  }

  const transformation = "e_trim:8,c_fit,w_520,h_220,b_white,q_auto,f_auto";
  return `${head}${transformation}/${tail}`;
};

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [currentStudent, setCurrentStudent] = useState(null);
  const [enrolledCertificates, setEnrolledCertificates] = useState([]);
  const [selectedYear, setSelectedYear] = useState("All Years");
  const [certLoading, setCertLoading] = useState(false);
  const certScrollRef = useRef(null);

  const scrollCerts = (direction) => {
    const container = certScrollRef.current;
    if (!container) return;
    const cardWidth = 270 + 16; // card min-width + gap
    container.scrollBy({
      left: direction === "next" ? cardWidth : -cardWidth,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    let mounted = true;
    const loadStudent = async () => {
      try {
        const student = await getStudentForAuthUser({ profile, user });
        if (!mounted) return;
        setCurrentStudent(student || null);
      } catch (error) {
        console.error("Failed to load student record:", error);
      }
    };

    loadStudent();
    return () => {
      mounted = false;
    };
  }, [profile, user]);

  const officialDetails = currentStudent?.OFFICIAL_DETAILS || {};
  const tenthDetails = currentStudent?.TENTH_DETAILS || {};
  const twelfthDetails = currentStudent?.TWELFTH_DETAILS || {};
  const diplomaDetails = currentStudent?.DIPLOMA_DETAILS || {};
  const graduationDetails = currentStudent?.GRADUATION_DETAILS || {};
  const fullName =
    officialDetails["FULL NAME OF STUDENT"] || currentStudent?.name || "-";
  const rollNo = officialDetails.SN || currentStudent?.id || "-";
  const gender = currentStudent?.gender || officialDetails.GENDER || "-";
  const dob = currentStudent?.dob || officialDetails["BIRTH DATE"] || "-";
  const email = currentStudent?.email || officialDetails["EMAIL_ID"] || "-";
  const phone = currentStudent?.phone || officialDetails["MOBILE NO."] || "-";
  const passingYear =
    graduationDetails["GRADUATION PASSING YR"] ||
    currentStudent?.passingYear ||
    currentStudent?.admissionYear ||
    "-";
  const structuredProjectCode =
    currentStudent?.projectCode || currentStudent?.projectId || "";
  const currentYearFromCode = getCurrentYearFromProjectCode(
    structuredProjectCode,
  );
  const currentYear =
    currentYearFromCode || currentStudent?.currentSemester || "-";
  const tenthPercentage =
    currentStudent?.tenthPercentage ??
    tenthDetails["10th OVERALL MARKS %"] ??
    "-";
  const twelfthPercentage =
    currentStudent?.twelfthPercentage ??
    twelfthDetails["12th OVERALL MARKS %"] ??
    diplomaDetails["DIPLOMA OVERALL MARKS %"] ??
    "-";

  useEffect(() => {
    let mounted = true;

    const loadEnrolledCertificates = async () => {
      if (!currentStudent) {
        setEnrolledCertificates([]);
        return;
      }

      const projectCode = currentStudent.projectCode || currentStudent.projectId || "";
      const projectYearTag = getCurrentYearFromProjectCode(projectCode);

      // Try collectionGroup enrollment lookup by student email/id first (captures multiple projects/years)
      try {
        const email = String(currentStudent.email || currentStudent.OFFICIAL_DETAILS?.EMAIL_ID || "").trim();
        const studentId = String(currentStudent.id || currentStudent.docId || currentStudent.rollNo || "").trim();

        const [byEmail, byId] = await Promise.all([
          email ? getEnrollmentsByStudentEmail(email) : [],
          studentId ? getEnrollmentsByStudentId(studentId) : [],
        ]);

        const merged = [...byEmail, ...byId];
        if (merged.length > 0) {
          const mapped = merged.map((entry, idx) => ({
            id: entry.certificateId || `enroll-${idx}`,
            name: entry.certificateName || "Certificate",
            platform: entry.platform || "Certification",
            organizationName: entry.organizationName || entry.domain || "",
            organizationLogoUrl: entry.organizationLogoUrl || "",
            level: entry.level || "",
            status: normalizeCertificateStatus(entry.status || "enrolled"),
            yearTag: entry.yearTag || getCurrentYearFromProjectCode(entry.projectCode) || projectYearTag,
          }));
          setEnrolledCertificates(mapped);
          return;
        }
      } catch (err) {
        console.warn("Email/id enrollment lookup failed, fallback to project lookup", err);
      }

      // Fallback: per-project enrollments for this student's project
      try {
        const enrollmentsMap = await getStudentEnrollmentsByProject(projectCode);
        const enrollmentEntries = enrollmentsMap.get(
          String(currentStudent.id || currentStudent.docId || "").trim(),
        );

        if (enrollmentEntries && enrollmentEntries.length > 0) {
          // Fetch all organizations for logos
          let organizations = [];
          try {
            organizations = await getAllOrganizations();
          } catch (organizationError) {
            console.warn(
              "Unable to fetch organization metadata; proceeding without logos:",
              organizationError,
            );
          }
          const organizationByName = new Map(
            (organizations || [])
              .filter((organization) => organization?.name)
              .map((organization) => [
                String(organization.name || "")
                  .trim()
                  .toLowerCase(),
                organization,
              ]),
          );

          // Fetch full certificate details for platform, level, domain
          const certIds = enrollmentEntries.map((e) => e.certificateId);
          let linkedCertificates = [];
          try {
            linkedCertificates = await getCertificatesByIds(certIds);
          } catch (certificateError) {
            console.warn(
              "Unable to fetch certificate metadata; falling back to enrollment data:",
              certificateError,
            );
          }
          const certDataMap = new Map(linkedCertificates.map((c) => [c.id, c]));

          const mapped = enrollmentEntries.map((entry, idx) => {
            const certDoc = certDataMap.get(entry.certificateId) || {};
            const orgName = certDoc.domain || entry.organizationName || "";

            return {
              id: entry.certificateId || `enroll-${idx}`,
              name: certDoc.name || entry.certificateName || "Certificate",
              platform: certDoc.platform || "Certification",
              organizationName: orgName,
              organizationLogoUrl:
                organizationByName.get(String(orgName).trim().toLowerCase())
                  ?.logoUrl || "",
              level: certDoc.level || "",
              status: normalizeCertificateStatus(entry.status || "enrolled"),
              yearTag: entry.yearTag || projectYearTag,
            };
          });
          setEnrolledCertificates(mapped);
          return;
        }
      } catch (err) {
        console.warn(
          "Enrollment lookup failed, fallback to legacy results",
          err,
        );
      }

      const resultMap =
        currentStudent.certificateResults &&
        typeof currentStudent.certificateResults === "object"
          ? currentStudent.certificateResults
          : {};

      const certificateResultEntries = Object.entries(resultMap).filter(
        ([, entry]) => entry && typeof entry === "object" && !entry?.isDeleted,
      );

      const legacyCertificateResult =
        currentStudent.certificateResult &&
        typeof currentStudent.certificateResult === "object"
          ? currentStudent.certificateResult
          : null;

      const certificateIdSet = new Set(
        Array.isArray(currentStudent.certificateIds)
          ? currentStudent.certificateIds.filter((id) => {
              // Exclude IDs whose certificateResult entry is marked isDeleted
              const entry = resultMap[id];
              return id && (!entry || !entry.isDeleted);
            })
          : [],
      );

      certificateResultEntries.forEach(([mapKey, entry]) => {
        const resolvedId = String(entry.certificateId || mapKey || "").trim();
        if (resolvedId) {
          certificateIdSet.add(resolvedId);
        }
      });

      if (legacyCertificateResult?.certificateId) {
        certificateIdSet.add(String(legacyCertificateResult.certificateId));
      }

      setCertLoading(true);
      try {
        const certificateIds = Array.from(certificateIdSet);
        let linkedCertificates = [];
        if (certificateIds.length > 0) {
          try {
            linkedCertificates = await getCertificatesByIds(certificateIds);
          } catch (certificateError) {
            console.warn(
              "Unable to fetch certificate metadata; falling back to student result data:",
              certificateError,
            );
          }
        }

        let organizations = [];
        try {
          organizations = await getAllOrganizations();
        } catch (organizationError) {
          console.warn(
            "Unable to fetch organization metadata; proceeding without logos:",
            organizationError,
          );
        }
        const organizationByName = new Map(
          (organizations || [])
            .filter((organization) => organization?.name)
            .map((organization) => [
              String(organization.name || "")
                .trim()
                .toLowerCase(),
              organization,
            ]),
        );

        const certificateById = new Map(
          linkedCertificates
            .filter((certificate) => certificate?.id)
            .map((certificate) => [certificate.id, certificate]),
        );

        const finalById = new Map();

        certificateIds.forEach((certificateId, index) => {
          const certificateDoc = certificateById.get(certificateId);
          finalById.set(certificateId, {
            id: certificateId || `cert-${index}`,
            name: certificateDoc?.name || `Certificate ${index + 1}`,
            platform: certificateDoc?.platform || "Certification",
            organizationName: certificateDoc?.domain || "",
            organizationLogoUrl:
              organizationByName.get(
                String(certificateDoc?.domain || "")
                  .trim()
                  .toLowerCase(),
              )?.logoUrl || "",
            level: certificateDoc?.level || "Beginner",
            status: "enrolled",
          });
        });

        certificateResultEntries.forEach(([mapKey, entry], index) => {
          const resolvedId = String(entry.certificateId || mapKey || "").trim();
          const fallbackId = resolvedId || `result-cert-${index}`;
          const certificateDoc = certificateById.get(resolvedId);
          const existing = finalById.get(fallbackId);
          const resolvedStatus = entry.status || entry.result || "enrolled";

          finalById.set(fallbackId, {
            id: fallbackId,
            name:
              entry.certificateName ||
              certificateDoc?.name ||
              existing?.name ||
              `Certificate ${index + 1}`,
            platform:
              certificateDoc?.platform || existing?.platform || "Certification",
            organizationName:
              certificateDoc?.domain || existing?.organizationName || "",
            organizationLogoUrl:
              organizationByName.get(
                String(
                  certificateDoc?.domain || existing?.organizationName || "",
                )
                  .trim()
                  .toLowerCase(),
              )?.logoUrl ||
              existing?.organizationLogoUrl ||
              "",
            level: certificateDoc?.level || existing?.level || "Beginner",
            status: normalizeCertificateStatus(resolvedStatus),
          });
        });

        if (legacyCertificateResult) {
          const legacyId = String(
            legacyCertificateResult.certificateId || "",
          ).trim();
          const resolvedId =
            legacyId ||
            Array.from(finalById.values()).find(
              (certificate) =>
                String(certificate.name || "")
                  .trim()
                  .toLowerCase() ===
                String(legacyCertificateResult.certificateName || "")
                  .trim()
                  .toLowerCase(),
            )?.id ||
            "legacy-certificate-result";

          const existing = finalById.get(resolvedId);
          const certificateDoc = certificateById.get(legacyId);

          finalById.set(resolvedId, {
            id: resolvedId,
            name:
              legacyCertificateResult.certificateName ||
              certificateDoc?.name ||
              existing?.name ||
              "Certificate",
            platform:
              certificateDoc?.platform || existing?.platform || "Certification",
            organizationName:
              certificateDoc?.domain || existing?.organizationName || "",
            organizationLogoUrl:
              organizationByName.get(
                String(
                  certificateDoc?.domain || existing?.organizationName || "",
                )
                  .trim()
                  .toLowerCase(),
              )?.logoUrl ||
              existing?.organizationLogoUrl ||
              "",
            level: certificateDoc?.level || existing?.level || "Beginner",
            status: normalizeCertificateStatus(
              legacyCertificateResult.status ||
                legacyCertificateResult.result ||
                existing?.status ||
                "enrolled",
            ),
          });
        }

        const finalList = Array.from(finalById.values()).map((cert, index) => ({
          ...cert,
          yearTag: cert.yearTag || projectYearTag || currentYear || "",
          id: cert.id || cert.certificateId || `cert-${index}`,
        }));

        if (mounted) {
          setEnrolledCertificates(finalList);
        }
      } catch (error) {
        console.error("Failed to load enrolled certificates:", error);
        if (mounted) setEnrolledCertificates([]);
      } finally {
        if (mounted) setCertLoading(false);
      }
    };

    loadEnrolledCertificates();
    return () => {
      mounted = false;
    };
  }, [currentStudent]);

  const certYearOptions = useMemo(() => {
    const years = new Set(
      enrolledCertificates
        .map((cert) => String(cert.yearTag || "").trim())
        .filter(Boolean),
    );
    return ["All Years", ...Array.from(years).sort()];
  }, [enrolledCertificates]);

  const filteredCertificates = useMemo(() => {
    if (selectedYear === "All Years") return enrolledCertificates;
    return enrolledCertificates.filter(
      (cert) => String(cert.yearTag || "").trim() === selectedYear,
    );
  }, [enrolledCertificates, selectedYear]);

  const statusSummary = filteredCertificates.reduce(
    (acc, certificate) => {
      const normalizedStatus = normalizeCertificateStatus(certificate.status);
      if (normalizedStatus === "passed") acc.passed += 1;
      else if (normalizedStatus === "failed") acc.failed += 1;
      else acc.enrolled += 1;
      return acc;
    },
    { enrolled: 0, passed: 0, failed: 0 },
  );

  return (
    <div className="space-y-7">
      <section className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="text-lg font-medium text-[#0B2A4A]">Welcome, {fullName}. </span>
        <select
          className="rounded-lg border border-[#D7E2F1] bg-[#012920] px-3 py-1.5 text-sm text-white"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {certYearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Enrolled"
          value={statusSummary.enrolled}
          icon={<Award size={18} />}
        />
        <StatCard
          label="Passed"
          value={statusSummary.passed}
          icon={<BookOpenCheck size={18} />}
        />
        <StatCard
          label="Failed"
          value={statusSummary.failed}
          icon={<Target size={18} />}
        />
        <StatCard
          label="Current Year"
          value={currentYear}
          icon={<Clock3 size={18} />}
        />
      </section>

      <section className="student-navbar-card rounded-3xl border border-[#D7E2F1] bg-white p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-3">
            <h3 className="text-2xl font-semibold text-[#0B2A4A]">
              Learning that drives results
            </h3>
            <p className="text-sm text-[#0B2A4A]/80">
              View all certificates you are enrolled in and their completion
              status.
            </p>
            <button
              type="button"
              className="rounded-xl border border-[#1D5FA8] bg-white px-4 py-2 text-sm font-semibold text-[#1D5FA8]"
            >
              {filteredCertificates.length} shown
            </button>
          </div>

          <div className="relative flex items-center gap-2 min-w-0">
            {/* Left arrow */}
            <button
              type="button"
              onClick={() => scrollCerts("prev")}
              disabled={certLoading || enrolledCertificates.length === 0}
              className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E2F1] bg-white shadow-sm text-[#1D5FA8] transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
              aria-label="Previous certificate"
            >
              <ChevronLeft size={20} />
            </button>

            {/* Card strip */}
            <div
              ref={certScrollRef}
              className="cert-carousel flex flex-1 gap-4 overflow-x-auto scroll-smooth pb-2 min-w-0"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                scrollSnapType: "x mandatory",
              }}
            >
              {certLoading ? (
                <div className="flex min-h-[220px] w-full min-w-[270px] items-center justify-center rounded-2xl border border-[#D7E2F1] bg-white text-sm text-gray-500">
                  Loading certificates...
                </div>
              ) : filteredCertificates.length > 0 ? (
                filteredCertificates.map((certificate) => (
                  <CertificateCard
                    key={certificate.id}
                    certificate={certificate}
                  />
                ))
              ) : (
                <div className="flex min-h-[220px] w-full min-w-[270px] items-center justify-center rounded-2xl border border-[#D7E2F1] bg-white text-sm text-gray-500">
                  No enrolled certificates found.
                </div>
              )}
            </div>

            {/* Right arrow */}
            <button
              type="button"
              onClick={() => scrollCerts("next")}
              disabled={certLoading || enrolledCertificates.length === 0}
              className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full border border-[#D7E2F1] bg-white shadow-sm text-[#1D5FA8] transition disabled:opacity-30 disabled:cursor-not-allowed z-10"
              aria-label="Next certificate"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6">
        <Panel title="Profile Snapshot">
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#CFFF92] p-4 text-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/90 text-lg font-bold text-[#012920]">
                    {String(fullName || "S")
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="text-lg font-semibold leading-tight text-[#012920]">
                      {fullName}
                    </p>
                    <p className="text-xs text-[#012920]">Roll No: {rollNo}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 text-right">
                  <p className="text-xs text-[#012920]">Current Year</p>
                  <p className="text-lg text-[#012920] font-semibold">{currentYear}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ">
              <SnapshotItem label="Gender" value={gender} />
              <SnapshotItem label="Date of Birth" value={dob} />
              <SnapshotItem label="Passing Year" value={passingYear} />
              <SnapshotItem label="Email" value={email} />
              <SnapshotItem label="Phone" value={phone} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#D7E2F1] bg-whiite p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-[#012920]">
                  10th Percentage
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#012920]">
                  {tenthPercentage !== "-" ? `${tenthPercentage}%` : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-[#D7E2F1] bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-[#012920]">
                  12th / Diploma Percentage
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#012920]">
                  {twelfthPercentage !== "-" ? `${twelfthPercentage}%` : "-"}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="rounded-2xl border border-[#D7E2F1] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#0B2A4A]/70">{label}</p>
        <span className="rounded-lg bg-[#EEF3FA] p-2 text-[#0B2A4A]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-[#0B2A4A]">{value}</p>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div className="rounded-2xl border border-[#D7E2F1] bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-[#0B2A4A]">{title}</h3>
      {children}
    </div>
  );
}

function SnapshotItem({ label, value }) {
  return (
    <div className="rounded-xl border border-[#D7E2F1] bg-white p-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-[#012920]">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[#0B2A4A]">
        {value || "-"}
      </p>
    </div>
  );
}

function CertificateCard({ certificate }) {
  const logoUrl = getOptimizedLogoUrl(certificate.organizationLogoUrl);
  const statusLabel = normalizeCertificateStatus(
    certificate.status || "enrolled",
  );
  const statusBadgeClass =
    statusLabel === "passed"
      ? "bg-[#6BC7A7]/30 text-[#0B2A4A]"
      : statusLabel === "failed"
        ? "bg-red-100 text-red-700"
        : "bg-[#0B2A4A]/10 text-[#0B2A4A]";

  return (
    <article
      style={{ scrollSnapAlign: "start", scrollSnapStop: "always" }}
      className="min-w-[270px] max-w-[300px] flex-1 overflow-hidden rounded-2xl border border-[#D7E2F1] bg-white shadow-sm"
    >
      <div className="flex h-28 items-center justify-center bg-white px-3 py-2">
        {logoUrl ? (
          <div className="flex h-20 w-full items-center justify-center rounded-md bg-white">
            <img
              src={logoUrl}
              alt={`${certificate.organizationName || "Organisation"} logo`}
              className="h-full w-full object-contain object-center"
            />
          </div>
        ) : (
          <div className="flex h-20 w-full items-center justify-center rounded-md bg-[#0B2A4A]">
            <p className="text-xs font-medium uppercase tracking-wide text-white/80">
              Certificate
            </p>
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-xs text-[#0B2A4A]/70">{certificate.platform}</p>
          <h4 className="mt-1 text-lg font-semibold text-[#0B2A4A]">
            {certificate.name}
          </h4>
          <p className="mt-1 text-xs text-gray-600">{certificate.level}</p>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span
            className={`rounded-full px-2 py-1 font-medium capitalize ${statusBadgeClass}`}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </article>
  );
}
