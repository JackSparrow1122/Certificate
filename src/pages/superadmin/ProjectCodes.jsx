import { useEffect, useMemo, useState } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import ProjectCodeRow from "../../components/superadmin/ProjectCodeRow";
import AddProjectCodeModal from "../../components/superadmin/AddProjectCodeModal";
import { RefreshCcw, Upload } from "lucide-react";
import {
  addProjectCode,
  getAllProjectCodes,
  rerunProjectCodeMatching,
} from "../../../services/projectCodeService";
import { getAllColleges } from "../../../services/collegeService";

const REQUIRED_JSON_KEYS = [
  "S.No",
  "Name",
  "College Code",
  "Course",
  "Year",
  "Training Type",
  "Passing Year",
  "Project Code",
];

const sanitizeValue = (value) =>
  String(value || "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();

const sanitizePathLikePart = (value) =>
  sanitizeValue(value)
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");

const normalizeCollegeCode = (value) => sanitizeValue(value).toUpperCase();

const normalizeProjectCode = (value) =>
  sanitizePathLikePart(value).toUpperCase();

const COURSE_CODE_ALIASES = {
  ENGINEERING: "ENGG",
  ENGG: "ENGG",
};

const getCourseCodeSegment = (courseValue) => {
  const normalizedCourse = sanitizePathLikePart(courseValue).toUpperCase();
  return COURSE_CODE_ALIASES[normalizedCourse] || normalizedCourse;
};

const getShortAcademicYear = (passingYear) => {
  const cleaned = sanitizeValue(passingYear);
  const match = cleaned.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!match) return null;
  return `${match[1].slice(-2)}-${match[2].slice(-2)}`;
};

const buildProjectCodeFromRow = (row) => {
  const collegeCode = sanitizePathLikePart(row["College Code"]).toUpperCase();
  const course = getCourseCodeSegment(row.Course);
  const year = sanitizePathLikePart(row.Year);
  const trainingType = sanitizePathLikePart(row["Training Type"]).toUpperCase();
  const shortAcademicYear = getShortAcademicYear(row["Passing Year"]);

  if (!collegeCode || !course || !year || !trainingType || !shortAcademicYear) {
    return null;
  }

  return `${collegeCode}/${course}/${year}/${trainingType}/${shortAcademicYear}`;
};

const hasExactRequiredKeys = (row) => {
  const keys = Object.keys(row || {});
  if (keys.length !== REQUIRED_JSON_KEYS.length) {
    return false;
  }
  return REQUIRED_JSON_KEYS.every((requiredKey) => keys.includes(requiredKey));
};

export default function ProjectCodes() {
  const [search, setSearch] = useState("");
  const [projectCodes, setProjectCodes] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeCode, setSelectedCollegeCode] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rerunningMatch, setRerunningMatch] = useState(false);
  const [loading, setLoading] = useState(true);

  const selectedCollege = colleges.find(
    (college) =>
      String(college.college_code || college.collegeCode) ===
      selectedCollegeCode,
  );

  const fetchProjectCodes = async () => {
    try {
      setLoading(true);
      const [projectCodesData, collegesData] = await Promise.all([
        getAllProjectCodes(),
        getAllColleges(),
      ]);
      setProjectCodes(projectCodesData || []);
      setColleges(collegesData || []);
    } catch (error) {
      console.error("Failed to load project codes:", error);
      setProjectCodes([]);
      setColleges([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectCodes();
  }, []);

  const filtered = projectCodes.filter((p) =>
    String(p.code || "")
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const mappedRows = useMemo(() => {
    const collegesMap = new Map(
      colleges.map((college) => [
        normalizeCollegeCode(college.college_code || college.collegeCode),
        college,
      ]),
    );

    return filtered.map((row) => {
      const codePrefix = String(row.code || "").split("/")[0];
      const lookupCode = normalizeCollegeCode(row.collegeId || codePrefix);
      const mappedCollege = collegesMap.get(lookupCode);

      return {
        ...row,
        matched: Boolean(mappedCollege),
        college: mappedCollege?.college_name || row.college || lookupCode,
      };
    });
  }, [filtered, colleges]);

  const handleProjectCodeAdded = async () => {
    setShowAddModal(false);
    await fetchProjectCodes();
  };

  const handleJsonImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setImporting(true);

      const rawText = await file.text();
      const parsed = JSON.parse(rawText);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("JSON must be a non-empty array.");
      }

      const collegesMap = new Map(
        colleges.map((college) => [
          String(
            college.college_code || college.collegeCode || "",
          ).toUpperCase(),
          college,
        ]),
      );

      for (let index = 0; index < parsed.length; index += 1) {
        const row = parsed[index];
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new Error(
            `Invalid row at index ${index + 1}. Each entry must be an object.`,
          );
        }

        if (!hasExactRequiredKeys(row)) {
          throw new Error(
            `Invalid format at row ${index + 1}. Required keys: ${REQUIRED_JSON_KEYS.join(", ")}`,
          );
        }

        const builtCode = buildProjectCodeFromRow(row);
        if (!builtCode) {
          throw new Error(
            `Invalid values at row ${index + 1}. College Code, Course, Year, Training Type, and Passing Year (YYYY-YYYY) are required.`,
          );
        }

        const providedCode = normalizeProjectCode(row["Project Code"]);
        if (!providedCode || providedCode !== normalizeProjectCode(builtCode)) {
          throw new Error(
            `Project Code mismatch at row ${index + 1}. Expected ${builtCode}`,
          );
        }

        const collegeCode = sanitizePathLikePart(
          row["College Code"],
        ).toUpperCase();
        const mappedCollege = collegesMap.get(collegeCode);
        const course = sanitizePathLikePart(row.Course);
        const year = sanitizePathLikePart(row.Year);
        const trainingType = sanitizePathLikePart(
          row["Training Type"],
        ).toUpperCase();
        const passingYear = sanitizeValue(row["Passing Year"]);
        const inputCollegeName = sanitizeValue(row.Name);

        await addProjectCode({
          code: builtCode,
          collegeId: collegeCode,
          college:
            mappedCollege?.college_name || inputCollegeName || collegeCode,
          course,
          year,
          type: trainingType,
          academicYear: passingYear,
          matched: Boolean(mappedCollege),
        });
      }

      await fetchProjectCodes();
      alert(`Successfully imported ${parsed.length} project codes.`);
    } catch (error) {
      console.error("JSON import failed:", error);
      alert(
        error.message ||
          "Failed to import JSON. Please use the required format.",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleRerunMatching = async () => {
    try {
      setRerunningMatch(true);
      const result = await rerunProjectCodeMatching();
      await fetchProjectCodes();
      alert(
        `Matching completed. Total: ${result.total}, Matched: ${result.matched}, Unmatched: ${result.unmatched}, Updated: ${result.updated}.`,
      );
    } catch (error) {
      console.error("Failed to rerun matching:", error);
      alert("Failed to rerun matching.");
    } finally {
      setRerunningMatch(false);
    }
  };

  return (
    <SuperAdminLayout>
      <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
        <section className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#012920]">Project Codes</h1>
              <p className="mt-1 text-sm text-gray-600">Manage, search, and import project codes</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-xl border border-[#012920] bg-[#F7FAFF] px-3 py-2">
              <span className="text-xs font-medium uppercase tracking-wide text-[#012920]/70">
                Total
              </span>
              <span className="text-lg font-semibold text-[#012920]">{filtered.length}</span>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#012920] bg-white p-4 shadow-sm sm:p-5">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#012920]/70">
                Search Project Code
              </label>
              <input
                type="text"
                placeholder="e.g. ICEM/ENGG/3rd/TP/26-27"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#D7E2F1] bg-[#F9FBFF] px-4 py-2.5 text-sm outline-none transition focus:border-[#1D5FA8] focus:bg-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#012920]/70">
                Manual Add College
              </label>
              <select
                value={selectedCollegeCode}
                onChange={(event) => setSelectedCollegeCode(event.target.value)}
                className="w-full rounded-lg border border-[#D7E2F1] bg-[#F9FBFF] px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Select college for manual add</option>
                {colleges.map((college) => {
                  const collegeCode = String(
                    college.college_code || college.collegeCode,
                  );
                  return (
                    <option key={collegeCode} value={collegeCode}>
                      {collegeCode} - {college.college_name}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={fetchProjectCodes}
                className="inline-flex items-center gap-2 rounded-lg border border-[#D7E2F1] bg-white px-3.5 py-2.5 text-sm font-medium text-[#012920]"
              >
                <RefreshCcw size={15} />
                Refresh
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedCollegeCode || !selectedCollege) {
                    alert("Please select a college first.");
                    return;
                  }
                  setShowAddModal(true);
                }}
                className="rounded-lg border border-[#D7E2F1] bg-white px-3.5 py-2.5 text-sm font-medium text-[#012920]"
              >
                Add Project Code
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#012920] px-3.5 py-2.5 text-sm font-semibold text-white">
                <Upload size={15} />
                {importing ? "Importing..." : "Import JSON"}
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleJsonImport}
                  className="hidden"
                  disabled={importing}
                />
              </label>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {filtered.length} result{filtered.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={handleRerunMatching}
              disabled={rerunningMatch}
              className="rounded-lg border border-[#D7E2F1] bg-white px-3 py-1.5 text-xs font-medium text-[#012920] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {rerunningMatch ? "Matching..." : "Rerun Matching"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-[#012920] bg-white shadow-sm">
          <div className="border-b border-[#E6EDF6] bg-[#F7FAFF] px-6 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#012920]">
              Project Code List
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-[#F7FAFF] text-xs uppercase tracking-wide text-[#012920]">
                <tr>
                  <th className="px-6 py-3">Project Code</th>
                  <th className="px-6 py-3">College</th>
                  <th className="px-6 py-3">Course</th>
                  <th className="px-6 py-3">Metadata</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {!loading &&
                  mappedRows.map((row) => (
                    <ProjectCodeRow key={row.id} row={row} />
                  ))}
                {loading && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-sm text-gray-500"
                    >
                      Loading project codes...
                    </td>
                  </tr>
                )}
                {!loading && mappedRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-8 text-center text-sm text-gray-500"
                    >
                      No project codes found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {showAddModal && selectedCollege && (
          <AddProjectCodeModal
            collegeId={String(
              selectedCollege.college_code || selectedCollege.collegeCode,
            )}
            collegeCode={String(
              selectedCollege.college_code || selectedCollege.collegeCode,
            )}
            collegeName={selectedCollege.college_name || ""}
            onClose={() => setShowAddModal(false)}
            onProjectCodeAdded={handleProjectCodeAdded}
          />
        )}
      </div>
    </SuperAdminLayout>
  );
}
