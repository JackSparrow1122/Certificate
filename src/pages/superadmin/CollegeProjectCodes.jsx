import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getProjectCodesByCollege,
  softDeleteProjectCode,
} from "../../../services/projectCodeService";
import { getCollegeByCode } from "../../../services/collegeService";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import AddProjectCodeModal from "../../components/superadmin/AddProjectCodeModal";
import { RotateCcw, Trash2 } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function CollegeProjectCodes() {
  const navigate = useNavigate();
  const { collegeId } = useParams();

  const [projectCodes, setProjectCodes] = useState([]);
  const [college, setCollege] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [selectedProjectCode, setSelectedProjectCode] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [filters, setFilters] = useState({
    code: "",
    course: "",
    year: "",
    type: "",
  });

  const getProjectCodePrefix = (projectCode) =>
    String(projectCode || "")
      .split("/")[0]
      ?.trim()
      .toUpperCase();

  const filterOptions = useMemo(() => {
    const uniqueSorted = (items) =>
      [
        ...new Set(items.filter(Boolean).map((item) => String(item).trim())),
      ].sort((a, b) => a.localeCompare(b));

    return {
      codes: uniqueSorted(projectCodes.map((item) => item.code)),
      courses: uniqueSorted(projectCodes.map((item) => item.course)),
      years: uniqueSorted(projectCodes.map((item) => item.year)),
      types: uniqueSorted(projectCodes.map((item) => item.type)),
    };
  }, [projectCodes]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectCodesData, collegeData] = await Promise.all([
        getProjectCodesByCollege(collegeId),
        getCollegeByCode(collegeId),
      ]);

      const expectedCollegeCode = String(
        collegeData?.college_code || collegeData?.collegeCode || collegeId,
      )
        .trim()
        .toUpperCase();

      const normalizedCollegeId = String(collegeId || "")
        .trim()
        .toUpperCase();

      const strictCollegeProjectCodes = projectCodesData.filter(
        (projectCode) => {
          const projectCollegeId = String(projectCode.collegeId || "")
            .trim()
            .toUpperCase();
          const codePrefix = getProjectCodePrefix(projectCode.code);
          const matchesCollegeRecord = projectCollegeId === normalizedCollegeId;
          const matchesCodePrefix =
            !expectedCollegeCode || codePrefix === expectedCollegeCode;
          return matchesCollegeRecord && matchesCodePrefix;
        },
      );

      setProjectCodes(strictCollegeProjectCodes);
      setCollege(collegeData);
    } catch (error) {
      setError("Failed to load data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [collegeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters({
      code: "",
      course: "",
      year: "",
      type: "",
    });
  };

  const filteredProjectCodes = projectCodes.filter((code) => {
    const matchesCode =
      !filters.code || String(code.code || "") === filters.code;
    const matchesCourse =
      !filters.course || String(code.course || "") === filters.course;
    const matchesYear =
      !filters.year || String(code.year || "") === filters.year;
    const matchesType =
      !filters.type || String(code.type || "") === filters.type;

    return matchesCode && matchesCourse && matchesYear && matchesType;
  });

  const openStudentList = (projectId) => {
    navigate(`/superadmin/project-codes/${projectId}/students`);
  };

  const handleSoftDeleteProjectCode = async () => {
    if (!confirmTarget) return;
    try {
      setDeletingProjectId(confirmTarget.id);
      await softDeleteProjectCode(confirmTarget.id, confirmTarget.code);
      setConfirmOpen(false);
      setConfirmTarget(null);
      await fetchData();
    } catch (deleteError) {
      console.error(deleteError);
      alert("Failed to soft delete project code");
    } finally {
      setDeletingProjectId("");
    }
  };

  const openDeleteConfirm = (row) => {
    setConfirmTarget(row);
    setConfirmOpen(true);
  };

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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => navigate("/superadmin/colleges")}
                className="mb-2 rounded-lg bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
              >
                ← Back to Colleges
              </button>
              <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
                {college?.college_name || collegeId}
              </h1>
              <h2 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
                Project Code List
              </h2>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="rounded-lg bg-[#DCE5F1] px-4 py-2.5 text-sm font-semibold text-[#0B2A4A] hover:bg-[#cdd9e8]"
              >
                + Add New Project Code
              </button>
            </div>
          </div>

          <section>
            <h3 className="mb-3 text-2xl font-semibold tracking-wide text-[#0B2A4A]">
              FILTERS
            </h3>
            <div className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="w-full min-w-[180px] flex-1 text-sm font-medium text-[#0B2A4A]">
                  Project Code
                  <select
                    value={filters.code}
                    onChange={(e) => handleFilterChange("code", e.target.value)}
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  >
                    <option value="">All project codes</option>
                    {filterOptions.codes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[140px] flex-1 text-sm font-medium text-[#0B2A4A]">
                  Course
                  <select
                    value={filters.course}
                    onChange={(e) =>
                      handleFilterChange("course", e.target.value)
                    }
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  >
                    <option value="">All courses</option>
                    {filterOptions.courses.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[120px] flex-1 text-sm font-medium text-[#0B2A4A]">
                  Year
                  <select
                    value={filters.year}
                    onChange={(e) => handleFilterChange("year", e.target.value)}
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  >
                    <option value="">All years</option>
                    {filterOptions.years.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[120px] flex-1 text-sm font-medium text-[#0B2A4A]">
                  Type
                  <select
                    value={filters.type}
                    onChange={(e) => handleFilterChange("type", e.target.value)}
                    className="mt-2 block h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm outline-none"
                  >
                    <option value="">All types</option>
                    {filterOptions.types.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#003B7A] px-4 text-sm font-semibold text-white"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-4 sm:p-5">
            <div className="mb-2 grid grid-cols-[2fr_1.2fr_1fr_40px] gap-3 px-3 text-sm font-semibold text-[#0B2A4A]">
              <p>Project Code</p>
              <p>Course</p>
              <p>Type</p>
              <p />
            </div>

            <div className="space-y-2.5">
              {filteredProjectCodes.map((row) => (
                <div
                  key={row.id}
                  onClick={() => {
                    setSelectedProjectCode(row.id);
                    openStudentList(row.id);
                  }}
                  className={`grid w-full cursor-pointer grid-cols-[2fr_1.2fr_1fr_40px] items-center gap-3 rounded-xl border border-[#D7E2F1] bg-white px-4 py-2.5 text-sm text-[#0B2A4A] transition hover:border-[#BCD0E7] ${
                    selectedProjectCode === row.id
                      ? "ring-2 ring-[#003B7A]/20"
                      : ""
                  }`}
                >
                  <p className="truncate font-medium text-left">{row.code}</p>
                  <p className="text-left">{row.course || "-"}</p>
                  <p className="text-left">{row.type || "-"}</p>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDeleteConfirm(row);
                    }}
                    disabled={deletingProjectId === row.id}
                    className="justify-self-center text-red-600 hover:text-red-700 disabled:opacity-50"
                    title="Soft delete project code"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {filteredProjectCodes.length === 0 && (
              <div className="rounded-xl border border-[#D7E2F1] bg-white px-5 py-8 text-center text-sm text-gray-600">
                No project codes found
              </div>
            )}
          </section>
        </div>
      </div>

      {showAddProjectModal && (
        <AddProjectCodeModal
          collegeId={collegeId}
          collegeCode={String(
            college?.college_code || college?.collegeCode || collegeId,
          )}
          collegeName={String(college?.college_name || "")}
          onClose={() => setShowAddProjectModal(false)}
          onProjectCodeAdded={fetchData}
        />
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Confirm Deletion"
        message={
          confirmTarget
            ? `Soft delete project code ${confirmTarget.code}? You can restore it by adding the same project code again.`
            : "Are you sure you want to delete this project code?"
        }
        onConfirm={handleSoftDeleteProjectCode}
        onCancel={() => {
          setConfirmOpen(false);
          setConfirmTarget(null);
        }}
        loading={deletingProjectId === (confirmTarget && confirmTarget.id)}
      />
    </SuperAdminLayout>
  );
}
