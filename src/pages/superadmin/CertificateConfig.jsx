import { useEffect, useMemo, useState, useRef } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { Pencil } from "lucide-react";
import AddCertificateModal from "../../components/superadmin/AddCertificateModal";
import AddOrganizationModal from "../../components/superadmin/AddOrganizationModal";
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

  const [deletingCertificateId, setDeletingCertificateId] = useState("");
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      <div className="px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
        <div className="w-full space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
              Certifications Configuration
            </h1>

            <div className="flex flex-nowrap items-center gap-1.5">
              <button
                onClick={handleRefreshEnrolledCounts}
                disabled={
                  loading || refreshingCounts || certifications.length === 0
                }
                className="whitespace-nowrap rounded-lg bg-[#DCE5F1] px-3 py-2 text-xs font-semibold text-[#0B2A4A] disabled:opacity-60"
              >
                {refreshingCounts
                  ? "Refreshing counts..."
                  : "Refresh Enrolled Counts"}
              </button>
              <button
                onClick={() => setShowAddOrganizationModal(true)}
                className="whitespace-nowrap rounded-lg bg-[#DCE5F1] px-3 py-2 text-xs font-semibold text-[#0B2A4A]"
              >
                + Add New Organisation
              </button>
              <button
                onClick={() => setShowEditOrganizationModal(true)}
                className="whitespace-nowrap rounded-lg bg-[#DCE5F1] px-3 py-2 text-xs font-semibold text-[#0B2A4A]"
              >
                ✏️ Edit Organisation
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="whitespace-nowrap rounded-lg bg-[#DCE5F1] px-3 py-2 text-xs font-semibold text-[#0B2A4A]"
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
          <div className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-4">
              {/* Organisation */}
              <div className="w-full min-w-45 flex-1">
                <label className="text-sm font-medium text-[#0B2A4A]">
                  Organisation
                </label>
                <select
                  value={filters.platform}
                  onChange={(e) =>
                    setFilters({ ...filters, platform: e.target.value })
                  }
                  className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                >
                  {platforms.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Level */}
              <div className="w-full min-w-45 flex-1">
                <label className="text-sm font-medium text-[#0B2A4A]">
                  Level
                </label>
                <select
                  value={filters.level}
                  onChange={(e) =>
                    setFilters({ ...filters, level: e.target.value })
                  }
                  className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                >
                  {levels.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>

              {/* Domain */}
              <div className="w-full min-w-45 flex-1">
                <label className="text-sm font-medium text-[#0B2A4A]">
                  Domain
                </label>
                <select
                  value={filters.domain}
                  onChange={(e) =>
                    setFilters({ ...filters, domain: e.target.value })
                  }
                  className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                >
                  {domains.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={resetFilters}
                className="ml-auto inline-flex h-10 items-center rounded-lg bg-[#003B7A] px-4 text-sm font-semibold text-white"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Table Header */}
          <div className="mb-2 grid grid-cols-6 px-3 text-sm font-semibold text-[#0B2A4A]">
            <span>Organisation</span>
            <span>Certificate Name</span>
            <span>Domain</span>
            <span>Exam Code</span>
            <span>Level</span>
            <span className="text-right">Enrolled</span>
          </div>

          {/* Table Body */}
          <div className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="space-y-2.5">
              {loading && (
                <p className="text-center text-gray-600">
                  Loading certifications...
                </p>
              )}
              {filteredCertifications.length === 0 && (
                <p className="text-center text-gray-600">
                  No certifications found
                </p>
              )}

              {filteredCertifications.map((c) => (
                <div
                  key={c.id}
                  className={`relative flex cursor-pointer items-center justify-between rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors ${openMenuId === c.id ? "z-50" : "z-0"}`}
                >
                  <div className="grid w-full grid-cols-6 text-sm">
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

                  <div
                    ref={openMenuId === c.id ? menuRef : null}
                    className="relative"
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCertificate(c);
                        setOpenMenuId(openMenuId === c.id ? null : c.id);
                      }}
                      className={`ml-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                        openMenuId === c.id
                          ? "bg-[#0B2A4A] text-white"
                          : "text-[#415a77]"
                      }`}
                      title="Manage certificate"
                    >
                      <Pencil size={15} />
                    </button>
                    {openMenuId === c.id && (
                      <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-2xl border border-[#D7E2F1] bg-white shadow-xl">
                        <div className="border-b border-[#E9EEF5] px-4 py-2.5">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[#415a77]">
                            {c.name}
                          </p>
                        </div>
                        <div className="py-1.5">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingCertificate(c);
                              setShowAddModal(true);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9EEF5] text-base">
                              ✏️
                            </span>
                            Edit Certificate
                          </button>
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedCertificate(c);
                              setShowDeclareResultModal(true);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[#0B2A4A] transition-colors"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9EEF5] text-base">
                              📋
                            </span>
                            Declare Result
                          </button>
                          <div className="mx-3 my-1 border-t border-[#E9EEF5]" />
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSoftDeleteCertificate(c);
                            }}
                            disabled={deletingCertificateId === c.id}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition-colors disabled:opacity-50"
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-base">
                              🗑️
                            </span>
                            {deletingCertificateId === c.id
                              ? "Deleting..."
                              : "Soft Delete"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
