import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getStudentById } from "../../../services/studentService";

export default function StudentDetails() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const s = await getStudentById(studentId);
        if (!mounted) return;
        setStudent(s || null);
      } catch (error) {
        console.error("Failed to load student:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [studentId]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!student) return <p className="text-gray-500">Student not found.</p>;

  return (
    <div className="max-w-5xl">
      {/* BACK */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 rounded-md bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white"
      >
        ← Back
      </button>

      {/* TITLE */}
      <h1 className="text-2xl font-semibold mb-6">
        Student Details
      </h1>

      {/* CARD */}
      <div className="bg-white rounded-xl shadow p-8">
        {/* BASIC INFO */}
        <Section title="Basic Information">
          <Detail label="Roll No" value={student.id} />
          <Detail label="Name" value={student.name} />
          <Detail label="Gender" value={student.gender} />
          <Detail label="Date of Birth" value={student.dob} />
        </Section>

        {/* ACADEMIC INFO */}
        <Section title="Academic Information">
          <Detail label="College / Course / Year" value={student.projectId} />
          <Detail label="Admission Year" value={student.admissionYear} />
          <Detail label="Current Year" value={student.currentYear || student.currentSemester || "-"} />
          <Detail label="10th Percentage" value={`${student.tenthPercentage}%`} />
          <Detail
            label="12th / Diploma Percentage"
            value={student.twelfthPercentage ? `${student.twelfthPercentage}%` : "-"}
          />
        </Section>

        {/* CERTIFICATION INFO */}
        <Section title="Certification Progress">
          <Detail label="Certificate" value={student.certificate} />
          <Detail label="Progress" value={student.progress} />
          <Detail label="Exams Attempted" value={student.exams} />
        </Section>

        {/* CONTACT INFO */}
        <Section title="Contact Information">
          <Detail label="Email" value={student.email} />
          <Detail label="Phone" value={student.phone} />
        </Section>
      </div>
    </div>
  );
}

/* ---------- REUSABLE COMPONENTS ---------- */

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {children}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-900">
        {value}
      </p>
    </div>
  );
}
