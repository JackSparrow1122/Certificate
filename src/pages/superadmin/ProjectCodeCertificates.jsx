import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { getProjectCodeById } from "../../../services/projectCodeService";
import { getCertificatesForProjectCode } from "../../../services/certificateService";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { ExcelStudentImport } from "../../components/superadmin/ExcelStudentImport";
import AddStudentModal from "../../components/superadmin/AddStudentModal";

export default function ProjectCodeCertificates() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [projectCode, setProjectCode] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [semesterFilter, setSemesterFilter] = useState("all");

  useEffect(() => {
    fetchData();
  }, [projectId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const projectData = await getProjectCodeById(projectId);
      if (!projectData) {
        setError("Project code not found");
        return;
      }
      setProjectCode(projectData);

      try {
        const enrolledCerts = await getCertificatesForProjectCode(
          projectData.code,
        );
        setCertificates(enrolledCerts);
      } catch (certErr) {
        console.error("Certificate fetch error:", certErr);
        // Gracefully handle — page still loads, user can assign certificates
        setCertificates([]);
      }
    } catch (err) {
      setError("Failed to load data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openStudentList = (certificateId) => {
    navigate(`/superadmin/project-codes/${projectId}/students`, {
      state: {
        certificateId,
        projectCode: projectCode?.code || "",
      },
    });
  };

  const filteredCertificates = useMemo(() => {
    if (semesterFilter === "odd") {
      return certificates.filter(
        (certificate) => Number(certificate?.oddEnrolledCount || 0) > 0,
      );
    }
    if (semesterFilter === "even") {
      return certificates.filter(
        (certificate) => Number(certificate?.evenEnrolledCount || 0) > 0,
      );
    }
    return certificates;
  }, [certificates, semesterFilter]);

  if (loading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="text-gray-500">Loading...</div>
        </div>
      </SuperAdminLayout>
    );
  }

  if (error) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center p-8">
          <div className="text-red-500">{error}</div>
        </div>
      </SuperAdminLayout>
    );
  }

  return (
    <SuperAdminLayout>
      <div className="px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
        <div className="w-full space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/superadmin/colleges/${projectCode?.collegeId || ""}/project-codes`,
                  )
                }
                className="mb-2 rounded-lg bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white"
              >
                ← Back to Project Codes
              </button>
              <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
                {projectCode?.code || projectId}
              </h1>
              <h2 className="text-2xl font-semibold leading-tight text-[#0B2A4A] sm:text-3xl">
                Enrolled Certificates
              </h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate(`/superadmin/project-codes/${projectId}/students`, {
                    state: { projectCode: projectCode?.code || "" },
                  })
                }
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A]"
              >
                View All Students
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A]"
              >
                + Bulk Add Students
              </button>
              <button
                type="button"
                onClick={() => setShowAddStudentModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A]"
              >
                + Add Student
              </button>
            </div>
          </div>

          {/* Bulk Import Section (collapsible) */}
          {showImportModal && (
            <section className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-[#0B2A4A]">
                  Bulk Add Students (Excel/CSV Import)
                </h3>
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg p-1.5 text-[#415a77] transition-colors"
                >
                  ✕
                </button>
              </div>
              <ExcelStudentImport
                projectCode={projectCode?.code || ""}
                onStudentAdded={() => fetchData()}
              />
            </section>
          )}

          {/* Table Header */}
          <section className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#0B2A4A]">
                Filter by Semester
              </p>
              <div className="inline-flex rounded-lg border border-[#CBD8EA] bg-white p-1">
                <button
                  type="button"
                  onClick={() => setSemesterFilter("all")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    semesterFilter === "all"
                      ? "bg-[#0B2A4A] text-white"
                      : "text-[#0B2A4A]"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterFilter("odd")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    semesterFilter === "odd"
                      ? "bg-[#0B2A4A] text-white"
                      : "text-[#0B2A4A]"
                  }`}
                >
                  Odd
                </button>
                <button
                  type="button"
                  onClick={() => setSemesterFilter("even")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    semesterFilter === "even"
                      ? "bg-[#0B2A4A] text-white"
                      : "text-[#0B2A4A]"
                  }`}
                >
                  Even
                </button>
              </div>
            </div>

            <div className="mb-2 grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-3 px-3 text-sm font-semibold text-[#0B2A4A]">
              <p>Certificate Name</p>
              <p>Exam Code</p>
              <p>Domain</p>
              <p className="text-right">Enrolled</p>
            </div>

            <div className="space-y-2.5">
              {filteredCertificates.map((cert) => (
                <div
                  key={cert.id}
                  onClick={() => openStudentList(cert.id)}
                  className="grid w-full cursor-pointer grid-cols-[2fr_1.5fr_1fr_1fr] items-center gap-3 rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition"
                >
                  <p className="truncate font-medium">{cert.name || "-"}</p>
                  <p>{cert.examCode || "-"}</p>
                  <p>{cert.platform || "-"}</p>
                  <p className="text-right">
                    {cert.enrolledInProject ?? 0} students
                  </p>
                </div>
              ))}
            </div>

            {filteredCertificates.length === 0 && (
              <div className="rounded-xl border border-[#D7E2F1] bg-white px-5 py-8 text-center text-sm text-gray-600">
                {semesterFilter === "all"
                  ? "No certificates enrolled for this project code yet."
                  : `No certificates found for ${semesterFilter} semester.`}
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddStudentModal && (
        <AddStudentModal
          projectCode={projectCode?.code || projectId}
          onClose={() => setShowAddStudentModal(false)}
          onStudentAdded={fetchData}
        />
      )}
    </SuperAdminLayout>
  );
}
