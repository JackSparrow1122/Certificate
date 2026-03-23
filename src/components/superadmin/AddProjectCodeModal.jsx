import { useState, useRef, useEffect } from "react";
import { addProjectCode } from "../../../services/projectCodeService";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

export default function AddProjectCodeModal({
  collegeId,
  collegeCode,
  collegeName,
  onClose,
  onProjectCodeAdded,
}) {
  const [form, setForm] = useState({
    code: "",
    course: "",
    year: "",
    type: "",
    academicYear: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const codeInputRef = useRef(null);

  // Generate academic year options
  const getAcademicYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const options = [];
    
    // Generate last 2 years, current year, and next 5 years
    for (let i = -2; i <= 5; i++) {
      const startYear = currentYear + i;
      const endYear = startYear + 1;
      const yearRange = `${startYear}-${endYear}`;
      options.push(yearRange);
    }
    
    return options;
  };

  const academicYearOptions = getAcademicYearOptions();
  const yearOptions = ["1st", "2nd", "3rd", "4th", "5th"];
  const typeOptions = ["OT", "TP"];

  // Get the college code prefix (e.g., "RCOEM")
  const collegeCodePrefix = String(collegeCode || collegeId || "")
    .trim()
    .toUpperCase();

  // Get first 3 letters of course
  const getCoursePrefix = (course) => {
    if (!course || !course.trim()) return "";
    return course.trim().toUpperCase().substring(0, 3);
  };

  // Auto-format the project code
  const formatProjectCode = (course, year, type, academicYear) => {
    let formatted = collegeCodePrefix;
    
    // Add course (first 3 letters)
    const coursePrefix = getCoursePrefix(course);
    if (coursePrefix) {
      formatted += `/${coursePrefix}`;
    }
    
    // Add year
    if (year && year.trim()) {
      formatted += `/${year.trim()}`;
    }
    
    // Add type
    if (type && type.trim()) {
      formatted += `/${type.trim().toUpperCase()}`;
    }
    
    // Add academic year
    if (academicYear && academicYear.trim()) {
      formatted += `/${academicYear.trim()}`;
    }
    
    return formatted;
  };

  // When any field changes, update the formatted code
  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    const updatedForm = { ...form, [name]: value };
    
    // Auto-update the project code when any field changes
    const formattedCode = formatProjectCode(
      name === 'course' ? value : updatedForm.course,
      name === 'year' ? value : updatedForm.year,
      name === 'type' ? value : updatedForm.type,
      name === 'academicYear' ? value : updatedForm.academicYear
    );
    updatedForm.code = formattedCode;
    
    setForm(updatedForm);
  };

  const validateForm = () => {
    if (!form.code.trim()) {
      setError("Project code is required");
      return false;
    }
    if (!form.course.trim()) {
      setError("Course is required");
      return false;
    }
    if (!form.year.trim()) {
      setError("Year is required");
      return false;
    }
    if (!form.type.trim()) {
      setError("Type is required");
      return false;
    }
    if (!form.academicYear.trim()) {
      setError("Academic year is required");
      return false;
    }

    // Validate the format
    const parts = form.code.split('/');
    if (parts.length < 5) {
      setError(`Project code must follow format: ${collegeCodePrefix}/COURSE/YEAR/TYPE/ACADEMIC-YEAR`);
      return false;
    }

    const enteredCodePrefix = parts[0]?.trim().toUpperCase();
    if (enteredCodePrefix !== collegeCodePrefix) {
      setError(`Project code must start with ${collegeCodePrefix}/`);
      return false;
    }

    // Validate course is only 3 letters
    const coursePart = parts[1]?.trim().toUpperCase();
    const expectedCoursePrefix = getCoursePrefix(form.course);
    if (coursePart !== expectedCoursePrefix) {
      setError(`Course should be ${expectedCoursePrefix} (first 3 letters of ${form.course})`);
      return false;
    }

    setError(null);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      await addProjectCode({
        code: form.code,
        collegeId: collegeId,
        college: collegeName,
        course: form.course,
        year: form.year,
        type: form.type,
        academicYear: form.academicYear,
        matched: false,
      });
      notifySuperAdminSuccess("Project code added");
      onProjectCodeAdded();
      onClose();
    } catch (error) {
      if (error?.code === "project-code/already-exists") {
        setError("Project code exists");
      } else {
        setError("Failed to add project code");
      }
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 z-10">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400"
        >
          ✕
        </button>

        <h2 className="text-xl font-semibold mb-4">Add Project Code</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Code
            </label>
            <div className="text-xs text-gray-500 mb-1">
              Format: {collegeCodePrefix}/COURSE(3 letters)/YEAR/TYPE/ACADEMIC-YEAR
            </div>
            <input
              ref={codeInputRef}
              type="text"
              name="code"
              value={form.code}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 font-mono text-sm"
              placeholder={`e.g., ${collegeCodePrefix}/ENG/3rd/OT`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Course
            </label>
            <input
              type="text"
              name="course"
              value={form.course}
              onChange={handleFieldChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Engineering, Computer Science"
            />
            {form.course && (
              <div className="text-xs text-gray-500 mt-1">
                Will be shortened to: {getCoursePrefix(form.course)}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              name="year"
              value={form.year}
              onChange={handleFieldChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select Year</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <select
              name="type"
              value={form.type}
              onChange={handleFieldChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select Type</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Academic Year
            </label>
            <select
              name="academicYear"
              value={form.academicYear}
              onChange={handleFieldChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select Academic Year</option>
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[#012920] text-white rounded-md disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Project Code"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
