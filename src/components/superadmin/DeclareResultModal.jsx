import { useState, useEffect } from "react";
import { read, utils } from "xlsx";
import {
  getEnrolledProjectCodesForCertificate,
  declareResultsForCertificate,
} from "../../../services/certificateService";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

export default function DeclareResultModal({
  certificate,
  onClose,
  onResultDeclared,
}) {
  const [step, setStep] = useState("select"); // "select" | "upload" | "confirm" | "processing"
  const [selectedProjectCodes, setSelectedProjectCodes] = useState([]);
  const [projectCodes, setProjectCodes] = useState([]);
  const [excelData, setExcelData] = useState(null); // { emails, statuses }
  const [resultSummary, setResultSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch project codes that have students enrolled in this certificate
  useEffect(() => {
    const fetchEnrolledProjectCodes = async () => {
      setLoading(true);
      setError(null);
      try {
        const codes = await getEnrolledProjectCodesForCertificate(
          certificate.id,
        );
        setProjectCodes(codes);
        if (codes.length === 0) {
          setError(
            "No project codes have students enrolled in this certificate",
          );
        }
      } catch (err) {
        setError("Failed to fetch enrolled project codes");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchEnrolledProjectCodes();
  }, [certificate.id]);

  // Step 2: Handle Excel file upload with emails and optional status
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

      // Find email column (required)
      const emailKey = Object.keys(rows[0]).find((k) =>
        k.toLowerCase().includes("email"),
      );

      if (!emailKey) {
        setError("Excel file must contain an EMAIL column");
        setLoading(false);
        return;
      }

      // Find status column (optional) - look for pass/fail related headers
      const statusKey = Object.keys(rows[0]).find(
        (k) =>
          k.toLowerCase().includes("status") ||
          k.toLowerCase().includes("result") ||
          k.toLowerCase().includes("pass"),
      );

      // Extract emails and statuses
      const emailMap = new Map(); // email -> status (or null)

      rows.forEach((row) => {
        const email = String(row[emailKey] || "")
          .trim()
          .toLowerCase();

        if (email) {
          let status = null;
          if (statusKey) {
            const statusValue = String(row[statusKey] || "").toLowerCase();
            status =
              statusValue.includes("pass") || statusValue.includes("yes")
                ? "passed"
                : statusValue.includes("fail") || statusValue.includes("no")
                  ? "failed"
                  : null;
          }
          emailMap.set(email, status);
        }
      });

      if (emailMap.size === 0) {
        setError("No valid emails found in Excel");
        setLoading(false);
        return;
      }

      setExcelData({
        emails: Array.from(emailMap.keys()),
        emailMap,
        hasStatus: !!statusKey,
      });
      setStep("confirm");
    } catch (err) {
      setError("Failed to parse Excel file");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Process results — use certificate_enrollments subcollection
  const handleDeclareResult = async () => {
    if (selectedProjectCodes.length === 0) {
      setError("Select at least one project code");
      return;
    }
    if (!excelData || excelData.emails.length === 0) {
      setError("Upload a valid Excel with student emails");
      return;
    }

    setStep("processing");
    setLoading(true);
    setError(null);

    try {
      // Build emailStatusMap for the service function
      const emailStatusMap = new Map();
      for (const [email, status] of excelData.emailMap.entries()) {
        if (excelData.hasStatus) {
          emailStatusMap.set(email, status || "failed");
        } else {
          // email present = passed
          emailStatusMap.set(email, "passed");
        }
      }

      const result = await declareResultsForCertificate({
        certificateId: certificate.id,
        certificateName: certificate.name,
        projectCodes: selectedProjectCodes,
        emailStatusMap,
        defaultStatus: "failed",
      });

      setResultSummary({
        passedCount: result.passedCount,
        failedCount: result.failedCount,
        projectCodes: selectedProjectCodes,
      });

      setStep("complete");
      notifySuperAdminSuccess("Result declared");
      onResultDeclared?.();
    } catch (err) {
      setError("Failed to declare results");
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
          <h2 className="text-xl font-semibold">
            {step === "select" && "Select Project Codes"}
            {step === "upload" && "Upload Result Excel"}
            {step === "confirm" && "Confirm Results"}
            {step === "processing" && "Processing Results"}
            {step === "complete" && "Results Declared"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Select Project Codes */}
        {step === "select" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Select project codes to declare results for:
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 rounded p-3 bg-gray-50">
              {projectCodes.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No project codes enrolled for this certificate
                </p>
              ) : (
                projectCodes.map((code) => (
                  <label
                    key={code}
                    className="flex items-center gap-2 cursor-pointer p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedProjectCodes.includes(code)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProjectCodes([
                            ...selectedProjectCodes,
                            code,
                          ]);
                        } else {
                          setSelectedProjectCodes(
                            selectedProjectCodes.filter((c) => c !== code),
                          );
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium">{code}</span>
                  </label>
                ))
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep("upload")}
                disabled={selectedProjectCodes.length === 0 || loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Upload Result Excel */}
        {step === "upload" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
              <p className="font-medium mb-2">Excel Format Requirements:</p>
              <ul className="space-y-1 text-xs">
                <li>✓ Required: Column with "email" in header</li>
                <li>
                  ✓ Optional: Column with "status" containing "pass"/"fail"
                </li>
                <li>
                  • If no status column: emails present = passed, absent =
                  failed
                </li>
                <li>• If status column: use it to determine result</li>
              </ul>
            </div>

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

            {excelData && (
              <div className="bg-green-50 border border-green-200 p-3 rounded">
                <p className="text-sm font-medium text-green-800">
                  ✓ Extracted {excelData.emails.length} email(s)
                  {excelData.hasStatus && " + Status column found"}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setStep("select");
                  setExcelData(null);
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep("confirm")}
                disabled={!excelData || loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50"
              >
                {loading ? "Processing..." : "Next"}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm & Process */}
        {step === "confirm" && !resultSummary && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded">
              <p className="text-sm font-medium text-blue-800 mb-3">Summary:</p>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>
                  <strong>Project Codes:</strong> {selectedProjectCodes.length}{" "}
                  selected
                </li>
                <li>
                  <strong>Students to process:</strong>{" "}
                  {excelData?.emails.length} emails in Excel
                </li>
                {excelData?.hasStatus && (
                  <li className="text-green-700">
                    <strong>Status:</strong> Using status column from Excel
                  </li>
                )}
                {!excelData?.hasStatus && (
                  <li className="text-amber-700">
                    <strong>Status:</strong> Emails present = passed, absent =
                    failed
                  </li>
                )}
              </ul>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                onClick={() => {
                  setStep("upload");
                }}
                disabled={loading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleDeclareResult}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md disabled:opacity-50"
              >
                {loading ? "Processing..." : "Declare Results"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results Complete */}
        {step === "complete" && resultSummary && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 p-4 rounded">
              <p className="text-lg font-semibold text-green-800 mb-3">
                ✓ Results Successfully Declared
              </p>
              <ul className="text-sm text-green-700 space-y-2">
                <li>
                  <strong>Project Codes:</strong>{" "}
                  {resultSummary.projectCodes.length} processed
                </li>
                <li>
                  <strong>Students Passed:</strong>{" "}
                  <span className="font-bold text-lg">
                    {resultSummary.passedCount}
                  </span>
                </li>
                <li>
                  <strong>Students Failed:</strong>{" "}
                  <span className="font-bold text-lg">
                    {resultSummary.failedCount}
                  </span>
                </li>
              </ul>
            </div>

            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md"
            >
              Close
            </button>
          </div>
        )}

        {/* Processing State */}
        {step === "processing" && (
          <div className="space-y-4 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto"></div>
            <p className="text-gray-600">
              Processing results for {selectedProjectCodes.length} project
              code(s)...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
