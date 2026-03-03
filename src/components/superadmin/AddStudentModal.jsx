import { useMemo, useState } from "react";
import { addStudent } from "../../../services/studentService";
import { createStudentAuthUser } from "../../../services/userService";
import { parseProjectCode } from "../../utils/projectCodeParser";

export default function AddStudentModal({ projectCode, onClose, onStudentAdded }) {
  const parsedProjectCode = useMemo(() => parseProjectCode(projectCode), [projectCode]);

  const [form, setForm] = useState({
    id: "",
    name: "",
    gender: "",
    dob: "",
    tenthPercentage: "",
    twelfthPercentage: "",
    courseYear: parsedProjectCode.isStructured
      ? `${parsedProjectCode.courseLabel}${parsedProjectCode.semesterLabel ? ` / ${parsedProjectCode.semesterLabel}` : ""}`
      : "",
    admissionYear: parsedProjectCode.sessionStartYear,
    currentSemester: parsedProjectCode.semesterNumber,
    email: "",
    phone: "",
    collegeCode: parsedProjectCode.collegeCode,
    course: parsedProjectCode.courseLabel,
    semesterLabel: parsedProjectCode.semesterLabel,
    trainingType: parsedProjectCode.trainingTypeLabel,
    currentSession: parsedProjectCode.session,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [skippedEntries, setSkippedEntries] = useState([]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const validateForm = () => {
    if (!form.id.trim()) {
      setError("Roll number is required");
      return false;
    }
    if (!form.name.trim()) {
      setError("Student name is required");
      return false;
    }
    if (!form.gender) {
      setError("Gender is required");
      return false;
    }
    if (!form.tenthPercentage) {
      setError("10th percentage is required");
      return false;
    }
    if (!form.twelfthPercentage) {
      setError("12th percentage is required");
      return false;
    }
    if (!form.admissionYear) {
      setError("Admission year is required");
      return false;
    }
    if (!form.currentSemester) {
      setError("Current semester is required");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setSkippedEntries([]);
    try {
      const missingFields = [];
      if (!form.phone.trim()) missingFields.push("Mobile");
      if (!form.email.trim()) missingFields.push("Email");

      if (missingFields.length > 0) {
        const skippedEntry = {
          rollNo: form.id || "-",
          name: form.name || "-",
          missing: missingFields.join(", "),
        };
        setSkippedEntries([skippedEntry]);
        const shouldProceed = window.confirm(
          `1 student entry is missing ${missingFields.join(" and ")} and will be skipped.\nProceed without inserting this entry?`,
        );

        if (!shouldProceed) {
          setError("Student insertion cancelled.");
          return;
        }

        setError("Student skipped due to missing Mobile/Email.");
        return;
      }

      await addStudent({
        id: form.id,
        name: form.name,
        gender: form.gender,
        dob: form.dob,
        projectId: projectCode,
        courseYear: form.courseYear,
        collegeCode: form.collegeCode,
        course: form.course,
        semesterLabel: form.semesterLabel,
        trainingType: form.trainingType,
        currentSession: form.currentSession,
        progress: "0%",
        exams: "0 / 0",
        tenthPercentage: parseFloat(form.tenthPercentage),
        twelfthPercentage: parseFloat(form.twelfthPercentage),
        admissionYear: parseInt(form.admissionYear),
        currentSemester: parseInt(form.currentSemester),
        email: form.email,
        phone: form.phone,
      });

      let authError = null;
      let authResult = null;
      try {
        authResult = await createStudentAuthUser({
          studentId: form.id,
          name: form.name,
          email: form.email,
          mobile: form.phone,
          projectCode,
          collegeCode: form.collegeCode,
        });
      } catch (e) {
        authError = e;
      }

      onStudentAdded();

      if (authResult?.skippedExisting) {
        setError(
          "Student added to DB. student_users already had this email, so duplicate auth entry was skipped and duplicates were cleaned.",
        );
        return;
      }

      if (authError) {
        setError(
          `Student added to DB, but auth/student_users creation failed: ${authError.message || "Unknown error"}`,
        );
        return;
      }

      onClose();
    } catch (error) {
      setError("Failed to add student");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      <div className="relative z-10 mx-4 w-full max-w-5xl rounded-[2rem] border border-black/20 bg-gray-100 p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <h2 className="text-2xl font-medium text-gray-900 sm:text-xl">
            Add New Student
          </h2>
          <p className="text-sm text-gray-600">Project Code: {projectCode}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-100 p-2.5 text-sm text-red-700">
            {error}
          </div>
        )}
        {skippedEntries.length > 0 && (
          <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
            <p className="font-semibold">Skipped Entries</p>
            {skippedEntries.map((entry, index) => (
              <p key={`${entry.rollNo}-${index}`}>
                Roll No: {entry.rollNo} | Name: {entry.name} | Missing:{" "}
                {entry.missing}
              </p>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {parsedProjectCode.isStructured && (
            <div className="grid gap-3 rounded-2xl bg-gray-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">College</p>
                <p className="text-sm font-medium text-gray-900">{form.collegeCode || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">Course</p>
                <p className="text-sm font-medium text-gray-900">{form.course || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">Semester</p>
                <p className="text-sm font-medium text-gray-900">{form.semesterLabel || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">Training Type</p>
                <p className="text-sm font-medium text-gray-900">{form.trainingType || "-"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">Session</p>
                <p className="text-sm font-medium text-gray-900">{form.currentSession || "-"}</p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Roll No</label>
              <input
                type="text"
                name="id"
                value={form.id}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Student Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Gender</label>
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Course / Year</label>
              <input
                type="text"
                name="courseYear"
                value={form.courseYear}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Current Semester</label>
              <input
                type="number"
                name="currentSemester"
                value={form.currentSemester}
                onChange={handleChange}
                min="1"
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">10th Percentage</label>
              <input
                type="number"
                name="tenthPercentage"
                value={form.tenthPercentage}
                onChange={handleChange}
                min="0"
                max="100"
                step="0.1"
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">12th Percentage</label>
              <input
                type="number"
                name="twelfthPercentage"
                value={form.twelfthPercentage}
                onChange={handleChange}
                min="0"
                max="100"
                step="0.1"
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Admission Year</label>
              <input
                type="number"
                name="admissionYear"
                value={form.admissionYear}
                onChange={handleChange}
                min="2000"
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-gray-300 px-5 py-2 text-base font-medium text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-gray-300 px-6 py-2 text-base font-medium text-gray-900 disabled:opacity-60"
            >
              {loading ? "Adding..." : "ADD"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
