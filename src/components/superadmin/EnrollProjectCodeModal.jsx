import { useEffect, useMemo, useState } from "react";
import {
  enrollProjectCodeIntoCertificate,
  getAssignedProjectCodesForCertificate,
  unassignProjectCodeFromCertificate,
} from "../../../services/certificateService";

export default function EnrollProjectCodeModal({
  certificate,
  projectCodes,
  onClose,
  onEnrolled,
}) {
  const [selectedProjectCode, setSelectedProjectCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [removingCode, setRemovingCode] = useState("");
  const [error, setError] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [assignedProjectCodes, setAssignedProjectCodes] = useState([]);

  console.log("EnrollProjectCodeModal received projectCodes:", projectCodes);

  useEffect(() => {
    const loadAssignedProjectCodes = async () => {
      try {
        const assignedCodes = await getAssignedProjectCodesForCertificate(
          certificate.id,
        );
        setAssignedProjectCodes(assignedCodes);
      } catch (loadError) {
        console.error(loadError);
      }
    };

    loadAssignedProjectCodes();
  }, [certificate.id]);

  const projectCodeOptions = useMemo(
    () =>
      [
        ...new Set(
          (projectCodes || [])
            .map((projectCode) => String(projectCode?.code || "").trim())
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [projectCodes],
  );

  const handleEnroll = async () => {
    const normalizedSelectedCode = String(selectedProjectCode || "").trim();

    if (!normalizedSelectedCode) {
      setError("Select a project code");
      return;
    }

    if (!projectCodeOptions.includes(normalizedSelectedCode)) {
      setError("Select a valid project code from the list");
      return;
    }

    setError("");
    setResultMessage("");
    setLoading(true);
    try {
      const result = await enrollProjectCodeIntoCertificate({
        certificateId: certificate.id,
        certificateName: certificate.name,
        projectCode: normalizedSelectedCode,
      });

      const assignedCodes = await getAssignedProjectCodesForCertificate(
        certificate.id,
      );
      setAssignedProjectCodes(assignedCodes);

      setResultMessage(
        `${result.newlyEnrolledCount} students enrolled (${result.matchedStudentsCount} matched).`,
      );
      setSelectedProjectCode("");
      await onEnrolled();
    } catch (enrollError) {
      setError("Failed to enroll students for selected project code");
      console.error(enrollError);
    } finally {
      setLoading(false);
    }
  };

  const handleUnassign = async (projectCode) => {
    setError("");
    setResultMessage("");
    setRemovingCode(projectCode);
    try {
      const result = await unassignProjectCodeFromCertificate({
        certificateId: certificate.id,
        certificateName: certificate.name,
        projectCode,
      });

      const assignedCodes = await getAssignedProjectCodesForCertificate(
        certificate.id,
      );
      setAssignedProjectCodes(assignedCodes);
      setResultMessage(
        `${result.unenrolledCount} students unenrolled from ${projectCode}.`,
      );
      await onEnrolled();
    } catch (unassignError) {
      setError("Failed to unassign project code");
      console.error(unassignError);
    } finally {
      setRemovingCode("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 mx-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400"
        >
          ✕
        </button>

        <h2 className="mb-1 text-xl font-semibold text-gray-900">
          Enroll Project Code
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Certificate: <span className="font-medium">{certificate.name}</span>
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Assigned Project Codes
            </label>
            <div className="min-h-10 rounded-md border border-gray-300 bg-gray-50 px-2 py-2">
              {assignedProjectCodes.length === 0 ? (
                <p className="text-xs text-gray-500">
                  No project codes assigned yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedProjectCodes.map((code) => (
                    <div
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800"
                    >
                      <span>{code}</span>
                      <button
                        type="button"
                        onClick={() => handleUnassign(code)}
                        disabled={Boolean(removingCode)}
                        className="rounded-full px-1 text-blue-900 disabled:opacity-60"
                        title={`Remove ${code}`}
                      >
                        {removingCode === code ? "..." : "x"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Select Project Code
            </label>
            <input
              list="project-code-options"
              value={selectedProjectCode}
              onChange={(event) => setSelectedProjectCode(event.target.value)}
              placeholder="Type or select project code"
              className="h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm outline-none"
            />
            <datalist id="project-code-options">
              {projectCodeOptions.map((projectCodeValue) => (
                <option key={projectCodeValue} value={projectCodeValue} />
              ))}
            </datalist>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {resultMessage && (
          <p className="mt-3 text-sm text-green-700">{resultMessage}</p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleEnroll}
            className="rounded-md bg-[#0B2A4A] px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Enrolling..." : "Enroll Students"}
          </button>
        </div>
      </div>
    </div>
  );
}
