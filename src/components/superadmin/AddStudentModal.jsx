import { useMemo, useState } from "react";
import { addStudent } from "../../../services/studentService";
import { getStudentsByProject } from "../../../services/studentService";
import { createStudentAuthUser } from "../../../services/userService";
import {
  enrollStudentsIntoCertificate,
  getAllCertificates,
  normalizeExamCode,
} from "../../../services/certificateService";
import { parseProjectCode } from "../../utils/projectCodeParser";
import {
  getSemesterOptionsFromProjectCode,
  getSemesterType,
} from "../../utils/semesterUtils";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const normalizePhone = (phone) => String(phone || "").trim();

const parseCertificateCodes = (raw) =>
  String(raw || "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);

async function assignCertificatesForStudent({
  projectCode,
  email,
  semesterNumber,
  certificateCodeInput,
}) {
  const examCodes = parseCertificateCodes(certificateCodeInput);
  if (examCodes.length === 0) {
    return {
      assignedCount: 0,
      alreadyAssignedCount: 0,
      unmatchedCodes: [],
      matchedCodes: [],
    };
  }

  const allCertificates = await getAllCertificates({ includeInactive: true });
  const certificateByCode = new Map();
  allCertificates.forEach((certificate) => {
    const normalizedCode = normalizeExamCode(certificate.examCode);
    if (normalizedCode) certificateByCode.set(normalizedCode, certificate);
  });

  const matchedCertificates = [];
  const unmatchedCodes = [];

  examCodes.forEach((examCode) => {
    const matched = certificateByCode.get(normalizeExamCode(examCode));
    if (matched) {
      matchedCertificates.push(matched);
    } else {
      unmatchedCodes.push(examCode);
    }
  });

  let assignedCount = 0;
  let alreadyAssignedCount = 0;
  for (const certificate of matchedCertificates) {
    const result = await enrollStudentsIntoCertificate({
      certificateId: certificate.id,
      certificateName: certificate.name || "",
      examCode: certificate.examCode || "",
      projectCode,
      semesterNumber,
      studentEmails: [email],
    });

    assignedCount += Number(result?.enrolledCount || 0);
    alreadyAssignedCount += Number(result?.alreadyEnrolledCount || 0);
  }

  return {
    assignedCount,
    alreadyAssignedCount,
    unmatchedCodes,
    matchedCodes: matchedCertificates.map((certificate) =>
      String(certificate.examCode || "").trim(),
    ),
  };
}

export default function AddStudentModal({
  projectCode,
  onClose,
  onStudentAdded,
}) {
  const parsedProjectCode = useMemo(
    () => parseProjectCode(projectCode),
    [projectCode],
  );
  const semesterOptions = useMemo(
    () => getSemesterOptionsFromProjectCode(projectCode),
    [projectCode],
  );

  const [form, setForm] = useState({
    id: "",
    name: "",
    gender: "",
    dob: "",
    tenthPercentage: "",
    twelfthPercentage: "",
    courseYear: parsedProjectCode.isStructured
      ? parsedProjectCode.courseLabel
      : "",
    admissionYear: parsedProjectCode.sessionStartYear,
    semester: "",
    currentYear: "",
    certificateEnrollments: "",
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
  const [success, setSuccess] = useState(null);
  const [skippedEntries, setSkippedEntries] = useState([]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "semester") {
      const semesterNumber = Number.parseInt(String(value || "").trim(), 10);
      const currentYear = Number.isFinite(semesterNumber)
        ? Math.ceil(semesterNumber / 2)
        : "";
      setForm((prev) => ({
        ...prev,
        semester: value,
        currentYear,
        semesterLabel: value ? `Semester ${value}` : prev.semesterLabel,
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

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
    if (!form.semester) {
      setError("Semester is required");
      return false;
    }
    if (!form.certificateEnrollments.trim()) {
      setError("Certificate enrollments are required");
      return false;
    }
    if (!form.email.trim()) {
      setError("Email is required");
      return false;
    }
    if (!form.phone.trim()) {
      setError("Phone is required");
      return false;
    }
    setError(null);
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setSuccess(null);
    setSkippedEntries([]);
    try {
      const semesterNumber = Number.parseInt(
        String(form.semester || "").trim(),
        10,
      );
      const studentEmail = normalizeEmail(form.email);
      const studentPhone = normalizePhone(form.phone);

      const existingStudents = await getStudentsByProject(projectCode, {
        maxDocs: 1500,
      });

      const duplicateByEmail = existingStudents.find(
        (student) =>
          normalizeEmail(
            student.OFFICIAL_DETAILS?.["EMAIL_ID"] || student.email,
          ) === studentEmail,
      );
      const duplicateByPhone = existingStudents.find(
        (student) =>
          normalizePhone(
            student.OFFICIAL_DETAILS?.["MOBILE NO."] || student.phone,
          ) === studentPhone,
      );

      if (duplicateByEmail || duplicateByPhone) {
        setSkippedEntries([
          {
            rollNo: form.id || "-",
            name: form.name || "-",
            missing: `Duplicate ${duplicateByEmail ? "Email" : "Phone"}`,
          },
        ]);

        const assignment = await assignCertificatesForStudent({
          projectCode,
          email: studentEmail,
          semesterNumber,
          certificateCodeInput: form.certificateEnrollments,
        });

        onStudentAdded();
        setSuccess(
          `Duplicate student skipped. Certificates assigned: ${assignment.assignedCount}, already enrolled: ${assignment.alreadyAssignedCount}${
            assignment.unmatchedCodes.length
              ? `, unmatched codes: ${assignment.unmatchedCodes.join(", ")}`
              : ""
          }`,
        );
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
        currentSemester: semesterNumber,
        semesterType: getSemesterType(semesterNumber),
        progress: "0%",
        exams: "0 / 0",
        tenthPercentage: parseFloat(form.tenthPercentage),
        twelfthPercentage: parseFloat(form.twelfthPercentage),
        admissionYear: parseInt(form.admissionYear),
        currentYear: Math.ceil(semesterNumber / 2),
        email: studentEmail,
        phone: studentPhone,
      });
      notifySuperAdminSuccess("Student added");

      let authError = null;
      let authResult = null;
      try {
        authResult = await createStudentAuthUser({
          studentId: form.id,
          name: form.name,
          email: studentEmail,
          mobile: studentPhone,
          projectCode,
          collegeCode: form.collegeCode,
        });
      } catch (e) {
        authError = e;
      }

      const assignment = await assignCertificatesForStudent({
        projectCode,
        email: studentEmail,
        semesterNumber,
        certificateCodeInput: form.certificateEnrollments,
      });

      onStudentAdded();

      if (authResult?.skippedExisting) {
        setError(
          "Student added to DB. student_users already had this email, so duplicate auth entry was skipped and duplicates were cleaned.",
        );
        setSuccess(
          `Certificate assignment summary: assigned ${assignment.assignedCount}, already enrolled ${assignment.alreadyAssignedCount}${
            assignment.unmatchedCodes.length
              ? `, unmatched codes: ${assignment.unmatchedCodes.join(", ")}`
              : ""
          }`,
        );
        return;
      }

      if (authError) {
        setError(
          `Student added to DB, but auth/student_users creation failed: ${authError.message || "Unknown error"}`,
        );
        setSuccess(
          `Certificate assignment summary: assigned ${assignment.assignedCount}, already enrolled ${assignment.alreadyAssignedCount}${
            assignment.unmatchedCodes.length
              ? `, unmatched codes: ${assignment.unmatchedCodes.join(", ")}`
              : ""
          }`,
        );
        return;
      }

      if (assignment.unmatchedCodes.length > 0) {
        setError(
          `Student added. Unmatched certificate codes: ${assignment.unmatchedCodes.join(", ")}`,
        );
        setSuccess(
          `Certificate assignment summary: assigned ${assignment.assignedCount}, already enrolled ${assignment.alreadyAssignedCount}`,
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
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

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
        {success && (
          <div className="mb-4 rounded-lg bg-green-100 p-2.5 text-sm text-green-700">
            {success}
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
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  College
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {form.collegeCode || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Course
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {form.course || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Year
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {form.semesterLabel || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Training Type
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {form.trainingType || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-600">
                  Session
                </p>
                <p className="text-sm font-medium text-gray-900">
                  {form.currentSession || "-"}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Roll No
              </label>
              <input
                type="text"
                name="id"
                value={form.id}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Student Name
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Gender
              </label>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Date of Birth
              </label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Course
              </label>
              <input
                type="text"
                name="courseYear"
                value={form.courseYear}
                readOnly
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Semester *
              </label>
              <select
                name="semester"
                value={form.semester}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              >
                <option value="">Select semester</option>
                {semesterOptions.map((semester) => (
                  <option key={semester} value={semester}>
                    Semester {semester} ({semester % 2 === 0 ? "Even" : "Odd"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Phone
              </label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                10th Percentage
              </label>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                12th Percentage
              </label>
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
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Admission Year
              </label>
              <input
                type="number"
                name="admissionYear"
                value={form.admissionYear}
                onChange={handleChange}
                min="2000"
                className="w-full border-none bg-gray-300 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Certificate Enrollments *
              </label>
              <input
                type="text"
                name="certificateEnrollments"
                value={form.certificateEnrollments}
                onChange={handleChange}
                placeholder="Enter exam codes, comma-separated (e.g. AZ-900, SC-900)"
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
