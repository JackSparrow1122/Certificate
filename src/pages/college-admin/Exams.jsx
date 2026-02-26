import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getStudentsByProject } from "../../../services/studentService";
import { getProjectCodesByCollege } from "../../../services/projectCodeService";
import { getCertificatesByIds } from "../../../services/certificateService";

const parseExamNumbers = (examsText) => {
  const [attemptedRaw, totalRaw] = String(examsText || "0 / 0")
    .split("/")
    .map((value) => Number(value.trim()));
  const attempted = Number.isFinite(attemptedRaw) ? attemptedRaw : 0;
  const total = Number.isFinite(totalRaw) ? totalRaw : 0;
  return { attempted, total };
};

export default function Exams() {
  const { profile } = useAuth();
  const collegeCode = String(profile?.collegeCode || profile?.college_code || "")
    .trim()
    .toUpperCase();
  const [students, setStudents] = useState([]);
  const [certifications, setCertifications] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!collegeCode) {
          if (!mounted) return;
          setStudents([]);
          setCertifications([]);
          return;
        }

        const projects = await getProjectCodesByCollege(collegeCode);
        const studentGroups = await Promise.all(
          (projects || []).map((project) =>
            getStudentsByProject(String(project?.code || "").trim()),
          ),
        );
        const s = studentGroups.flatMap((group) => group || []);
        const certificateIds = [
          ...new Set(
            (s || []).flatMap((student) => {
              const fromArray = Array.isArray(student?.certificateIds)
                ? student.certificateIds
                : [];
              const fromResults =
                student?.certificateResults &&
                typeof student.certificateResults === "object"
                  ? Object.keys(student.certificateResults)
                  : [];
              return [...fromArray, ...fromResults]
                .map((id) => String(id || "").trim())
                .filter(Boolean);
            }),
          ),
        ];
        const certificateMeta =
          certificateIds.length > 0 ? await getCertificatesByIds(certificateIds) : [];
        const metaById = new Map(
          (certificateMeta || []).map((certificate) => [
            String(certificate?.id || "").trim(),
            certificate,
          ]),
        );
        const metaByName = new Map(
          (certificateMeta || []).map((certificate) => [
            String(certificate?.name || "")
              .trim()
              .toLowerCase(),
            certificate,
          ]),
        );
        const certificatesMap = new Map();

        (s || []).forEach((student) => {
          const results =
            student?.certificateResults &&
            typeof student.certificateResults === "object"
              ? Object.values(student.certificateResults)
              : [];
          results.forEach((result) => {
            const name = String(result?.certificateName || "").trim();
            if (name) {
              const resultId = String(result?.certificateId || "").trim();
              const key = resultId || `name:${name.toLowerCase()}`;
              const metadata =
                (resultId && metaById.get(resultId)) || metaByName.get(name.toLowerCase()) || null;
              if (!certificatesMap.has(key)) {
                certificatesMap.set(key, {
                  id: key,
                  name,
                  examCode: String(metadata?.examCode || "").trim() || "-",
                });
              }
            }
          });
          const legacyName = String(student?.certificate || "").trim();
          if (legacyName) {
            const key = `name:${legacyName.toLowerCase()}`;
            const metadata = metaByName.get(legacyName.toLowerCase()) || null;
            if (!certificatesMap.has(key)) {
              certificatesMap.set(key, {
                id: key,
                name: legacyName,
                examCode: String(metadata?.examCode || "").trim() || "-",
              });
            }
          }
        });

        const c = Array.from(certificatesMap.values()).map((certificate, index) => ({
          ...certificate,
          date: `2026-0${(index % 3) + 3}-${10 + index}`,
          slot: index % 2 === 0 ? "10:00 AM - 12:00 PM" : "2:00 PM - 4:00 PM",
        }));
        if (!mounted) return;
        setStudents(s || []);
        setCertifications(c || []);
      } catch (error) {
        console.error("Failed to load exams data:", error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [collegeCode]);

  const examSummary = students.reduce(
    (summary, student) => {
      const parsed = parseExamNumbers(student.exams);
      summary.attempted += parsed.attempted;
      summary.total += parsed.total;
      return summary;
    },
    { attempted: 0, total: 0 },
  );

  const completionRate =
    examSummary.total > 0
      ? Math.round((examSummary.attempted / examSummary.total) * 100)
      : 0;

  const examSchedule = certifications;

  const topAttempted = [...students]
    .map((student) => ({
      ...student,
      attempted: parseExamNumbers(student.exams).attempted,
      total: parseExamNumbers(student.exams).total,
    }))
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Exams</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Attempted Exams" value={examSummary.attempted} />
        <StatCard title="Total Planned Exams" value={examSummary.total} />
        <StatCard title="Completion Rate" value={`${completionRate}%`} />
      </section>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Upcoming Exam Schedule</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3">Certificate</th>
                <th className="py-2 pr-3">Exam Code</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2">Slot</th>
              </tr>
            </thead>
            <tbody>
              {examSchedule.map((exam) => (
                <tr key={exam.id} className="border-b">
                  <td className="py-2 pr-3 font-medium">{exam.name}</td>
                  <td className="py-2 pr-3">{exam.examCode}</td>
                  <td className="py-2 pr-3">{exam.date}</td>
                  <td className="py-2">{exam.slot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Top Students by Attempted Exams</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Project</th>
                <th className="py-2 pr-3">Attempted</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {topAttempted.map((student) => (
                <tr key={student.id} className="border-b">
                  <td className="py-2 pr-3 font-medium">{student.name}</td>
                  <td className="py-2 pr-3">{student.projectId}</td>
                  <td className="py-2 pr-3">{student.attempted}</td>
                  <td className="py-2">{student.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
