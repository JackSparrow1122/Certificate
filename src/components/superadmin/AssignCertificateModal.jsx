import { useState } from "react";
import { read, utils } from "xlsx";
import {
  getAllCertificates,
  enrollStudentsIntoCertificate,
} from "../../../services/certificateService";

export default function AssignCertificateModal({
  projectCode,
  onClose,
  onAssigned,
}) {
  const [step, setStep] = useState("upload"); // "upload" | "confirm" | "processing" | "complete"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsedRows, setParsedRows] = useState([]); // [{email, examCode}]
  const [matchedCertificates, setMatchedCertificates] = useState([]); // [{cert, emails}]
  const [results, setResults] = useState(null);

  // Step 1: Parse Excel with EMAIL and EXAM_CODE columns
  const handleExcelUpload = async (file) => {
    setLoading(true);
    setError(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = utils.sheet_to_json(sheet, { defval: null });

      if (!rows || rows.length === 0) {
        setError("Excel file is empty");
        setLoading(false);
        return;
      }

      // Find EMAIL column
      const emailKey = Object.keys(rows[0]).find((k) =>
        k.toLowerCase().includes("email"),
      );
      if (!emailKey) {
        setError("Excel must contain an EMAIL column");
        setLoading(false);
        return;
      }

      // Find EXAM_CODE column
      const examCodeKey = Object.keys(rows[0]).find(
        (k) =>
          k.toLowerCase().includes("exam") &&
          (k.toLowerCase().includes("code") || k.toLowerCase().includes("id")),
      );
      if (!examCodeKey) {
        setError(
          'Excel must contain an EXAM CODE column (header containing "exam" and "code")',
        );
        setLoading(false);
        return;
      }

      // Extract rows — a single EXAM_CODE cell may contain multiple codes
      // separated by commas, e.g. "AZ-900, SC-900, DP-900"
      const extracted = [];
      rows.forEach((row) => {
        const email = String(row[emailKey] || "")
          .trim()
          .toLowerCase();
        const rawCodes = String(row[examCodeKey] || "").trim();
        if (!email || !rawCodes) return;

        rawCodes
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
          .forEach((examCode) => {
            extracted.push({ email, examCode });
          });
      });

      if (extracted.length === 0) {
        setError("No valid rows with both email and exam code found");
        setLoading(false);
        return;
      }

      setParsedRows(extracted);

      // Step 2: Match exam codes to certificates in DB
      const allCerts = await getAllCertificates();
      const certByExamCode = new Map();
      allCerts.forEach((cert) => {
        const code = String(cert.examCode || "")
          .trim()
          .toUpperCase();
        if (code) {
          certByExamCode.set(code, cert);
        }
      });

      // Group emails by exam code → certificate
      const certEmailsMap = new Map(); // certId → {cert, emails:[]}
      const unmatchedCodes = new Set();

      extracted.forEach(({ email, examCode }) => {
        const normalizedCode = examCode.toUpperCase();
        const cert = certByExamCode.get(normalizedCode);
        if (!cert) {
          unmatchedCodes.add(examCode);
          return;
        }
        if (!certEmailsMap.has(cert.id)) {
          certEmailsMap.set(cert.id, { cert, emails: [] });
        }
        certEmailsMap.get(cert.id).emails.push(email);
      });

      if (unmatchedCodes.size > 0 && certEmailsMap.size === 0) {
        setError(
          `No matching certificates found. Unmatched exam codes: ${Array.from(unmatchedCodes).join(", ")}`,
        );
        setLoading(false);
        return;
      }

      const matched = Array.from(certEmailsMap.values());
      setMatchedCertificates(matched);

      if (unmatchedCodes.size > 0) {
        setError(
          `Warning: ${unmatchedCodes.size} unmatched exam code(s): ${Array.from(unmatchedCodes).join(", ")}. Proceeding with matched certificates.`,
        );
      }

      setStep("confirm");
    } catch (err) {
      setError("Failed to parse Excel file");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Enroll students
  const handleAssign = async () => {
    setStep("processing");
    setLoading(true);
    setError(null);

    try {
      const allResults = [];

      for (const { cert, emails } of matchedCertificates) {
        const result = await enrollStudentsIntoCertificate({
          certificateId: cert.id,
          certificateName: cert.name,
          examCode: cert.examCode,
          projectCode,
          studentEmails: emails,
        });
        allResults.push({
          certificateName: cert.name,
          examCode: cert.examCode,
          ...result,
        });
      }

      setResults(allResults);
      setStep("complete");
      onAssigned?.();
    } catch (err) {
      setError("Failed to assign certificates");
      console.error(err);
      setStep("confirm");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-[#0B2A4A]">
            {step === "upload" && "Assign Certificate via Excel"}
            {step === "confirm" && "Confirm Assignment"}
            {step === "processing" && "Assigning..."}
            {step === "complete" && "Assignment Complete"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
              <p className="font-medium mb-2">Excel Format:</p>
              <ul className="space-y-1 text-xs">
                <li>
                  ✓ Required: <strong>EMAIL</strong> column (student email
                  addresses)
                </li>
                <li>
                  ✓ Required: <strong>EXAM CODE</strong> column (matches
                  certificate exam codes)
                </li>
              </ul>
            </div>

            <p className="text-sm text-gray-600">
              Project Code: <strong>{projectCode}</strong>
            </p>

            <label className="block">
              <span className="text-sm text-gray-600 mb-2 block">
                Upload Excel file:
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) =>
                  e.target.files?.[0] && handleExcelUpload(e.target.files[0])
                }
                className="block w-full text-sm border border-gray-300 rounded-md p-2"
                disabled={loading}
              />
            </label>

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === "confirm" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded">
              <p className="text-sm font-medium text-blue-800 mb-3">
                Assignment Summary:
              </p>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>
                  <strong>Project Code:</strong> {projectCode}
                </li>
                <li>
                  <strong>Total rows parsed:</strong> {parsedRows.length}
                </li>
                <li>
                  <strong>Certificates matched:</strong>{" "}
                  {matchedCertificates.length}
                </li>
              </ul>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2 border border-gray-200 rounded p-3 bg-gray-50">
              {matchedCertificates.map(({ cert, emails }) => (
                <div
                  key={cert.id}
                  className="flex items-center justify-between p-2 bg-white rounded border"
                >
                  <div>
                    <p className="text-sm font-medium">{cert.name}</p>
                    <p className="text-xs text-gray-500">
                      Exam Code: {cert.examCode}
                    </p>
                  </div>
                  <span className="text-sm text-blue-600 font-medium">
                    {emails.length} students
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setStep("upload");
                  setParsedRows([]);
                  setMatchedCertificates([]);
                  setError(null);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleAssign}
                disabled={loading || matchedCertificates.length === 0}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? "Processing..." : "Assign Certificates"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Processing */}
        {step === "processing" && (
          <div className="space-y-4 text-center py-6">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto" />
            <p className="text-gray-600">
              Assigning certificates to students...
            </p>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === "complete" && results && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="text-lg font-semibold text-green-800 mb-3">
                ✓ Certificates Assigned Successfully
              </p>
              <div className="space-y-2">
                {results.map((r, idx) => (
                  <div key={idx} className="text-sm text-green-700">
                    <strong>{r.certificateName}</strong> ({r.examCode}):
                    enrolled {r.enrolledCount}, already enrolled{" "}
                    {r.alreadyEnrolledCount}, matched {r.matchedCount}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
