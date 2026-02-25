import { useEffect, useMemo, useState, useRef } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { Pencil } from "lucide-react";
import { certifications as defaultCertifications } from "../../data/certifications";
import AddCertificateModal from "../../components/superadmin/AddCertificateModal";
import EnrollProjectCodeModal from "../../components/superadmin/EnrollProjectCodeModal";
import DeclareResultModal from "../../components/superadmin/DeclareResultModal";
import { getAllCertificates } from "../../../services/certificateService";
import { getAllProjectCodesFromStudents } from "../../../services/studentService";

export default function CertificateConfig() {
  const [certifications, setCertifications] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [showDeclareResultModal, setShowDeclareResultModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
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
      const [certificateData, projectCodeData] = await Promise.all([
        getAllCertificates(),
        getAllProjectCodesFromStudents(),
      ]);

      if (certificateData.length === 0) {
        setCertifications(
          defaultCertifications.map((item) => ({
            ...item,
            enrolledCount: 0,
          })),
        );
      } else {
        setCertifications(certificateData);
      }
      console.log("Project codes loaded:", projectCodeData);
      setProjectCodes(projectCodeData);
    } catch (fetchError) {
      setError("Failed to load certificate data");
      console.error("Fetch error:", fetchError);
    } finally {
      setLoading(false);
    }
  };

  const platforms = [
    "All",
    ...new Set(certifications.map((c) => c.platform).filter(Boolean)),
  ];
  const levels = [
    "All",
    ...new Set(certifications.map((c) => c.level).filter(Boolean)),
  ];
  const domains = [
    "All",
    ...new Set(certifications.map((c) => c.domain).filter(Boolean)),
  ];

  const filteredCertifications = useMemo(() => {
    return certifications.filter((c) => {
      return (
        (filters.platform === "All" || c.platform === filters.platform) &&
        (filters.level === "All" || c.level === filters.level) &&
        (filters.domain === "All" || c.domain === filters.domain)
      );
    });
  }, [certifications, filters]);

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

  return (
    <SuperAdminLayout>
      <div className="space-y-6 p-2 sm:p-2 md:p-3 lg:p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            Certifications Configuration
          </h1>

          <button
            onClick={() => setShowAddModal(true)}
            className="bg-gray-300 hover:bg-gray-400 px-4 py-2 rounded-lg text-sm"
          >
            + Add New Certificate
          </button>
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
          {/* Platform */}
          <div className="flex-1">
            <label className="text-sm font-medium">
              Platform / Organisation
            </label>
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
          <span>Domain</span>
          <span>Certificate Name</span>
          <span>Platform / Organisation</span>
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
                <span>{c.domain}</span>
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
                    className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
                  >
                    🏆 Enroll Project Code
                  </button>
                </div>
        )}
      </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddCertificateModal
          onClose={() => setShowAddModal(false)}
          onCertificateAdded={handleCertificateAdded}
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
            setShowEnrollModal(false);
            setSelectedCertificate(null);
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
