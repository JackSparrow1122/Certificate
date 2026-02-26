import { useEffect, useMemo, useState, useRef } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { Pencil } from "lucide-react";
import AddCertificateModal from "../../components/superadmin/AddCertificateModal";
import AddOrganizationModal from "../../components/superadmin/AddOrganizationModal";
import EnrollProjectCodeModal from "../../components/superadmin/EnrollProjectCodeModal";
import DeclareResultModal from "../../components/superadmin/DeclareResultModal";
import {
  getAllCertificates,
  getCertificateEnrollmentCounts,
  softDeleteCertificate,
} from "../../../services/certificateService";
import { getAllProjectCodesFromStudents } from "../../../services/studentService";
import { getAllOrganizations } from "../../../services/organizationService";

export default function CertificateConfig() {
  const [certifications, setCertifications] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingCounts, setRefreshingCounts] = useState(false);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState(null);
  const [showAddOrganizationModal, setShowAddOrganizationModal] =
    useState(false);
  const [showEditOrganizationModal, setShowEditOrganizationModal] =
    useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [showDeclareResultModal, setShowDeclareResultModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [deletingCertificateId, setDeletingCertificateId] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const [filters, setFilters] = useState({
    platform: "All",
    level: "All",
    domain: "All",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      const [certificateData, projectCodeData, organizationData] =
        await Promise.all([
          getAllCertificates(),
          getAllProjectCodesFromStudents(),
          getAllOrganizations(),
        ]);

      setCertifications(certificateData || []);
      console.log("Project codes loaded:", projectCodeData);
      setProjectCodes(projectCodeData || []);
      setOrganizations(organizationData || []);
    } catch (fetchError) {
      setError("Failed to load certificate data");
      console.error("Fetch error:", fetchError);
    } finally {
      setLoading(false);
    }
  };

  const platforms = [
    "All",
    ...new Set(
      (organizations || [])
        .map((organization) => organization?.name)
        .filter(Boolean),
    ),
  ];
  const levels = [
    "All",
    ...new Set(certifications.map((c) => c.level).filter(Boolean)),
  ];
  const domains = [
    "All",
    ...new Set(certifications.map((c) => c.platform).filter(Boolean)),
  ];

  const filteredCertifications = useMemo(() => {
    return certifications.filter((c) => {
      return (
        (filters.platform === "All" || c.domain === filters.platform) &&
        (filters.level === "All" || c.level === filters.level) &&
        (filters.domain === "All" || c.platform === filters.domain)
      );
    });
  }, [certifications, filters]);

  const organizationByName = useMemo(() => {
    const map = new Map();
    (organizations || []).forEach((organization) => {
      const key = String(organization?.name || "")
        .trim()
        .toLowerCase();
      if (key) {
        map.set(key, organization);
      }
    });
    return map;
  }, [organizations]);

  const resetFilters = () =>
    setFilters({ platform: "All", level: "All", domain: "All" });

  const handleCertificateAdded = async () => {
    await fetchData();
    setSuccessMessage(
      "Certificate created. Click the certificate row to assign project codes.",
    );
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleEnrolled = async () => {
    await fetchData();
    setSuccessMessage("Project code enrolled. Matching students were updated.");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleOrganizationAdded = async () => {
    await fetchData();
    setSuccessMessage("Organisation created successfully.");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleOrganizationUpdated = async () => {
    await fetchData();
    setSuccessMessage("Organisation updated successfully.");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleCertificateUpdated = async () => {
    await fetchData();
    setSuccessMessage("Certificate updated successfully.");
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  const handleSoftDeleteCertificate = async (certificate) => {
    const confirmed = window.confirm(
      `Soft delete certificate \"${certificate?.name || ""}\"?`,
    );
    if (!confirmed) return;

    try {
      setDeletingCertificateId(certificate?.id || "");
      setOpenMenuId(null);

      const result = await softDeleteCertificate({
        certificateId: certificate.id,
      });

      await fetchData();

      const affectedCount = Number(result?.affectedStudents || 0);
      setSuccessMessage(
        `Certificate soft deleted. Updated isDeleted=true for ${affectedCount} student records.`,
      );
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (deleteError) {
      setError("Failed to soft delete certificate");
      console.error("Soft delete error:", deleteError);
    } finally {
      setDeletingCertificateId("");
    }
  };

  const handleRefreshEnrolledCounts = async () => {
    try {
      setRefreshingCounts(true);
      setError("");

      const certificateIds = certifications
        .map((certificate) => certificate?.id)
        .filter(Boolean);

      if (certificateIds.length === 0) {
        return;
      }

      const liveEnrollmentCounts =
        await getCertificateEnrollmentCounts(certificateIds);

      setCertifications((prev) =>
        prev.map((certificate) => ({
          ...certificate,
          enrolledCount: Number(liveEnrollmentCounts?.[certificate.id] ?? 0),
        })),
      );

      setSuccessMessage("Enrolled counts refreshed from live student data.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (refreshError) {
      setError("Failed to refresh enrolled counts");
      console.error("Refresh counts error:", refreshError);
    } finally {
      setRefreshingCounts(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="space-y-6 p-2 sm:p-2 md:p-3 lg:p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Certifications Configuration
          </h1>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshEnrolledCounts}
              disabled={
                loading || refreshingCounts || certifications.length === 0
              }
              className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded-lg text-sm disabled:opacity-60"
            >
              {refreshingCounts
                ? "Refreshing counts..."
                : "Refresh Enrolled Counts"}
            </button>
            <button
              onClick={() => setShowAddOrganizationModal(true)}
              className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded-lg text-sm"
            >
              + Add New Organisation
            </button>
            <button
              onClick={() => setShowEditOrganizationModal(true)}
              className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded-lg text-sm"
            >
              ✏️ Edit Organisation
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded-lg text-sm"
            >
              + Add New Certificate
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-300 rounded-2xl p-6 flex items-end gap-6">
          {/* Organisation */}
          <div className="flex-1">
            <label className="text-sm font-medium">Organisation</label>
            <select
              value={filters.platform}
              onChange={(e) =>
                setFilters({ ...filters, platform: e.target.value })
              }
              className="w-full mt-1 h-9 rounded bg-white px-3"
            >
              {platforms.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Level */}
          <div className="flex-1">
            <label className="text-sm font-medium">Level</label>
            <select
              value={filters.level}
              onChange={(e) =>
                setFilters({ ...filters, level: e.target.value })
              }
              className="w-full mt-1 h-9 rounded bg-white px-3"
            >
              {levels.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>

          {/* Domain */}
          <div className="flex-1">
            <label className="text-sm font-medium">Domain</label>
            <select
              value={filters.domain}
              onChange={(e) =>
                setFilters({ ...filters, domain: e.target.value })
              }
              className="w-full mt-1 h-9 rounded bg-white px-3"
            >
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <button
            onClick={resetFilters}
            className="bg-[#0B2A4A] text-white px-5 py-2 rounded-lg"
          >
            Reset
          </button>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-6 text-sm font-semibold px-6">
          <span>Organisation</span>
          <span>Certificate Name</span>
          <span>Domain</span>
          <span>Exam Code</span>
          <span>Level</span>
          <span className="text-right">Enrolled</span>
        </div>

        {/* Table Body */}
        <div className="bg-gray-300 rounded-2xl p-6 space-y-4">
          {loading && (
            <p className="text-center text-gray-600">
              Loading certifications...
            </p>
          )}
          {filteredCertifications.length === 0 && (
            <p className="text-center text-gray-600">No certifications found</p>
          )}

          {filteredCertifications.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 relative"
            >
              <div className="grid grid-cols-6 w-full text-sm">
                <span className="flex items-center gap-2">
                  {organizationByName.get(
                    String(c.domain || "")
                      .trim()
                      .toLowerCase(),
                  )?.logoUrl ? (
                    <img
                      src={
                        organizationByName.get(
                          String(c.domain || "")
                            .trim()
                            .toLowerCase(),
                        )?.logoUrl
                      }
                      alt={`${c.domain || "Organisation"} logo`}
                      className="h-6 w-6 rounded object-contain bg-gray-50 border"
                    />
                  ) : null}
                  <span>{c.domain}</span>
                </span>
                <span>{c.name}</span>
                <span>{c.platform}</span>
                <span>{c.examCode}</span>
                <span>{c.level}</span>
                <span className="text-right">
                  {c.enrolledCount ?? 0} students
                </span>
              </div>

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedCertificate(c);
                  setOpenMenuId(openMenuId === c.id ? null : c.id);
                }}
                className="ml-4 text-gray-600 hover:text-black"
                title="Manage certificate"
              >
                <Pencil size={16} />
              </button>
              {openMenuId === c.id && (
                <div className="absolute right-12 mt-1 w-48 bg-white rounded-xl shadow-lg border z-20">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingCertificate(c);
                      setShowAddModal(true);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 border-b"
                  >
                    ✏️ Edit Certificate
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCertificate(c);
                      setShowDeclareResultModal(true);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-blue-50 border-b"
                  >
                    📋 Declare Result
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCertificate(c);
                      setShowEnrollModal(true);
                      setOpenMenuId(null);
                    }}
                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100 border-b"
                  >
                    🏆 Enroll Project Code
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleSoftDeleteCertificate(c);
                    }}
                    disabled={deletingCertificateId === c.id}
                    className="w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {deletingCertificateId === c.id
                      ? "Deleting..."
                      : "🗑️ Soft Delete"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddCertificateModal
          onClose={() => {
            setShowAddModal(false);
            setEditingCertificate(null);
          }}
          onCertificateAdded={handleCertificateAdded}
          onCertificateUpdated={() => {
            setShowAddModal(false);
            setEditingCertificate(null);
            handleCertificateUpdated();
          }}
          initialCertificate={editingCertificate}
          organizations={organizations}
        />
      )}

      {showAddOrganizationModal && (
        <AddOrganizationModal
          onClose={() => setShowAddOrganizationModal(false)}
          onOrganizationAdded={() => {
            setShowAddOrganizationModal(false);
            handleOrganizationAdded();
          }}
        />
      )}

      {showEditOrganizationModal && (
        <AddOrganizationModal
          mode="edit"
          organizations={organizations}
          onClose={() => setShowEditOrganizationModal(false)}
          onOrganizationUpdated={() => {
            setShowEditOrganizationModal(false);
            handleOrganizationUpdated();
          }}
        />
      )}

      {showEnrollModal && selectedCertificate && (
        <EnrollProjectCodeModal
          certificate={selectedCertificate}
          projectCodes={projectCodes}
          onClose={() => {
            setShowEnrollModal(false);
            setSelectedCertificate(null);
          }}
          onEnrolled={() => {
            handleEnrolled();
          }}
        />
      )}

      {showDeclareResultModal && selectedCertificate && (
        <DeclareResultModal
          certificate={selectedCertificate}
          onClose={() => {
            setShowDeclareResultModal(false);
            setSelectedCertificate(null);
          }}
          onResultDeclared={() => {
            setShowDeclareResultModal(false);
            setSelectedCertificate(null);
            fetchData();
          }}
        />
      )}
    </SuperAdminLayout>
  );
}
