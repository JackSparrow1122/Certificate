import { students } from "../../data/students";

export default function StudentProfile() {
  // TEMP: simulate logged-in student
  const loggedInStudentId = "STU012";

  const student = students.find(
    (s) => s.id === loggedInStudentId
  );

  if (!student) {
    return <p className="text-gray-500">Profile not found.</p>;
  }

  return (
    <div className="bg-white p-4 sm:p-8 rounded-xl shadow-sm max-w-4xl w-full">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">
        Student Profile
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-700">
        <ProfileItem label="Roll No" value={student.id} />
        <ProfileItem label="Student Name" value={student.name} />
        <ProfileItem label="Gender" value={student.gender} />
        <ProfileItem label="Date of Birth" value={student.dob} />

        <ProfileItem label="College" value="ICEM" />
        <ProfileItem label="Course / Year" value={student.projectId} />

        <ProfileItem label="Email" value={student.email} />
        <ProfileItem label="Phone" value={student.phone} />

        <ProfileItem
          label="10th Percentage"
          value={`${student.tenthPercentage}%`}
        />
        <ProfileItem
          label="12th Percentage"
          value={`${student.twelfthPercentage}%`}
        />

        <ProfileItem
          label="Admission Year"
          value={student.admissionYear}
        />
        <ProfileItem
          label="Current Semester"
          value={student.currentSemester}
        />
      </div>

      {/* CERTIFICATION (SINGLE LINE, ERP STYLE) */}
      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-semibold mb-4">
          Certification Progress
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ProfileItem
            label="Certificate"
            value={student.certificate}
          />
          <ProfileItem
            label="Progress"
            value={student.progress}
          />
          <ProfileItem
            label="Exams"
            value={student.exams}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- REUSABLE ---------- */

function ProfileItem({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">
        {value}
      </p>
    </div>
  );
}
