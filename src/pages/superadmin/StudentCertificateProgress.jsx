import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import {
  getStudentByDocId,
  getStudentByProjectAndId,
} from "../../../services/studentService";
import {
  getCertificatesByIds,
  getStudentCertificateHistory,
} from "../../../services/certificateService";

const toCanonicalKey = (label) =>
  String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[%._-]/g, " ")
    .replace(/\s+/g, " ");

const getUniqueEntries = (entries, seenKeys) => {
  const result = [];
  entries.forEach(([label, value]) => {
    if (String(value ?? "").trim() === "") return;
    const canonicalKey = toCanonicalKey(label);
    if (seenKeys.has(canonicalKey)) return;
    seenKeys.add(canonicalKey);
    result.push([label, value]);
  });
  return result;
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

export default function StudentCertificateProgress() {
  const location = useLocation();
  const navigate = useNavigate();
  const { studentDocId } = useParams();

  const [student, setStudent] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [certificateWarning, setCertificateWarning] = useState("");

  const fetchStudentData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setCertificateWarning("");

      const projectCodeFromState = String(
        location.state?.projectCode || "",
      ).trim();
      let studentData = null;

      if (projectCodeFromState && studentDocId) {
        studentData = await getStudentByProjectAndId(
          projectCodeFromState,
          studentDocId,
        );
      }

      if (!studentData) {
        studentData = await getStudentByDocId(studentDocId);
      }

      if (!studentData) {
        setError("Student not found");
        return;
      }

      setStudent(studentData);

      // Use UID-based multi-year certificate history if available,
      // otherwise fall back to legacy certificateIds array.
      const uid = studentData.uid || "";
      if (uid) {
        try {
          const enrollments = await getStudentCertificateHistory(uid);
          // enrollments = [{certificateId, certificateName, status, projectCode, ...}]
          setCertificates(
            enrollments.map((e) => ({
              id: e.certificateId || e.id,
              name: e.certificateName || "",
              examCode: e.examCode || "",
              platform: e.platform || "",
              status: e.status || "enrolled",
              projectCode: e.projectCode || "",
              enrolledAt: e.enrolledAt,
            })),
          );
        } catch (certErr) {
          console.error("Failed to load certificate history:", certErr);
          setCertificates([]);
          setCertificateWarning(
            "Student profile loaded, but certificate history could not be loaded.",
          );
        }
      } else {
        // Legacy fallback — use certificateIds if present
        const certificateIds = Array.isArray(studentData.certificateIds)
          ? studentData.certificateIds
          : [];
        if (certificateIds.length === 0) {
          setCertificates([]);
        } else {
          try {
            const enrolledCertificates =
              await getCertificatesByIds(certificateIds);
            setCertificates(
              enrolledCertificates.map((c) => ({
                ...c,
                status: "enrolled",
              })),
            );
          } catch (certificateError) {
            console.error(
              "Failed to load certificates for student:",
              certificateError,
            );
            setCertificates([]);
            setCertificateWarning(
              "Student profile loaded, but certificate details could not be loaded.",
            );
          }
        }
      }
    } catch (fetchError) {
      setError("Failed to load student certificate progress");
      console.error(fetchError);
    } finally {
      setLoading(false);
    }
  }, [studentDocId, location.state]);

  useEffect(() => {
    fetchStudentData();
  }, [fetchStudentData]);

  return (
    <SuperAdminLayout>
      <div className="px-5 py-8 lg:px-6">
        <div className="w-full space-y-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
          >
            ← Back to Students
          </button>

          {loading && <div className="text-gray-600">Loading...</div>}
          {!loading && error && <div className="text-red-600">{error}</div>}
          {!loading && !error && certificateWarning && (
            <div className="text-yellow-700">{certificateWarning}</div>
          )}

          {!loading && !error && student && (
            <>
              <section className="superadmin-navbar-card rounded-3xl border border-[#D6E1EE] bg-white p-6">
                <h1 className="text-3xl font-semibold text-[#0B2A4A]">
                  Student Profile
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  Complete academic and personal details for this student.
                </p>
              </section>

              {(() => {
                const officialDetails = student?.OFFICIAL_DETAILS || {};
                const tenthDetails = student?.TENTH_DETAILS || {};
                const twelfthDetails = student?.TWELFTH_DETAILS || {};
                const diplomaDetails = student?.DIPLOMA_DETAILS || {};
                const graduationDetails = student?.GRADUATION_DETAILS || {};
                const postGraduationDetails =
                  student?.POST_GRADUATION_DETAILS || {};

                const fullName =
                  officialDetails["FULL NAME OF STUDENT"] ||
                  student?.name ||
                  "-";
                const rollNo = officialDetails.SN || student?.id || "-";
                const gender = officialDetails.GENDER || student?.gender || "-";
                const dob =
                  officialDetails["BIRTH DATE"] || student?.dob || "-";

                const email =
                  officialDetails["EMAIL_ID"] || student?.email || "-";
                const phone =
                  officialDetails["MOBILE NO."] || student?.phone || "-";
                const hometown = officialDetails.HOMETOWN || "-";
                const passingYear =
                  graduationDetails["GRADUATION PASSING YR"] ||
                  student?.passingYear ||
                  student?.admissionYear ||
                  "-";
                const structuredProjectCode =
                  student?.projectCode ||
                  student?.projectId ||
                  location.state?.projectCode ||
                  "";
                const currentYearFromCode = getCurrentYearFromProjectCode(
                  structuredProjectCode,
                );
                const currentYear =
                  currentYearFromCode ||
                  student?.currentYear ||
                  student?.currentSemester ||
                  student?.semesterLabel ||
                  "-";

                const seenKeys = new Set(
                  [
                    "STUDENT NAME",
                    "ROLL NO",
                    "GENDER",
                    "DATE OF BIRTH",
                    "EMAIL",
                    "PHONE",
                    "PASSING YEAR",
                    "CURRENT YEAR",
                  ].map(toCanonicalKey),
                );

                const filteredTenthEntries = getUniqueEntries(
                  Object.entries(tenthDetails),
                  seenKeys,
                );
                const filteredTwelfthEntries = getUniqueEntries(
                  Object.entries(twelfthDetails),
                  seenKeys,
                );
                const filteredDiplomaEntries = getUniqueEntries(
                  Object.entries(diplomaDetails),
                  seenKeys,
                );
                const filteredGraduationEntries = getUniqueEntries(
                  Object.entries(graduationDetails),
                  seenKeys,
                );
                const filteredPostGraduationEntries = getUniqueEntries(
                  Object.entries(postGraduationDetails),
                  seenKeys,
                );

                return (
                  <>
                    <section className="rounded-2xl border border-[#D6E1EE] bg-white p-5 shadow-sm">
                      <h2 className="mb-4 text-xl font-semibold text-[#0B2A4A]">
                        Basic Information
                      </h2>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <ProfileItem label="Student Name" value={fullName} />
                        <ProfileItem label="Roll No" value={rollNo} />
                        <ProfileItem label="Gender" value={gender} />
                        <ProfileItem label="Date of Birth" value={dob} />
                        <ProfileItem label="Current Year" value={currentYear} />
                        <ProfileItem label="Passing Year" value={passingYear} />
                      </div>
                    </section>

                    <section className="rounded-2xl border border-[#D6E1EE] bg-white p-5 shadow-sm">
                      <h2 className="mb-4 text-xl font-semibold text-[#0B2A4A]">
                        Contact Details
                      </h2>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <ProfileItem label="Email" value={email} />
                        <ProfileItem label="Phone" value={phone} />
                        <ProfileItem label="Hometown" value={hometown} />
                      </div>
                    </section>

                    <DetailsSection
                      title="10th Details"
                      entries={filteredTenthEntries}
                    />
                    <DetailsSection
                      title="12th Details"
                      entries={filteredTwelfthEntries}
                    />
                    <DetailsSection
                      title="Diploma Details"
                      entries={filteredDiplomaEntries}
                    />
                    <DetailsSection
                      title="Graduation Details"
                      entries={filteredGraduationEntries}
                    />
                    <DetailsSection
                      title="Post Graduation Details"
                      entries={filteredPostGraduationEntries}
                    />
                  </>
                );
              })()}

              <section className="rounded-2xl border border-[#D6E1EE] bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-xl font-semibold text-[#0B2A4A]">
                  Enrolled Certificates
                </h2>

                {certificates.length === 0 ? (
                  <p className="rounded-xl border border-[#D7E2F1] bg-[#EEF3FA] px-4 py-6 text-center text-gray-600">
                    Student is not enrolled in any certificate.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {certificates.map((certificate) => {
                      const status = certificate.status || "enrolled";

                      return (
                        <div
                          key={certificate.id}
                          className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] gap-4 rounded-xl border border-[#D7E2F1] bg-[#EEF3FA] px-4 py-3"
                        >
                          <p className="font-medium text-gray-900">
                            {certificate.name || "-"}
                          </p>
                          <p className="text-gray-800">
                            {certificate.platform ||
                              certificate.examCode ||
                              "-"}
                          </p>
                          <p className="text-gray-800 capitalize">{status}</p>
                          <p className="text-gray-800">
                            {certificate.projectCode || "-"}
                          </p>
                          <p className="text-gray-800">
                            {certificate.examCode || "-"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}

function ProfileItem({ label, value }) {
  return (
    <div className="rounded-xl border border-[#D7E2F1] bg-[#EEF3FA] p-4 shadow-sm transition hover:border-[#BCD0E7]">
      <p className="text-xs uppercase tracking-wide text-[#0B2A4A]/60">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[#0B2A4A]">
        {value || "-"}
      </p>
    </div>
  );
}

function DetailsSection({ title, entries }) {
  const filteredEntries = entries.filter(
    ([, value]) => String(value ?? "").trim() !== "",
  );

  if (filteredEntries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[#D6E1EE] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-[#0B2A4A]">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredEntries.map(([label, value]) => (
          <ProfileItem key={`${title}-${label}`} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}
