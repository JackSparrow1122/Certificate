import { useState, useRef } from "react";
import {
  getAllCertificates,
  enrollStudentsIntoCertificate,
} from "../../../services/certificateService";
import * as XLSX from "xlsx";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

// ---------------------------------------------------------------------------
// Normalize exam codes: replace Unicode dash variants → ASCII hyphen,
// collapse internal whitespace, uppercase.  Prevents AZ–900 vs AZ-900 mismatches.
// ---------------------------------------------------------------------------
const normalizeExamCode = (code) =>
  String(code || "")
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

export default function AssignCertificateModal({
  projectCode,
  onClose,
  onAssigned,
}) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [results, setResults] = useState(null);
  const fileInputRef = useRef(null);

  // -----------------------------------------------------------------------
  // Parse Excel and enroll students
  // -----------------------------------------------------------------------
  const handleExcelUpload = async () => {
    if (!file) {
      setError("Please select an Excel/CSV file.");
      return;
    }
    if (!projectCode) {
      setError("No project code provided.");
      return;
    }

    setLoading(true);
    setError("");
    setStatus("Reading file…");
    setResults(null);

    try {
      // 1. Read file → rows
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        setError("The spreadsheet is empty.");
        setLoading(false);
        return;
      }

      // 2. Detect columns (case-insensitive header matching)
      const headers = Object.keys(rows[0]).map((h) =>
        String(h).trim().toUpperCase(),
      );
      const rawHeaders = Object.keys(rows[0]);

      const emailColIdx = headers.findIndex(
        (h) =>
          h === "EMAIL" ||
          h === "EMAIL ID" ||
          h === "EMAIL_ID" ||
          h === "EMAILID" ||
          h === "EMAIL ADDRESS",
      );
      const examCodeColIdx = headers.findIndex(
        (h) =>
          h === "EXAM CODE" ||
          h === "EXAM_CODE" ||
          h === "EXAMCODE" ||
          h === "EXAM" ||
          h === "CERTIFICATE CODE" ||
          h === "CERT CODE",
      );

      if (emailColIdx === -1) {
        setError(
          'Missing required column: "EMAIL" (or "EMAIL ID" / "EMAIL_ID"). Check your header row.',
        );
        setLoading(false);
        return;
      }
      if (examCodeColIdx === -1) {
        setError(
          'Missing required column: "EXAM CODE" (or "EXAM_CODE" / "EXAMCODE"). Check your header row.',
        );
        setLoading(false);
        return;
      }

      const emailCol = rawHeaders[emailColIdx];
      const examCodeCol = rawHeaders[examCodeColIdx];

      // 3. Extract { email, examCode } entries — support comma-separated exam codes
      const extracted = [];
      for (const row of rows) {
        const email = String(row[emailCol] || "")
          .trim()
          .toLowerCase();
        if (!email) continue;

        const rawCodes = String(row[examCodeCol] || "").trim();
        if (!rawCodes) continue;

        // Comma-separated support: "AZ-900, SC-900, DP-900"
        const codes = rawCodes
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        for (const code of codes) {
          extracted.push({ email, examCode: code });
        }
      }

      if (!extracted.length) {
        setError(
          "No valid rows found. Each row needs an email and at least one exam code.",
        );
        setLoading(false);
        return;
      }

      setStatus(
        `Parsed ${extracted.length} email–exam‑code pairs. Loading certificates…`,
      );

      // 4. Fetch ALL certificates (including inactive) and build lookup
      const allCerts = await getAllCertificates({ includeInactive: true });
      const certByExamCode = new Map();
      allCerts.forEach((cert) => {
        const code = normalizeExamCode(cert.examCode);
        if (code) certByExamCode.set(code, cert);
      });

      // 5. Map each extracted row to the right certificate
      const certEmailsMap = new Map(); // certId → { cert, emails: Set }
      const matchedCodes = new Set();
      const unmatchedCodes = new Set();

      extracted.forEach(({ email, examCode }) => {
        const normalizedCode = normalizeExamCode(examCode);
        const cert = certByExamCode.get(normalizedCode);

        if (!cert) {
          unmatchedCodes.add(examCode);
          return;
        }

        matchedCodes.add(normalizedCode);
        unmatchedCodes.delete(examCode); // remove if a later row matched it

        if (!certEmailsMap.has(cert.id)) {
          certEmailsMap.set(cert.id, { cert, emails: new Set() });
        }
        certEmailsMap.get(cert.id).emails.add(email);
      });

      // Purge from unmatchedCodes any raw code whose normalized form was matched
      matchedCodes.forEach((code) => unmatchedCodes.delete(code));
      for (const raw of Array.from(unmatchedCodes)) {
        if (matchedCodes.has(normalizeExamCode(raw))) {
          unmatchedCodes.delete(raw);
        }
      }

      // 6. Warn / abort
      if (unmatchedCodes.size > 0 && certEmailsMap.size === 0) {
        setError(
          `No matching certificates found. Unmatched exam codes: ${Array.from(unmatchedCodes).join(", ")}`,
        );
        setLoading(false);
        return;
      }

      let warningMsg = "";
      if (unmatchedCodes.size > 0) {
        warningMsg = `Warning: ${unmatchedCodes.size} unmatched exam code(s): ${Array.from(unmatchedCodes).join(", ")}. Proceeding with matched certificates.`;
      }

      // 7. Enroll per certificate
      setStatus(
        `Enrolling students into ${certEmailsMap.size} certificate(s)…`,
      );
      const enrollResults = [];

      for (const [certId, { cert, emails }] of certEmailsMap) {
        try {
          const result = await enrollStudentsIntoCertificate({
            certificateId: certId,
            certificateName: cert.name || "",
            examCode: cert.examCode || "",
            projectCode,
            studentEmails: Array.from(emails),
          });
          enrollResults.push({
            certName: cert.name || cert.examCode || certId,
            ...result,
          });
        } catch (enrollErr) {
          console.error(`Enrollment failed for ${certId}:`, enrollErr);
          enrollResults.push({
            certName: cert.name || cert.examCode || certId,
            enrolledCount: 0,
            matchedCount: 0,
            alreadyEnrolledCount: 0,
            error: enrollErr.message,
          });
        }
      }

      // 8. Build summary
      const totalEnrolled = enrollResults.reduce(
        (s, r) => s + (r.enrolledCount || 0),
        0,
      );
      const totalAlready = enrollResults.reduce(
        (s, r) => s + (r.alreadyEnrolledCount || 0),
        0,
      );
      const totalMatched = enrollResults.reduce(
        (s, r) => s + (r.matchedCount || 0),
        0,
      );
      const totalErrors = enrollResults.filter((r) => r.error).length;

      setResults({ enrollResults, totalEnrolled, totalAlready, totalMatched });

      let summaryParts = [];
      summaryParts.push(`${totalEnrolled} student(s) enrolled`);
      if (totalAlready > 0)
        summaryParts.push(`${totalAlready} already enrolled`);
      if (totalMatched > totalEnrolled + totalAlready)
        summaryParts.push(
          `${totalMatched - totalEnrolled - totalAlready} email(s) not found in project`,
        );
      if (totalErrors > 0)
        summaryParts.push(`${totalErrors} certificate(s) had errors`);

      let finalMsg = "Done! " + summaryParts.join(", ") + ".";
      if (warningMsg) finalMsg = warningMsg + "\n\n" + finalMsg;

      setStatus(finalMsg);
      notifySuperAdminSuccess("Certificate assigned");

      if (totalEnrolled > 0) {
        onAssigned?.();
      }
    } catch (err) {
      console.error("Assign certificate error:", err);
      setError("Failed to process file: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError("");
      setStatus("");
      setResults(null);
    }
  };

  const handleReset = () => {
    setFile(null);
    setError("");
    setStatus("");
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#0B2A4A]">
            Enroll Certificate via Excel
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Instructions */}
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          <p className="font-semibold mb-1">Required columns:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>
              <strong>EMAIL</strong> — student email address
            </li>
            <li>
              <strong>EXAM CODE</strong> — certificate exam code (e.g. AZ-900)
            </li>
          </ul>
          <p className="mt-1.5 text-xs text-blue-600">
            Tip: Multiple exam codes per row are supported — separate with
            commas (e.g. "AZ-900, SC-900").
          </p>
        </div>

        {/* Project code label */}
        <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          Project Code: <strong>{projectCode}</strong>
        </div>

        {/* File input */}
        <div className="mb-4">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#0B2A4A] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Status */}
        {status && !error && (
          <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-800 whitespace-pre-line">
            {status}
          </div>
        )}

        {/* Per-certificate breakdown */}
        {results?.enrollResults && (
          <div className="mb-3 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">
              Per-certificate breakdown:
            </p>
            {results.enrollResults.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs py-1 border-b border-gray-100 last:border-0"
              >
                <span className="font-medium text-[#0B2A4A] truncate mr-2">
                  {r.certName}
                </span>
                <span className="text-gray-600 whitespace-nowrap">
                  {r.error ? (
                    <span className="text-red-600">Error: {r.error}</span>
                  ) : (
                    `${r.enrolledCount} enrolled, ${r.alreadyEnrolledCount} already, ${r.matchedCount} matched`
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          {(results || error) && (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Reset
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            disabled={loading}
          >
            {results ? "Close" : "Cancel"}
          </button>
          {!results && (
            <button
              type="button"
              onClick={handleExcelUpload}
              disabled={loading || !file}
              className="rounded-lg bg-[#0B2A4A] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Processing…" : "Assign"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
