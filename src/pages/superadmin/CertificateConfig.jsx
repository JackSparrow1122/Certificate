import { useEffect, useMemo, useState } from "react";
import Sidebar from "../../components/layout/Sidebar";
import { Pencil } from "lucide-react";
import { certifications as defaultCertifications } from "../../data/certifications";
import AddCertificateModal from "../../components/superadmin/AddCertificateModal";
import { getAllCertificates } from "../../../services/certificateService";
import { getAllProjectCodes } from "../../../services/projectCodeService";

export default function CertificateConfig() {
  const [certifications, setCertifications] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [filters, setFilters] = useState({
    platform: "All",
    level: "All",
    domain: "All",
    projectCode: "All",
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
        getAllProjectCodes(),
      ]);

      if (certificateData.length === 0) {
        setCertifications(
          defaultCertifications.map((item) => ({
            ...item,
            projectCode: "-",
            enrolledCount: 0,
          })),
        );
      } else {
        setCertifications(certificateData);
      }
      setProjectCodes(projectCodeData);
    } catch (fetchError) {
      setError("Failed to load certificate data");
      console.error(fetchError);
    } finally {
      setLoading(false);
    }
  };

  const platforms = ["All", ...new Set(certifications.map((c) => c.platform).filter(Boolean))];
  const levels = ["All", ...new Set(certifications.map((c) => c.level).filter(Boolean))];
  const domains = ["All", ...new Set(certifications.map((c) => c.domain).filter(Boolean))];
  const projectCodeOptions = ["All", ...new Set(certifications.map((c) => c.projectCode).filter(Boolean))];

  const filteredCertifications = useMemo(() => {
    return certifications.filter((c) => {
      return (
        (filters.platform === "All" || c.platform === filters.platform) &&
        (filters.level === "All" || c.level === filters.level) &&
        (filters.domain === "All" || c.domain === filters.domain) &&
        (filters.projectCode === "All" || c.projectCode === filters.projectCode)
      );
    });
  }, [certifications, filters]);

  const resetFilters = () =>
    setFilters({ platform: "All", level: "All", domain: "All", projectCode: "All" });

  const handleCertificateAdded = async (enrolledCount) => {
    await fetchData();
    setSuccessMessage(`Certificate created. ${enrolledCount} students enrolled from selected project code.`);
    setTimeout(() => setSuccessMessage(""), 3000);
  };

  return (
    <div className="flex min-h-screen bg-gray-200">
      <Sidebar />

      <div className="flex-1 p-8 space-y-6">
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

        {error && <div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700">{error}</div>}
        {successMessage && (
          <div className="rounded-md bg-green-100 px-4 py-2 text-sm text-green-700">{successMessage}</div>
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
          <div className="flex-1">
            <label className="text-sm font-medium">Project Code</label>
            <select
              value={filters.projectCode}
              onChange={(e) =>
                setFilters({ ...filters, projectCode: e.target.value })
              }
              className="w-full mt-1 h-9 rounded bg-white px-3"
            >
              {projectCodeOptions.map((projectCode) => (
                <option key={projectCode}>{projectCode}</option>
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
        <div className="grid grid-cols-7 text-sm font-semibold px-6">
          <span>Domain</span>
          <span>Certificate Name</span>
          <span>Platform / Organisation</span>
          <span>Exam Code</span>
          <span>Level</span>
          <span>Project Code</span>
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
            <p className="text-center text-gray-600">
              No certifications found
            </p>
          )}

          {filteredCertifications.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl px-6 py-4 flex items-center justify-between"
            >
              <div className="grid grid-cols-7 w-full text-sm">
                <span>{c.domain}</span>
                <span>{c.name}</span>
                <span>{c.platform}</span>
                <span>{c.examCode}</span>
                <span>{c.level}</span>
                <span>{c.projectCode || "-"}</span>
                <span className="text-right">{c.enrolledCount ?? 0} students</span>
              </div>

              <button className="ml-4 text-gray-600 hover:text-black">
                <Pencil size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddCertificateModal
          projectCodes={projectCodes}
          onClose={() => setShowAddModal(false)}
          onCertificateAdded={handleCertificateAdded}
        />
      )}
    </div>
  );
}
