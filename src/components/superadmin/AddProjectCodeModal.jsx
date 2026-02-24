import { useState } from "react";
import { addProjectCode } from "../../../services/projectCodeService";

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

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

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

    const expectedCodePrefix = String(collegeCode || collegeId || "")
      .trim()
      .toUpperCase();
    const enteredCodePrefix = String(form.code || "")
      .split("/")[0]
      ?.trim()
      .toUpperCase();

    if (!enteredCodePrefix || enteredCodePrefix !== expectedCodePrefix) {
      setError(`Project code must start with ${expectedCodePrefix}/`);
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
      onProjectCodeAdded();
      onClose();
    } catch (error) {
      setError("Failed to add project code");
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
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
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
            <input
              type="text"
              name="code"
              value={form.code}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., RCOEM/ENGG/3rd/OT/26-27"
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
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Engineering"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <input
              type="text"
              name="year"
              value={form.year}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 3rd"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <input
              type="text"
              name="type"
              value={form.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., OT"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Academic Year
            </label>
            <input
              type="text"
              name="academicYear"
              value={form.academicYear}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 2026-2027"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Project Code"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
