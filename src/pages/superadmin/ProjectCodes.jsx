import { useEffect, useMemo, useState } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import ProjectCodeRow from "../../components/superadmin/ProjectCodeRow";
import AddProjectCodeModal from "../../components/superadmin/AddProjectCodeModal";
import { RefreshCcw, Upload } from "lucide-react";
import {
  addProjectCode,
  getAllProjectCodes,
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

const getShortAcademicYear = (passingYear) => {
  const cleaned = sanitizeValue(passingYear);
  const match = cleaned.match(/^(\d{4})\s*-\s*(\d{4})$/);
  if (!match) return null;
  return `${match[1].slice(-2)}-${match[2].slice(-2)}`;
};

const buildProjectCodeFromRow = (row) => {
  const collegeCode = sanitizePathLikePart(row["College Code"]).toUpperCase();
  const course = sanitizePathLikePart(row.Course);
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

  return (
    <SuperAdminLayout>
      <div className="p-2 sm:p-2 md:p-3 lg:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Project Codes</h1>
            <p className="text-gray-500 text-sm">Manage your feedback system</p>
          </div>

          <button
            onClick={fetchProjectCodes}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B2A4A] text-white rounded-lg"
          >
            <RefreshCcw size={16} />
            Refresh
          </button>
        </div>

        {/* Search + Actions */}
        <div className="flex items-center justify-between mb-4">
          <input
            type="text"
            placeholder="Search project codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[420px] px-4 py-2 rounded-lg border focus:outline-none"
          />

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {filtered.length} Codes
            </span>

            <select
              value={selectedCollegeCode}
              onChange={(event) => setSelectedCollegeCode(event.target.value)}
              className="px-3 py-2 border rounded-lg text-sm bg-white"
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

            <button
              type="button"
              onClick={async () => {
                if (!selectedCollegeCode || !selectedCollege) {
                  alert("Please select a college first.");
                  return;
                }
                setShowAddModal(true);
              }}
              className="px-4 py-2 border rounded-lg"
            >
              Add Project Code
            </button>

            <button className="px-4 py-2 border rounded-lg">
              Rerun Matching
            </button>

            <label className="flex items-center gap-2 px-4 py-2 bg-[#0B2A4A] text-white rounded-lg cursor-pointer">
              <Upload size={16} />
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

        {/* Table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-sm text-gray-600">
              <tr>
                <th className="px-6 py-3">Project Code</th>
                <th className="px-6 py-3">College</th>
                <th className="px-6 py-3">Course</th>
                <th className="px-6 py-3">Metadata</th>
                <th className="px-6 py-3"></th>
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
                    className="px-6 py-6 text-center text-sm text-gray-500"
                  >
                    Loading project codes...
                  </td>
                </tr>
              )}
              {!loading && mappedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-6 text-center text-sm text-gray-500"
                  >
                    No project codes found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
