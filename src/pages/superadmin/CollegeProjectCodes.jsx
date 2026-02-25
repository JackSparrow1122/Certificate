import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getProjectCodesByCollege,
  softDeleteProjectCode,
} from "../../../services/projectCodeService";
import { getCollegeByCode } from "../../../services/collegeService";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import { Paperclip, RotateCcw, Trash2 } from "lucide-react";
import ConfirmDialog from "../../components/ConfirmDialog";

export default function CollegeProjectCodes() {
  const navigate = useNavigate();
  const { collegeId } = useParams();

  const [projectCodes, setProjectCodes] = useState([]);
  const [college, setCollege] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      <div className="px-5 py-8 lg:px-6">
        <div className="w-full space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => navigate("/superadmin/colleges")}
                className="mb-2 rounded-md bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
              >
                ← Back to Colleges
              </button>
              <h1 className="text-[2.15rem] leading-tight font-medium text-gray-900">
                {college?.college_name || collegeId}
              </h1>
              <h2 className="text-[2.15rem] leading-tight font-medium text-gray-900">
                Project Code List
              </h2>
            </div>
          </div>

          <section>
            <h3 className="mb-3 text-[2rem] leading-none font-medium tracking-wide text-gray-900">
              FILTERS
            </h3>
            <div className="rounded-[2rem] bg-gray-300 p-6">
              <div className="flex flex-wrap items-end gap-6">
                <label className="w-full min-w-[180px] flex-1 text-lg text-gray-900 sm:text-base">
                  Project Code
                  <select
                    value={filters.code}
                    onChange={(e) => handleFilterChange("code", e.target.value)}
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-sm outline-none"
                  >
                    <option value="">All project codes</option>
                    {filterOptions.codes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[140px] flex-1 text-lg text-gray-900 sm:text-base">
                  Course
                  <select
                    value={filters.course}
                    onChange={(e) =>
                      handleFilterChange("course", e.target.value)
                    }
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-sm outline-none"
                  >
                    <option value="">All courses</option>
                    {filterOptions.courses.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[120px] flex-1 text-lg text-gray-900 sm:text-base">
                  Year
                  <select
                    value={filters.year}
                    onChange={(e) => handleFilterChange("year", e.target.value)}
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-sm outline-none"
                  >
                    <option value="">All years</option>
                    {filterOptions.years.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-full min-w-[120px] flex-1 text-lg text-gray-900 sm:text-base">
                  Type
                  <select
                    value={filters.type}
                    onChange={(e) => handleFilterChange("type", e.target.value)}
                    className="mt-2 block h-10 w-full border-none bg-gray-100 px-3 text-sm outline-none"
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
                  className="inline-flex items-center gap-2 rounded-full bg-[#003B7A] px-5 py-2 text-sm font-semibold text-white"
                >
                  <RotateCcw size={15} />
                  Reset
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] bg-gray-300 p-6">
            <div className="mb-3 grid grid-cols-[2fr_1.2fr_1fr_48px] gap-4 px-4 text-lg font-medium text-gray-900 sm:text-sm">
              <p>Project Code</p>
              <p>Course</p>
              <p>Type</p>
              <p />
            </div>

            <div className="space-y-3">
              {filteredProjectCodes.map((row) => (
                <div
                  key={row.id}
                  className={`grid w-full grid-cols-[2fr_1.2fr_1fr_48px_48px] items-center gap-4 rounded-xl bg-gray-100 px-5 py-3 text-left text-lg text-gray-900 transition hover:bg-white sm:text-base ${
                    selectedProjectCode === row.id
                      ? "ring-2 ring-[#003B7A]/20"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProjectCode(row.id);
                      openStudentList(row.id);
                    }}
                    className="contents"
                  >
                    <p className="font-medium">{row.code}</p>
                    <p>{row.course || "-"}</p>
                    <p>{row.type || "-"}</p>
                    <span className="justify-self-end text-gray-600">
                      <Paperclip size={18} />
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteConfirm(row)}
                    disabled={deletingProjectId === row.id}
                    className="justify-self-end text-red-600 hover:text-red-700 disabled:opacity-50"
                    title="Soft delete project code"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>

            {filteredProjectCodes.length === 0 && (
              <div className="rounded-xl bg-gray-100 px-5 py-8 text-center text-gray-600">
                No project codes found
              </div>
            )}
          </section>
        </div>
      </div>

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
