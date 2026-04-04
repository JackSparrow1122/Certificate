import {
  Award,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Mail,
  Phone,
  Calendar,
  User,
  CheckCircle2,
  XCircle,
  BookOpen,
  LayersIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { useAuth } from "../../context/AuthContext";
import { getStudentForAuthUser } from "../../../services/studentService";
import {
  getCertificatesByIds,
  getStudentEnrollmentsByProject,
  getEnrollmentsByStudentEmail,
  getEnrollmentsByStudentId,
} from "../../../services/certificateService";
import { getAllOrganizations } from "../../../services/organizationService";

const getHighestSemesterNumber = (entries = [], fallback = "") => {
  const parsed = (Array.isArray(entries) ? entries : [])
    .map((entry) => {
      const value =
        entry?.semesterNumber ?? entry?.assignedSemesterNumber ?? "";
      const match = String(value).match(/\d+/);
      return match ? Number(match[0]) : NaN;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  if (parsed.length === 0) return String(fallback || "-");
  return String(Math.max(...parsed));
};

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

const getLogoFromCertificate = (certificate = {}) => {
  return String(
    certificate.organizationLogoUrl ||
      certificate.logoUrl ||
      certificate.organizationLogo ||
      certificate.logo ||
      "",
  ).trim();
};

const STATUS_COLORS = {
  enrolled: "#3B82F6",
  passed: "#22C55E",
  failed: "#EF4444",
};

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [currentStudent, setCurrentStudent] = useState(null);
  const [enrolledCertificates, setEnrolledCertificates] = useState([]);
  const [selectedYear, setSelectedYear] = useState("All Years");
  const [selectedSemester, setSelectedSemester] = useState("All Semesters");
  const [certLoading, setCertLoading] = useState(false);
  const certScrollRef = useRef(null);

  const scrollCerts = (direction) => {
    const container = certScrollRef.current;
    if (!container) return;
    const cardWidth = 270 + 16;
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
    currentYearFromCode ||
    currentStudent?.currentYear ||
    currentStudent?.currentSemester ||
    "-";
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

      const projectCode =
        currentStudent.projectCode || currentStudent.projectId || "";
      const projectYearTag = getCurrentYearFromProjectCode(projectCode);

      try {
        const email = String(
          currentStudent.email ||
            currentStudent.OFFICIAL_DETAILS?.EMAIL_ID ||
            "",
        ).trim();
        const studentId = String(
          currentStudent.id ||
            currentStudent.docId ||
            currentStudent.rollNo ||
            "",
        ).trim();

        const normalizedProjectCode = String(projectCode || "").trim();
        const filterByCurrentProject = (entry) => {
          if (!normalizedProjectCode) return true;
          return (
            String(entry?.projectCode || "").trim() === normalizedProjectCode
          );
        };

        const [byEmail, byId] = await Promise.all([
          email
            ? getEnrollmentsByStudentEmail(email).then((rows) =>
                rows.filter(filterByCurrentProject),
              )
            : [],
          studentId
            ? getEnrollmentsByStudentId(studentId).then((rows) =>
                rows.filter(filterByCurrentProject),
              )
            : [],
        ]);

        const mergedMap = new Map();
        [...byEmail, ...byId].forEach((entry) => {
          const certId = String(entry?.certificateId || "").trim();
          const pCode = String(entry?.projectCode || "").trim();
          if (!certId) return;
          const key = `${pCode}__${certId}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, entry);
          }
        });
        const merged = Array.from(mergedMap.values());
        if (merged.length > 0) {
          const uniqueCertificateIds = [
            ...new Set(
              merged
                .map((entry) => String(entry.certificateId || "").trim())
                .filter(Boolean),
            ),
          ];

          let linkedCertificates = [];
          try {
            linkedCertificates =
              await getCertificatesByIds(uniqueCertificateIds);
          } catch (certificateError) {
            console.warn(
              "Unable to fetch certificate metadata for email/id enrollments:",
              certificateError,
            );
          }

          let organizations = [];
          try {
            organizations = await getAllOrganizations();
          } catch (organizationError) {
            console.warn(
              "Unable to fetch organizations for email/id enrollments:",
              organizationError,
            );
          }

          const certificateById = new Map(
            (linkedCertificates || [])
              .filter((certificate) => certificate?.id)
              .map((certificate) => [certificate.id, certificate]),
          );

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

          const mapped = merged.map((entry, idx) => {
            const certificateId = String(entry.certificateId || "").trim();
            const certificateDoc = certificateById.get(certificateId) || {};
            const organizationName =
              entry.organizationName ||
              entry.domain ||
              certificateDoc.domain ||
              "";
            const organizationLogoUrl =
              getLogoFromCertificate(entry) ||
              organizationByName.get(
                String(organizationName || "")
                  .trim()
                  .toLowerCase(),
              )?.logoUrl ||
              "";

            return {
              id: certificateId || `enroll-${idx}`,
              name:
                entry.certificateName || certificateDoc.name || "Certificate",
              platform:
                entry.platform || certificateDoc.platform || "Certification",
              organizationName,
              organizationLogoUrl,
              level: entry.level || certificateDoc.level || "",
              status: normalizeCertificateStatus(entry.status || "enrolled"),
              semesterNumber: Number(entry.assignedSemesterNumber || 0) || null,
              yearTag:
                entry.yearTag ||
                getCurrentYearFromProjectCode(entry.projectCode) ||
                projectYearTag,
            };
          });
          setEnrolledCertificates(mapped);
          return;
        }
      } catch (err) {
        console.warn(
          "Email/id enrollment lookup failed, fallback to project lookup",
          err,
        );
      }

      try {
        const enrollmentsMap =
          await getStudentEnrollmentsByProject(projectCode);
        const enrollmentEntries = enrollmentsMap.get(
          String(currentStudent.id || currentStudent.docId || "").trim(),
        );

        if (enrollmentEntries && enrollmentEntries.length > 0) {
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
              semesterNumber: entry.assignedSemesterNumber || null,
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

  const certSemesterOptions = useMemo(() => {
    const semesters = new Set(
      enrolledCertificates
        .map((cert) => {
          const sem = cert?.semesterNumber;
          return Number.isFinite(Number(sem)) && sem !== null && sem !== undefined
            ? String(sem)
            : "";
        })
        .filter(Boolean),
    );

    const sorted = Array.from(semesters)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)
      .map((value) => String(value));

    return ["All Semesters", ...sorted];
  }, [enrolledCertificates]);

  const filteredCertificates = useMemo(() => {
    let filtered = enrolledCertificates;
    if (selectedYear !== "All Years") {
      filtered = filtered.filter(
        (cert) => String(cert.yearTag || "").trim() === selectedYear,
      );
    }

    if (selectedSemester !== "All Semesters") {
      filtered = filtered.filter(
        (cert) => String(cert.semesterNumber || "").trim() === selectedSemester,
      );
    }

    return filtered;
  }, [enrolledCertificates, selectedYear, selectedSemester]);

  const currentSemester = useMemo(
    () =>
      getHighestSemesterNumber(
        enrolledCertificates,
        currentStudent?.currentSemester || "-",
      ),
    [enrolledCertificates, currentStudent?.currentSemester],
  );

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

  const featuredIrpCertificate = useMemo(() => {
    return filteredCertificates.find((certificate) => {
      const searchable = [
        certificate?.name,
        certificate?.platform,
        certificate?.organizationName,
        certificate?.level,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return (
        searchable.includes("irp") ||
        searchable.includes("ga-irp") ||
        searchable.includes("ga-training")
      );
    });
  }, [filteredCertificates]);

  const visibleCertificates = useMemo(() => {
    if (!featuredIrpCertificate) return filteredCertificates;
    const featuredId = String(featuredIrpCertificate.id || "").trim();
    if (!featuredId) return filteredCertificates;
    return filteredCertificates.filter(
      (certificate) => String(certificate?.id || "").trim() !== featuredId,
    );
  }, [filteredCertificates, featuredIrpCertificate]);

  const firstLetter = String(fullName || "S").charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* -- HERO WELCOME BANNER -- */}
      <div
        style={{
          background: "linear-gradient(135deg, #0B2A4A 0%, #1a4a7a 50%, #0e3a63 100%)",
          borderRadius: "24px",
          padding: "28px 32px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 20px 60px -15px rgba(11,42,74,0.5)",
        }}
      >
        {/* decorative blobs */}
        <div style={{
          position: "absolute", top: "-40px", right: "-40px",
          width: "200px", height: "200px", borderRadius: "50%",
          background: "rgba(183,255,105,0.08)", pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: "-60px", left: "30%",
          width: "280px", height: "280px", borderRadius: "50%",
          background: "rgba(59,130,246,0.07)", pointerEvents: "none",
        }} />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            {/* Avatar */}
            <div style={{
              width: "56px", height: "56px", borderRadius: "16px",
              background: "linear-gradient(135deg, #B7FF69 0%, #7DE237 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "22px", fontWeight: "800", color: "#012920",
              boxShadow: "0 4px 16px rgba(183,255,105,0.35)",
              flexShrink: 0,
            }}>
              {firstLetter}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <Sparkles size={14} style={{ color: "#B7FF69" }} />
                <span style={{ fontSize: "12px", color: "rgba(183,255,105,0.85)", fontWeight: "600", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Welcome back
                </span>
              </div>
              <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#ffffff", margin: 0, lineHeight: 1.2 }}>
                {fullName}
              </h1>
              <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.55)", margin: "4px 0 0", fontWeight: "500" }}>
                Roll No: {rollNo}
              </p>
            </div>
          </div>

          {/* Year & Semester selectors */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "12px",
                color: "#fff",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: "600",
                outline: "none",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              {certYearOptions.map((year) => (
                <option key={year} value={year} style={{ backgroundColor: "#0B2A4A", color: "#fff" }}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "12px",
                color: "#fff",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: "600",
                outline: "none",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
              }}
            >
              {certSemesterOptions.map((semester) => (
                <option
                  key={semester}
                  value={semester}
                  style={{ backgroundColor: "#0B2A4A", color: "#fff" }}
                >
                  {semester}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* -- STATS ROW -- */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <StatPill
          icon={<BookOpen size={20} />}
          label="Enrolled"
          value={statusSummary.enrolled}
          color="#3B82F6"
          bg="linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)"
        />
        <StatPill
          icon={<CheckCircle2 size={20} />}
          label="Passed"
          value={statusSummary.passed}
          color="#22C55E"
          bg="linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)"
        />
        <StatPill
          icon={<XCircle size={20} />}
          label="Failed"
          value={statusSummary.failed}
          color="#EF4444"
          bg="linear-gradient(135deg, #FFF5F5 0%, #FEE2E2 100%)"
        />
        <StatPill
          icon={<GraduationCap size={20} />}
          label="Current Year"
          value={currentYear}
          color="#8B5CF6"
          bg="linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)"
        />
        <StatPill
          icon={<LayersIcon size={20} />}
          label="Current Semester"
          value={currentSemester}
          color="#F59E0B"
          bg="linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
        />
      </div>

      {/* -- MIDDLE ROW: Summary Chart -- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: featuredIrpCertificate ? "1fr auto" : "1fr",
          gap: "20px",
          alignItems: "stretch",
        }}
      >
        <SummaryCard
          enrolled={statusSummary.enrolled}
          passed={statusSummary.passed}
          failed={statusSummary.failed}
        />
        {featuredIrpCertificate && (
          <FeaturedCertificateCard certificate={featuredIrpCertificate} />
        )}
      </div>

      {/* -- CERTIFICATE CAROUSEL -- */}
      {(certLoading || visibleCertificates.length > 0) && (
      <div
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #F8FBFF 100%)",
          borderRadius: "24px",
          border: "1px solid #E2EAF5",
          padding: "24px",
          boxShadow: "0 8px 32px -12px rgba(11,42,74,0.15)",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "20px", fontWeight: "700", color: "#0B2A4A", margin: "0 0 8px" }}>
              Learning that drives results
            </h3>
            <p style={{ fontSize: "13px", color: "#64748B", margin: "0 0 16px", lineHeight: "1.5" }}>
              All certificates you are enrolled in and their completion status.
            </p>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              background: "#EAF2FF", borderRadius: "99px",
              padding: "6px 14px",
              fontSize: "13px", fontWeight: "600", color: "#0B4F9B",
              border: "1px solid rgba(29,95,168,0.2)",
            }}>
              <BookOpenCheck size={14} />
              {visibleCertificates.length} shown
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <button
              onClick={() => scrollCerts("prev")}
              disabled={certLoading || visibleCertificates.length === 0}
              style={{
                width: "40px", height: "40px", borderRadius: "50%",
                border: "1px solid #D1DCF0", background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#1D5FA8", flexShrink: 0,
                boxShadow: "0 2px 8px rgba(11,42,74,0.1)",
                opacity: (certLoading || visibleCertificates.length === 0) ? 0.35 : 1,
              }}
              aria-label="Previous certificate"
            >
              <ChevronLeft size={20} />
            </button>

            <div
              ref={certScrollRef}
              className="cert-carousel"
              style={{
                display: "flex", gap: "16px", overflowX: "auto",
                paddingBottom: "8px", flex: 1, minWidth: 0,
                scrollSnapType: "x mandatory", scrollbarWidth: "none",
              }}
            >
              {certLoading ? (
                <div style={{
                  minHeight: "200px", minWidth: "270px", flex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  borderRadius: "16px", border: "1px solid #E2EAF5",
                  background: "white", fontSize: "14px", color: "#64748B",
                }}>
                  Loading certificates…
                </div>
              ) : (
                visibleCertificates.map((certificate) => (
                  <CertificateCard key={certificate.id} certificate={certificate} />
                ))
              )}
            </div>

            <button
              onClick={() => scrollCerts("next")}
              disabled={certLoading || visibleCertificates.length === 0}
              style={{
                width: "40px", height: "40px", borderRadius: "50%",
                border: "1px solid #D1DCF0", background: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#1D5FA8", flexShrink: 0,
                boxShadow: "0 2px 8px rgba(11,42,74,0.1)",
                opacity: (certLoading || visibleCertificates.length === 0) ? 0.35 : 1,
              }}
              aria-label="Next certificate"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
      )}

      {/* -- PROFILE SNAPSHOT -- */}
      <div
        style={{
          background: "#ffffff",
          borderRadius: "24px",
          border: "1px solid #E2EAF5",
          padding: "24px",
          boxShadow: "0 8px 32px -12px rgba(11,42,74,0.12)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
          <div style={{
            width: "32px", height: "32px", borderRadius: "10px",
            background: "linear-gradient(135deg, #B7FF69 0%, #7DE237 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <User size={16} style={{ color: "#012920" }} />
          </div>
          <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0B2A4A", margin: 0 }}>
            Profile Snapshot
          </h2>
        </div>

        {/* Name banner */}
        <div style={{
          background: "linear-gradient(135deg, #0B2A4A 0%, #164B78 100%)",
          borderRadius: "16px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{
              width: "46px", height: "46px", borderRadius: "12px",
              background: "linear-gradient(135deg, #B7FF69 0%, #7DE237 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", fontWeight: "800", color: "#012920",
            }}>
              {firstLetter}
            </div>
            <div>
              <p style={{ fontSize: "17px", fontWeight: "700", color: "#fff", margin: 0 }}>{fullName}</p>
              <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", margin: "2px 0 0" }}>Roll No: {rollNo}</p>
            </div>
          </div>
          <div style={{
            background: "rgba(183,255,105,0.15)",
            border: "1px solid rgba(183,255,105,0.3)",
            borderRadius: "10px", padding: "8px 14px", textAlign: "center",
          }}>
            <p style={{ fontSize: "11px", color: "rgba(183,255,105,0.8)", margin: "0 0 2px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.06em" }}>Passing Year</p>
            <p style={{ fontSize: "18px", fontWeight: "800", color: "#B7FF69", margin: 0 }}>{passingYear}</p>
          </div>
        </div>

        {/* Detail grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
          <ProfileField icon={<User size={14} />} label="Gender" value={gender} />
          <ProfileField icon={<Calendar size={14} />} label="Date of Birth" value={dob} />
          <ProfileField icon={<Mail size={14} />} label="Email" value={email} />
          <ProfileField icon={<Phone size={14} />} label="Phone" value={phone} />
        </div>

        {/* Academic percentages */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <AcademicBadge
            label="10th Percentage"
            value={tenthPercentage !== "-" ? `${tenthPercentage}` : "-"}
            color="#3B82F6"
          />
          <AcademicBadge
            label="12th / Diploma Percentage"
            value={twelfthPercentage !== "-" ? `${twelfthPercentage}` : "-"}
            color="#8B5CF6"
          />
        </div>
      </div>
    </div>
  );
}

/* ----------- STAT PILL ----------- */
function StatPill({ icon, label, value, color, bg }) {
  return (
    <div style={{
      background: bg,
      borderRadius: "16px",
      border: `1px solid ${color}22`,
      padding: "16px 20px",
      display: "flex", alignItems: "center", gap: "14px",
      boxShadow: "0 4px 16px -6px rgba(0,0,0,0.07)",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 8px 24px -6px ${color}30`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px -6px rgba(0,0,0,0.07)"; }}
    >
      <div style={{
        width: "42px", height: "42px", borderRadius: "12px",
        background: `${color}18`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: "11px", fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>{label}</p>
        <p style={{ fontSize: "26px", fontWeight: "800", color: "#0B2A4A", margin: "2px 0 0", lineHeight: 1 }}>{value}</p>
      </div>
    </div>
  );
}

/* ----------- SUMMARY CARD ----------- */
function SummaryCard({ enrolled, passed, failed }) {
  const total = enrolled + passed + failed;
  const chartData = [
    { name: "Enrolled", value: Number(enrolled || 0), color: STATUS_COLORS.enrolled },
    { name: "Passed",   value: Number(passed || 0),   color: STATUS_COLORS.passed   },
    { name: "Failed",   value: Number(failed || 0),   color: STATUS_COLORS.failed   },
  ];
  const hasData = chartData.some((item) => item.value > 0);

  return (
    <div style={{
      background: "linear-gradient(135deg, #ffffff 0%, #F8FBFF 100%)",
      borderRadius: "24px",
      border: "1px solid #E2EAF5",
      padding: "24px",
      boxShadow: "0 8px 32px -12px rgba(11,42,74,0.15)",
      position: "relative", overflow: "hidden",
    }}>
      {/* BG blob */}
      <div style={{
        position: "absolute", top: "-40px", left: "-40px",
        width: "160px", height: "160px", borderRadius: "50%",
        background: "rgba(59,130,246,0.06)", pointerEvents: "none",
      }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", position: "relative" }}>
        <div>
          <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>Certificate Summary</p>
          <p style={{ fontSize: "13px", color: "#94A3B8", margin: "4px 0 0" }}>Total: <strong style={{ color: "#0B2A4A" }}>{total}</strong></p>
        </div>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: "#EFF6FF", display: "flex", alignItems: "center",
          justifyContent: "center", color: "#3B82F6",
        }}>
          <Award size={18} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", alignItems: "center" }}>
        {/* Donut */}
        <div style={{ position: "relative", width: "200px", height: "200px", margin: "0 auto" }}>
          <PieChart width={200} height={200}>
            <Pie
              data={hasData ? chartData : [{ name: "empty", value: 1, color: "#E2E8F0" }]}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={hasData ? 3 : 0}
              startAngle={90}
              endAngle={-270}
            >
              {(hasData ? chartData : [{ name: "empty", value: 1, color: "#E2E8F0" }]).map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            {hasData && <Tooltip formatter={(value) => [value, "Count"]} />}
          </PieChart>
          {/* Center label */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}>
            <span style={{ fontSize: "28px", fontWeight: "800", color: "#0B2A4A", lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "600" }}>total</span>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {chartData.map((item) => (
            <div key={item.name} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: `${item.color}0D`,
              borderRadius: "12px",
              border: `1px solid ${item.color}22`,
              padding: "10px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "10px", height: "10px", borderRadius: "50%",
                  background: item.color, flexShrink: 0,
                }} />
                <span style={{ fontSize: "13px", color: "#475569", fontWeight: "500" }}>{item.name}</span>
              </div>
              <span style={{ fontSize: "18px", fontWeight: "800", color: "#0B2A4A" }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeaturedCertificateCard({ certificate }) {
  const statusLabel = normalizeCertificateStatus(certificate?.status || "enrolled");
  const logoUrl = getOptimizedLogoUrl(getLogoFromCertificate(certificate));

  const statusStyle =
    statusLabel === "passed"
      ? { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" }
      : statusLabel === "failed"
      ? { bg: "#FFF5F5", color: "#DC2626", border: "#FECACA" }
      : { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ffffff 0%, #F8FBFF 100%)",
        borderRadius: "24px",
        border: "1px solid #E2EAF5",
        padding: "18px",
        boxShadow: "0 8px 32px -12px rgba(11,42,74,0.15)",
        width: "260px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: "700",
          color: "#64748B",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: 0,
        }}
      >
        Featured Certificate
      </p>

      <div
        style={{
          borderRadius: "12px",
          border: "1px solid #E2EAF5",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "74px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "10px",
            background: "linear-gradient(180deg, #F8FBFF 0%, #fff 100%)",
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${certificate?.organizationName || "Organisation"} logo`}
              style={{ height: "100%", width: "100%", objectFit: "contain" }}
            />
          ) : (
            <Award size={24} style={{ color: "#94A3B8" }} />
          )}
        </div>
      </div>

      <p
        style={{
          fontSize: "14px",
          fontWeight: "700",
          color: "#0B2A4A",
          margin: 0,
          lineHeight: 1.3,
        }}
      >
        {certificate?.name || "Certificate"}
      </p>
      <p style={{ fontSize: "12px", color: "#64748B", margin: 0 }}>
        {certificate?.platform || "Certification"}
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            background: statusStyle.bg,
            color: statusStyle.color,
            border: `1px solid ${statusStyle.border}`,
            borderRadius: "99px",
            padding: "4px 10px",
            textTransform: "capitalize",
          }}
        >
          {statusLabel}
        </span>
        {certificate?.semesterNumber ? (
          <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "500" }}>
            Sem {certificate.semesterNumber}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ----------- PROFILE FIELD ----------- */
function ProfileField({ icon, label, value }) {
  return (
    <div style={{
      background: "#FAFBFF",
      borderRadius: "14px",
      border: "1px solid #E8EEF8",
      padding: "12px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
        <span style={{ color: "#94A3B8" }}>{icon}</span>
        <p style={{ fontSize: "10px", fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{label}</p>
      </div>
      <p style={{ fontSize: "15px", fontWeight: "600", color: "#0B2A4A", margin: 0, wordBreak: "break-word" }}>{value || "-"}</p>
    </div>
  );
}

/* ----------- ACADEMIC BADGE ----------- */
function AcademicBadge({ label, value, color }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}08 0%, ${color}14 100%)`,
      borderRadius: "16px",
      border: `1px solid ${color}22`,
      padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <p style={{ fontSize: "11px", fontWeight: "700", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: "28px", fontWeight: "800", color, margin: 0, lineHeight: 1 }}>{value}</p>
    </div>
  );
}

/* ----------- CERTIFICATE CARD ----------- */
function CertificateCard({ certificate }) {
  const logoUrl = getOptimizedLogoUrl(getLogoFromCertificate(certificate));
  const statusLabel = normalizeCertificateStatus(certificate.status || "enrolled");

  const statusStyle =
    statusLabel === "passed"
      ? { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" }
      : statusLabel === "failed"
      ? { bg: "#FFF5F5", color: "#DC2626", border: "#FECACA" }
      : { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };

  return (
    <article
      style={{
        minWidth: "240px", maxWidth: "280px", flex: "0 0 auto",
        background: "#ffffff",
        borderRadius: "18px",
        border: "1px solid #E2EAF5",
        boxShadow: "0 4px 20px -8px rgba(11,42,74,0.2)",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
        scrollSnapAlign: "start",
        cursor: "pointer",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 16px 36px -10px rgba(11,42,74,0.28)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "";
        e.currentTarget.style.boxShadow = "0 4px 20px -8px rgba(11,42,74,0.2)";
      }}
    >
      {/* Logo area */}
      <div style={{
        height: "110px", background: "linear-gradient(180deg, #F8FBFF 0%, #EEF5FF 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "12px",
      }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={`${certificate.organizationName || "Organisation"} logo`}
            style={{ height: "100%", width: "100%", objectFit: "contain" }}
          />
        ) : (
          <div style={{
            height: "70px", width: "100%",
            background: "linear-gradient(135deg, #0B2A4A 0%, #164B78 100%)",
            borderRadius: "12px",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Award size={28} style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "16px" }}>
        <p style={{ fontSize: "10px", fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>
          {certificate.platform}
        </p>
        <h4 style={{ fontSize: "15px", fontWeight: "700", color: "#0B2A4A", margin: "0 0 4px", lineHeight: "1.3" }}>
          {certificate.name}
        </h4>
        {certificate.level && (
          <p style={{ fontSize: "12px", color: "#64748B", margin: "0 0 12px" }}>{certificate.level}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize: "11px", fontWeight: "700",
            background: statusStyle.bg,
            color: statusStyle.color,
            border: `1px solid ${statusStyle.border}`,
            borderRadius: "99px",
            padding: "4px 10px",
            textTransform: "capitalize",
          }}>
            {statusLabel}
          </span>
          {certificate.semesterNumber && (
            <span style={{ fontSize: "11px", color: "#94A3B8", fontWeight: "500" }}>
              Sem {certificate.semesterNumber}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

