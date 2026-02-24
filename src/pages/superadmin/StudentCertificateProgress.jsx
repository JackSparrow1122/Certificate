import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import { getStudentByDocId } from "../../../services/studentService";
import { getCertificatesByIds } from "../../../services/certificateService";

export default function StudentCertificateProgress() {
  const navigate = useNavigate();
  const { studentDocId } = useParams();

  const [student, setStudent] = useState(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchStudentData();
  }, [studentDocId]);

  const fetchStudentData = async () => {
    try {
      setLoading(true);
      setError("");

      const studentData = await getStudentByDocId(studentDocId);
      if (!studentData) {
        setError("Student not found");
        return;
      }

      setStudent(studentData);

      const certificateIds = Array.isArray(studentData.certificateIds)
        ? studentData.certificateIds
        : [];
      const enrolledCertificates = await getCertificatesByIds(certificateIds);
      setCertificates(enrolledCertificates);
    } catch (fetchError) {
      setError("Failed to load student certificate progress");
      console.error(fetchError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <div className="flex-1 px-5 py-8 lg:px-6">
        <div className="w-full space-y-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md bg-[#0B2A4A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0f355b]"
          >
            ← Back to Students
          </button>

          {loading && <div className="text-gray-600">Loading...</div>}
          {!loading && error && <div className="text-red-600">{error}</div>}

          {!loading && !error && student && (
            <>
              <section className="rounded-2xl bg-gray-300 p-6">
                <h1 className="text-2xl font-semibold text-gray-900">Student Certificate Progress</h1>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-600">Student Name</p>
                    <p className="text-base font-medium text-gray-900">{student.name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-600">Roll No.</p>
                    <p className="text-base font-medium text-gray-900">{student.id || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-600">Project Code</p>
                    <p className="text-base font-medium text-gray-900">{student.projectId || "-"}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl bg-gray-300 p-6">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">Enrolled Certificates</h2>

                {certificates.length === 0 ? (
                  <p className="rounded-xl bg-gray-100 px-4 py-6 text-center text-gray-600">
                    Student is not enrolled in any certificate.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {certificates.map((certificate) => (
                      <div
                        key={certificate.id}
                        className="grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 rounded-xl bg-gray-100 px-4 py-3"
                      >
                        <p className="font-medium text-gray-900">{certificate.name || "-"}</p>
                        <p className="text-gray-800">{certificate.platform || "-"}</p>
                        <p className="text-gray-800">{student.progress || "0%"}</p>
                        <p className="text-gray-800">{student.exams || "0 / 0"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
