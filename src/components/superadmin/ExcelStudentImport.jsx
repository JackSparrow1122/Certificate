import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebase/config";
import {
  writeBatch,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { codeToDocId } from "../../utils/projectCodeUtils";
import { getStudentsByProject } from "../../../services/studentService";
import { upsertStudentLoginUser } from "../../../services/userService";
import {
  enrollStudentsIntoCertificate,
  getAllCertificates,
} from "../../../services/certificateService";

const REQUIRED_HEADERS = [
  "SN",
  "FULL NAME OF STUDENT",
  "EMAIL_ID",
  "EXAM_CODE",
  "MOBILE NO.",
  "BIRTH DATE",
  "GENDER",
  "HOMETOWN",
  "10th PASSING YR",
  "10th OVERALL MARKS %",
  "12th PASSING YR",
  "12th OVERALL MARKS %",
  "DIPLOMA COURSE",
  "DIPLOMA SPECIALIZATION",
  "DIPLOMA PASSING YR",
  "DIPLOMA OVERALL MARKS %",
  "GRADUATION COURSE",
  "GRADUATION SPECIALIZATION",
  "GRADUATION PASSING YR",
  "GRADUATION OVERALL MARKS %",
  "COURSE",
  "SPECIALIZATION",
  "PASSING YEAR",
  "OVERALL MARKS %",
];

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function normalizeExamCode(value) {
  return String(value || "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseExamCodes(value) {
  return String(value || "")
    .split(",")
    .map((code) => normalizeExamCode(code))
    .filter(Boolean);
}

function normalizeStudentEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeStudentPhone(value) {
  return String(value || "")
    .replace(/\D/g, "")
    .trim();
}

function generateStudentDocId(baseId = "student") {
  const normalizedBase = String(baseId || "student")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 100);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${normalizedBase || "student"}__${suffix}`;
}

function contactsMatchByEmailOrPhone(existingData, studentData) {
  const existingEmail = normalizeStudentEmail(
    existingData?.email || existingData?.OFFICIAL_DETAILS?.["EMAIL_ID"],
  );
  const existingPhone = normalizeStudentPhone(
    existingData?.phone || existingData?.OFFICIAL_DETAILS?.["MOBILE NO."],
  );
  const newEmail = normalizeStudentEmail(studentData?.email);
  const newPhone = normalizeStudentPhone(studentData?.phone);

  if (newEmail && existingEmail && newEmail === existingEmail) return true;
  if (newPhone && existingPhone && newPhone === existingPhone) return true;
  return false;
}

async function resolveStudentDocId(projectDocId, sn, email, phone) {
  const desiredId = String(sn || "").trim();
  const studentId = desiredId || generateStudentDocId();
  const studentRef = doc(db, "students", projectDocId, "students_list", studentId);
  const studentSnapshot = await getDoc(studentRef);

  if (!studentSnapshot.exists()) {
    return studentId;
  }

  const existingData = studentSnapshot.data() || {};
  const candidateId = studentId;
  if (contactsMatchByEmailOrPhone(existingData, { email, phone })) {
    return candidateId;
  }

  return generateStudentDocId(candidateId || email || phone);
}

function getYearNumberFromProjectCode(projectCodeValue) {
  const parts = String(projectCodeValue || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 3) return null;
  const match = parts[2].match(/\d+/);
  if (!match) return null;
  const yearNumber = Number(match[0]);
  return Number.isFinite(yearNumber) && yearNumber > 0 ? yearNumber : null;
}

function getAllowedSemestersForYear(projectCodeValue) {
  const yearNumber = getYearNumberFromProjectCode(projectCodeValue);
  if (!yearNumber) return [];
  const first = yearNumber * 2 - 1;
  const second = yearNumber * 2;
  return [first, second];
}

// After building a headerMap, alias legacy column names to their current equivalents.
// Handles Excel/CSV files still exported with "EMAIL ID" (space) as the column header.
function applyHeaderAliases(headerMap) {
  if (headerMap["EMAIL ID"] && !headerMap["EMAIL_ID"]) {
    headerMap["EMAIL_ID"] = headerMap["EMAIL ID"];
  }
  if (headerMap["EMAIL ID."] && !headerMap["EMAIL_ID."]) {
    headerMap["EMAIL_ID."] = headerMap["EMAIL ID."];
  }
  if (headerMap["EXAM CODE"] && !headerMap["EXAM_CODE"]) {
    headerMap["EXAM_CODE"] = headerMap["EXAM CODE"];
  }
  if (headerMap["EXAM-CODE"] && !headerMap["EXAM_CODE"]) {
    headerMap["EXAM_CODE"] = headerMap["EXAM-CODE"];
  }
  if (headerMap["EXAMCODE"] && !headerMap["EXAM_CODE"]) {
    headerMap["EXAM_CODE"] = headerMap["EXAMCODE"];
  }
  if (headerMap["EXAM CODES"] && !headerMap["EXAM_CODE"]) {
    headerMap["EXAM_CODE"] = headerMap["EXAM CODES"];
  }
  return headerMap;
}

// Allow "EMAIL ID" (legacy) to count as satisfying the "EMAIL_ID" requirement.
function resolveHeadersForValidation(normalizedHeaders) {
  const resolved = [...normalizedHeaders];
  if (resolved.includes("EMAIL ID") && !resolved.includes("EMAIL_ID")) {
    resolved.push("EMAIL_ID");
  }

  const examAliases = ["EXAM CODE", "EXAM-CODE", "EXAMCODE", "EXAM CODES"];
  if (
    examAliases.some((header) => resolved.includes(header)) &&
    !resolved.includes("EXAM_CODE")
  ) {
    resolved.push("EXAM_CODE");
  }

  return resolved;
}

function buildNested(obj, keyMap) {
  const out = {};
  Object.entries(keyMap).forEach(([outKey, inKey]) => {
    const val = obj[inKey];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      out[outKey] = typeof val === "string" ? val.trim() : val;
    }
  });
  return Object.keys(out).length ? out : null;
}

export function ExcelStudentImport({ projectCode, onStudentAdded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [missingColumns, setMissingColumns] = useState([]);
  const [duplicateSummary, setDuplicateSummary] = useState(null);
  const [skippedEntries, setSkippedEntries] = useState([]);
  const [success, setSuccess] = useState(null);
  const [selectedSemester, setSelectedSemester] = useState("");
  const [skippedExamCodeRows, setSkippedExamCodeRows] = useState([]);

  const allowedSemesters = useMemo(
    () => getAllowedSemestersForYear(projectCode),
    [projectCode],
  );

  useEffect(() => {
    if (
      !allowedSemesters.length ||
      !allowedSemesters.includes(Number(selectedSemester || 0))
    ) {
      setSelectedSemester("");
    }
  }, [allowedSemesters, selectedSemester]);

  const handleFile = async (file) => {
    setLoading(true);
    setError(null);
    setMissingColumns([]);
    setDuplicateSummary(null);
    setSkippedEntries([]);
    setSkippedExamCodeRows([]);
    setSuccess(null);

    const semesterNumber = Number(selectedSemester || 0);
    if (
      !Number.isFinite(semesterNumber) ||
      semesterNumber <= 0 ||
      !allowedSemesters.includes(semesterNumber)
    ) {
      setError("Select semester before bulk upload.");
      setLoading(false);
      return;
    }

    try {
      const fileName = String(file.name || "").toLowerCase();
      const isCsv = fileName.endsWith(".csv");

      if (isCsv) {
        const text = await file.text();
        const rows = parseCsvToObjects(text);
        if (!rows || rows.length === 0) {
          throw new Error("CSV is empty");
        }

        const headers = resolveHeadersForValidation(
          Object.keys(rows[0]).map(normalizeHeader),
        );
        const missing = REQUIRED_HEADERS.filter(
          (h) => !headers.includes(normalizeHeader(h)),
        );

        if (missing.length > 0) {
          setMissingColumns(missing);
          setError(`Found ${missing.length} missing required column(s).`);
          setLoading(false);
          return;
        }

        const headerMap = {};
        Object.keys(rows[0]).forEach((orig) => {
          headerMap[normalizeHeader(orig)] = orig;
        });
        applyHeaderAliases(headerMap);

        await detectAndImport({
          rows,
          headerMap,
          projectCode,
          semesterNumber,
          onStudentAdded,
          setLoading,
          setError,
          setSuccess,
        });
        return;
      }

      const xlsxModule = await import(/* @vite-ignore */ "xlsx");
      const data = await file.arrayBuffer();
      const workbook = xlsxModule.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Read formatted cell text so Excel dates stay as displayed (e.g., 24-May-02).
      const rowsArr = xlsxModule.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        raw: false,
      });
      if (!rowsArr || rowsArr.length === 0) {
        throw new Error("Excel is empty");
      }

      // Find best header row: choose row which matches the most REQUIRED_HEADERS
      let bestIdx = -1;
      let bestMatches = 0;
      for (let i = 0; i < Math.min(rowsArr.length, 5); i++) {
        const row = rowsArr[i] || [];
        const normalized = row.map((c) => normalizeHeader(c));
        const matches = REQUIRED_HEADERS.filter((h) =>
          normalized.includes(normalizeHeader(h)),
        ).length;
        if (matches > bestMatches) {
          bestMatches = matches;
          bestIdx = i;
        }
      }

      // If no header row found in first 5 rows, try using first row as before
      if (bestIdx === -1 || bestMatches === 0) {
        const rows = xlsxModule.utils.sheet_to_json(sheet, {
          defval: null,
          raw: false,
        });
        if (!rows || rows.length === 0) {
          throw new Error("Excel is empty");
        }

        const headers = resolveHeadersForValidation(
          Object.keys(rows[0]).map(normalizeHeader),
        );
        const missing = REQUIRED_HEADERS.filter(
          (h) => !headers.includes(normalizeHeader(h)),
        );

        if (missing.length > 0) {
          setMissingColumns(missing);
          setError(`Found ${missing.length} missing required column(s).`);
          setLoading(false);
          return;
        }

        // build headerMap
        const headerMap = {};
        Object.keys(rows[0]).forEach((orig) => {
          headerMap[normalizeHeader(orig)] = orig;
        });
        applyHeaderAliases(headerMap);

        // Duplicate detection before importing (email & phone)
        await detectAndImport({
          rows,
          headerMap,
          projectCode,
          semesterNumber,
          onStudentAdded,
          setLoading,
          setError,
          setSuccess,
        });
        return;
      }

      // Build header map from detected header row
      const headerCells = rowsArr[bestIdx].map((c) =>
        c === null ? "" : String(c),
      );
      const headerMap = {};
      headerCells.forEach((orig) => {
        headerMap[normalizeHeader(orig)] = orig;
      });
      applyHeaderAliases(headerMap);

      // Check for missing columns
      const resolvedMapKeys = resolveHeadersForValidation(
        Object.keys(headerMap),
      );
      const missing = REQUIRED_HEADERS.filter(
        (h) =>
          !resolvedMapKeys.some(
            (key) => normalizeHeader(key) === normalizeHeader(h),
          ),
      );

      if (missing.length > 0) {
        setMissingColumns(missing);
        setError(`Found ${missing.length} missing required column(s).`);
        setLoading(false);
        return;
      }

      // Build data rows starting after header row
      const dataRows = rowsArr.slice(bestIdx + 1).map((r) => {
        const obj = {};
        headerCells.forEach((h, i) => {
          obj[h] = r[i] === undefined ? null : r[i];
        });
        return obj;
      });

      await detectAndImport({
        rows: dataRows,
        headerMap,
        projectCode,
        semesterNumber,
        onStudentAdded,
        setLoading,
        setError,
        setSuccess,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to process file");
      setLoading(false);
    }
  };

  // Helper: detect duplicates within excel and against DB, then import non-duplicates
  async function detectAndImport({
    rows,
    headerMap,
    projectCode,
    semesterNumber,
    onStudentAdded,
    setLoading,
    setError,
    setSuccess,
  }) {
    try {
      // Primary keys
      const emailKey = headerMap[normalizeHeader("EMAIL_ID")] || "EMAIL_ID";
      const phoneKey = headerMap[normalizeHeader("MOBILE NO.")] || "MOBILE NO.";
      const examCodeKey =
        headerMap[normalizeHeader("EXAM_CODE")] || "EXAM_CODE";
      const nameKey =
        headerMap[normalizeHeader("FULL NAME OF STUDENT")] ||
        "FULL NAME OF STUDENT";
      const snKey = headerMap[normalizeHeader("SN")] || "SN";

      // Fetch existing students for this project
      let existingEmails = new Set();
      let existingPhones = new Set();
      try {
        if (projectCode) {
          const existing = await getStudentsByProject(projectCode, {
            maxDocs: 1500,
          });
          existing.forEach((s) => {
            const e = s.OFFICIAL_DETAILS?.["EMAIL_ID"] || s.email || null;
            const p = s.OFFICIAL_DETAILS?.["MOBILE NO."] || s.phone || null;
            if (e) existingEmails.add(String(e).trim().toLowerCase());
            if (p) existingPhones.add(String(p).trim());
          });
        }
      } catch (err) {
        console.warn(
          "Failed to fetch existing students for duplicate check:",
          err,
        );
      }

      const seenEmails = new Set();
      const seenPhones = new Set();
      const duplicatesExcel = [];
      const duplicatesDB = [];
      const missingMobileOrEmail = [];
      const missingExamCodeRows = [];
      const toImportRows = [];
      const rowsForAssignment = [];

      rows.forEach((row, idx) => {
        const rawEmail = row[emailKey];
        const rawPhone = row[phoneKey];
        const rawName = row[nameKey];
        const rawSn = row[snKey];
        const emailVal = rawEmail
          ? String(rawEmail).trim().toLowerCase()
          : null;
        const phoneVal = rawPhone ? String(rawPhone).trim() : null;
        const nameVal = rawName ? String(rawName).trim() : "-";
        const snVal = rawSn ? String(rawSn).trim() : "-";
        const examCodes = parseExamCodes(row[examCodeKey]);

        if (!emailVal) {
          missingMobileOrEmail.push({
            row: idx + 1,
            sn: snVal,
            name: nameVal,
            missing: "Email",
          });
          return;
        }

        if (examCodes.length === 0) {
          missingExamCodeRows.push({
            row: idx + 1,
            sn: snVal,
            name: nameVal,
          });
          return;
        }

        rowsForAssignment.push(row);

        if (!phoneVal) {
          missingMobileOrEmail.push({
            row: idx + 1,
            sn: snVal,
            name: nameVal,
            missing: "Mobile",
          });
          return;
        }

        let isDup = false;
        if (emailVal) {
          if (existingEmails.has(emailVal)) {
            duplicatesDB.push({ type: "email", value: emailVal, row: idx + 1 });
            isDup = true;
          } else if (seenEmails.has(emailVal)) {
            duplicatesExcel.push({
              type: "email",
              value: emailVal,
              row: idx + 1,
            });
            isDup = true;
          }
        }
        if (phoneVal) {
          if (existingPhones.has(phoneVal)) {
            duplicatesDB.push({ type: "phone", value: phoneVal, row: idx + 1 });
            isDup = true;
          } else if (seenPhones.has(phoneVal)) {
            duplicatesExcel.push({
              type: "phone",
              value: phoneVal,
              row: idx + 1,
            });
            isDup = true;
          }
        }

        if (!isDup) {
          toImportRows.push(row);
          if (emailVal) seenEmails.add(emailVal);
          if (phoneVal) seenPhones.add(phoneVal);
        }
      });

      setSkippedEntries(missingMobileOrEmail);
      setSkippedExamCodeRows(missingExamCodeRows);
      if (missingMobileOrEmail.length > 0) {
        const shouldProceed = window.confirm(
          `${missingMobileOrEmail.length} student entr${missingMobileOrEmail.length > 1 ? "ies are" : "y is"} missing Mobile/Email and will be skipped.\nContinue with remaining entries?`,
        );

        if (!shouldProceed) {
          setError("Import cancelled due to missing Mobile/Email entries.");
          setLoading(false);
          return;
        }
      }

      setDuplicateSummary({
        totalRows: rows.length,
        toImport: toImportRows.length,
        skippedExcel: duplicatesExcel.length,
        skippedDB: duplicatesDB.length,
        examplesExcel: duplicatesExcel.slice(0, 10),
        examplesDB: duplicatesDB.slice(0, 10),
      });

      // Proceed to import non-duplicates
      await processRows(
        toImportRows,
        headerMap,
        projectCode,
        setError,
        setSuccess,
      );

      const assignmentSummary = await assignCertificatesFromRows({
        rows: rowsForAssignment,
        headerMap,
        projectCode,
        semesterNumber,
      });

      if (assignmentSummary.unmatchedExamCodes.length > 0) {
        setError(
          `Unmatched EXAM_CODE values: ${assignmentSummary.unmatchedExamCodes.join(", ")}`,
        );
      }

      setSuccess((prev) => {
        const base = String(prev || "✅ Import complete").trim();
        return `${base}. Certificates assigned: ${assignmentSummary.assignedCount}${
          assignmentSummary.alreadyEnrolledCount
            ? `, already enrolled: ${assignmentSummary.alreadyEnrolledCount}`
            : ""
        }`;
      });
      onStudentAdded?.(true);
      setLoading(false);
    } catch (e) {
      console.error(e);
      const isXlsxImportError = String(e?.message || "").includes(
        "Failed to resolve module specifier",
      );
      setError(
        isXlsxImportError
          ? "XLSX parser not available in this environment. Please import CSV for now."
          : e.message || "Failed during duplicate detection/import",
      );
      onStudentAdded?.(false);
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#0B2A4A]">
            Semester (required)
          </label>
          <select
            value={selectedSemester}
            onChange={(event) => setSelectedSemester(event.target.value)}
            className="h-10 w-full rounded-lg border border-[#CBD8EA] bg-white px-3 text-sm text-[#0B2A4A] outline-none focus:border-[#0B2A4A]"
            disabled={loading || allowedSemesters.length === 0}
          >
            {allowedSemesters.length === 0 ? (
              <option value="">
                No semester options for this project code
              </option>
            ) : (
              <>
                <option value="">Select semester</option>
                {allowedSemesters.map((semester) => (
                  <option key={semester} value={String(semester)}>
                    Semester {semester}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition">
          <span>{loading ? "⏳ Processing..." : "📁 Select Excel File"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) =>
              e.target.files?.[0] && handleFile(e.target.files[0])
            }
            className="hidden"
            disabled={loading}
          />
        </label>
      </div>

      {/* Missing Columns Display */}
      {missingColumns.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-300 p-4">
          <p className="font-semibold text-red-900 mb-3">
            ⚠️ Missing {missingColumns.length} Required Column(s):
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {missingColumns.map((col, idx) => (
              <li
                key={idx}
                className="text-red-700 text-sm flex items-start gap-2"
              >
                <span className="text-red-500 font-bold">•</span>
                <span className="font-mono">{col}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Duplicate Summary Display */}
      {duplicateSummary && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-300 p-4">
          <p className="font-semibold text-yellow-900 mb-2">
            ⚠️ Duplicate Check
          </p>
          <p className="text-sm text-yellow-800 mb-2">
            Found {duplicateSummary.skippedExcel + duplicateSummary.skippedDB}{" "}
            possible duplicate(s). {duplicateSummary.toImport} rows will be
            imported out of {duplicateSummary.totalRows}.
          </p>
          {duplicateSummary.examplesExcel.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-yellow-800">
                Examples - duplicates within Excel:
              </p>
              <ul className="text-xs font-mono text-yellow-700">
                {duplicateSummary.examplesExcel.map((d, i) => (
                  <li key={i}>
                    {d.type}: {d.value} (row {d.row})
                  </li>
                ))}
              </ul>
            </div>
          )}
          {duplicateSummary.examplesDB.length > 0 && (
            <div>
              <p className="text-xs font-medium text-yellow-800">
                Examples - duplicates in database:
              </p>
              <ul className="text-xs font-mono text-yellow-700">
                {duplicateSummary.examplesDB.map((d, i) => (
                  <li key={i}>
                    {d.type}: {d.value} (row {d.row})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {skippedEntries.length > 0 && (
        <div className="rounded-lg bg-orange-50 border border-orange-300 p-4">
          <p className="font-semibold text-orange-900 mb-2">
            Skipped Entries (Missing Mobile/Email): {skippedEntries.length}
          </p>
          <ul className="text-xs font-mono text-orange-800 max-h-40 overflow-auto space-y-1">
            {skippedEntries.slice(0, 25).map((entry, idx) => (
              <li key={`${entry.row}-${idx}`}>
                row {entry.row} | SN: {entry.sn} | Name: {entry.name} | Missing:{" "}
                {entry.missing}
              </li>
            ))}
          </ul>
          {skippedEntries.length > 25 && (
            <p className="mt-2 text-xs text-orange-700">
              Showing first 25 skipped entries.
            </p>
          )}
        </div>
      )}

      {skippedExamCodeRows.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 p-4">
          <p className="font-semibold text-amber-900 mb-2">
            Skipped Entries (Missing EXAM_CODE): {skippedExamCodeRows.length}
          </p>
          <ul className="text-xs font-mono text-amber-800 max-h-36 overflow-auto space-y-1">
            {skippedExamCodeRows.slice(0, 25).map((entry, idx) => (
              <li key={`${entry.row}-${idx}`}>
                row {entry.row} | SN: {entry.sn} | Name: {entry.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Error Message */}
      {error && missingColumns.length === 0 && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">
          ❌ {error}
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="text-green-700 text-sm bg-green-50 p-3 rounded-lg border border-green-200">
          ✅ {success}
        </div>
      )}
    </div>
  );
}

function parseCsvToObjects(csvText) {
  const lines = parseCsvLines(csvText || "");
  if (!lines.length) return [];

  const headers = lines[0].map((cell) => String(cell || "").trim());
  return lines
    .slice(1)
    .filter((line) => line.some((cell) => String(cell || "").trim() !== ""))
    .map((line) => {
      const rowObj = {};
      headers.forEach((header, idx) => {
        rowObj[header] = line[idx] ?? null;
      });
      return rowObj;
    });
}

function parseCsvLines(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    if (row.length > 0) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i += 1;
      pushCell();
      pushRow();
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  return rows;
}

const WRITE_BATCH_LIMIT = 400;
const AUTH_CONCURRENCY = 1;
const AUTH_CHUNK_DELAY_MS = 0;

function pauseMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function processInChunks(items, chunkSize, handler, delayMs = 0) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await handler(chunk, i / chunkSize);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await pauseMainThread();
  }
}

async function processRows(
  rows,
  headerMap,
  projectCode,
  setError,
  setSuccess,
) {
  try {
    let successCount = 0;
    let failedCount = 0;
    let loginCreatedCount = 0;
    let loginUpdatedCount = 0;
    const loginFailures = [];

    // Convert project code to document ID (replace "/" with "-")
    const projectDocId = codeToDocId(projectCode);
    const collegeCode = String(projectCode || "").split("/")[0] || "";
    const loginCandidates = [];

    await processInChunks(
      rows,
      WRITE_BATCH_LIMIT,
      async (rowChunk, chunkIndex) => {
        const batch = writeBatch(db);

        if (chunkIndex === 0) {
          const projectDocRef = doc(db, "students", projectDocId);
          batch.set(
            projectDocRef,
            {
              projectCode,
              collegeCode,
              isActive: true,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }

        for (const row of rowChunk) {
          try {
            const official = buildNested(row, {
              SN: headerMap["SN"] || "SN",
              "FULL NAME OF STUDENT":
                headerMap["FULL NAME OF STUDENT"] || "FULL NAME OF STUDENT",
              EMAIL_ID: headerMap["EMAIL_ID"] || "EMAIL_ID",
              "MOBILE NO.": headerMap["MOBILE NO."] || "MOBILE NO.",
              "BIRTH DATE": headerMap["BIRTH DATE"] || "BIRTH DATE",
              GENDER: headerMap["GENDER"] || "GENDER",
              HOMETOWN: headerMap["HOMETOWN"] || "HOMETOWN",
            });

            const tenth = buildNested(row, {
              "10th PASSING YR":
                headerMap["10th PASSING YR"] || "10th PASSING YR",
              "10th OVERALL MARKS %":
                headerMap["10th OVERALL MARKS %"] || "10th OVERALL MARKS %",
            });

            const twelfth = buildNested(row, {
              "12th PASSING YR":
                headerMap["12th PASSING YR"] || "12th PASSING YR",
              "12th OVERALL MARKS %":
                headerMap["12th OVERALL MARKS %"] || "12th OVERALL MARKS %",
            });

            const diploma = buildNested(row, {
              "DIPLOMA COURSE": headerMap["DIPLOMA COURSE"] || "DIPLOMA COURSE",
              "DIPLOMA SPECIALIZATION":
                headerMap["DIPLOMA SPECIALIZATION"] || "DIPLOMA SPECIALIZATION",
              "DIPLOMA PASSING YR":
                headerMap["DIPLOMA PASSING YR"] || "DIPLOMA PASSING YR",
              "DIPLOMA OVERALL MARKS %":
                headerMap["DIPLOMA OVERALL MARKS %"] ||
                "DIPLOMA OVERALL MARKS %",
            });

            const graduation = buildNested(row, {
              "GRADUATION COURSE":
                headerMap["GRADUATION COURSE"] || "GRADUATION COURSE",
              "GRADUATION SPECIALIZATION":
                headerMap["GRADUATION SPECIALIZATION"] ||
                "GRADUATION SPECIALIZATION",
              "GRADUATION PASSING YR":
                headerMap["GRADUATION PASSING YR"] || "GRADUATION PASSING YR",
              "GRADUATION OVERALL MARKS %":
                headerMap["GRADUATION OVERALL MARKS %"] ||
                "GRADUATION OVERALL MARKS %",
            });

            const postGrad = buildNested(row, {
              COURSE: headerMap["COURSE"] || "COURSE",
              SPECIALIZATION: headerMap["SPECIALIZATION"] || "SPECIALIZATION",
              "PASSING YEAR": headerMap["PASSING YEAR"] || "PASSING YEAR",
              "OVERALL MARKS %":
                headerMap["OVERALL MARKS %"] || "OVERALL MARKS %",
            });

            const docBody = {};
            if (official) docBody.OFFICIAL_DETAILS = official;
            if (tenth) docBody.TENTH_DETAILS = tenth;
            if (twelfth) docBody.TWELFTH_DETAILS = twelfth;
            if (diploma) docBody.DIPLOMA_DETAILS = diploma;
            if (graduation) docBody.GRADUATION_DETAILS = graduation;
            if (postGrad) docBody.POST_GRADUATION_DETAILS = postGrad;

            if (projectCode) docBody.projectCode = projectCode;
            docBody.collegeCode = collegeCode;
            docBody.isActive = true;

            const rawSn = official && official.SN ? String(official.SN) : undefined;
            if (!rawSn) {
              failedCount++;
              continue;
            }

            const email =
              official && official["EMAIL_ID"]
                ? String(official["EMAIL_ID"]).trim().toLowerCase()
                : "";
            const phone = official ? official["MOBILE NO."] : "";
            const resolvedStudentId = await resolveStudentDocId(
              projectDocId,
              rawSn,
              email,
              phone,
            );

            docBody.createdAt = serverTimestamp();
            docBody.updatedAt = serverTimestamp();

            const studentDocRef = doc(
              db,
              "students",
              projectDocId,
              "students_list",
              resolvedStudentId,
            );
            batch.set(studentDocRef, docBody, { merge: true });

            loginCandidates.push({
              studentId: resolvedStudentId,
              name:
                official && official["FULL NAME OF STUDENT"]
                  ? String(official["FULL NAME OF STUDENT"])
                  : "",
              email,
              mobile: phone,
              projectCode,
              collegeCode,
            });

            successCount++;
          } catch (e) {
            console.error("Failed to import row", e);
            failedCount++;
          }
        }

        await batch.commit();
      },
    );

    await processInChunks(
      loginCandidates,
      AUTH_CONCURRENCY,
      async (loginChunk) => {
        const results = await Promise.allSettled(
          loginChunk.map((student) => upsertStudentLoginUser(student)),
        );

        results.forEach((result, index) => {
          const student = loginChunk[index];
          if (result.status === "fulfilled") {
            if (result.value?.skippedExisting) {
              loginUpdatedCount++;
            } else {
              loginCreatedCount++;
            }
            return;
          }

          const loginError = result.reason;
          loginFailures.push({
            studentId: student?.studentId || "-",
            email: student?.email || "-",
            reason: loginError?.message || "Student login creation failed",
          });
        });
      },
      AUTH_CHUNK_DELAY_MS,
    );

    setSuccess(
      `✅ Imported ${successCount} students${
        failedCount ? `, ${failedCount} failed` : ""
      }. Student login created for ${loginCreatedCount}${ loginUpdatedCount ? `, ${loginUpdatedCount} updated (email already existed)` : "" }${loginFailures.length ? `, ${loginFailures.length} login failed` : ""}`,
    );

    if (loginFailures.length > 0) {
      setError(
        `Student login creation failed for: ${loginFailures
          .slice(0, 10)
          .map((item) => `${item.studentId} (${item.email})`)
          .join(", ")}${loginFailures.length > 10 ? " ..." : ""}`,
      );
    }
  } catch (e) {
    console.error(e);
    setError(e.message || "Failed to process rows");
  }
}

async function assignCertificatesFromRows({
  rows,
  headerMap,
  projectCode,
  semesterNumber,
}) {
  const emailKey = headerMap[normalizeHeader("EMAIL_ID")] || "EMAIL_ID";
  const examCodeKey = headerMap[normalizeHeader("EXAM_CODE")] || "EXAM_CODE";

  const certificates = await getAllCertificates({ includeInactive: true });
  const certificateByExamCode = new Map();
  (certificates || []).forEach((certificate) => {
    const normalizedCode = normalizeExamCode(certificate?.examCode || "");
    if (!normalizedCode) return;
    certificateByExamCode.set(normalizedCode, certificate);
  });

  const emailsByCertificate = new Map();
  const unmatchedExamCodes = new Set();

  (rows || []).forEach((row) => {
    const email = String(row?.[emailKey] || "")
      .trim()
      .toLowerCase();
    if (!email) return;

    const parsedCodes = parseExamCodes(row?.[examCodeKey]);
    parsedCodes.forEach((examCode) => {
      const certificate = certificateByExamCode.get(examCode);
      if (!certificate?.id) {
        unmatchedExamCodes.add(examCode);
        return;
      }
      if (!emailsByCertificate.has(certificate.id)) {
        emailsByCertificate.set(certificate.id, {
          certificate,
          emails: new Set(),
        });
      }
      emailsByCertificate.get(certificate.id).emails.add(email);
    });
  });

  let assignedCount = 0;
  let alreadyEnrolledCount = 0;

  for (const entry of emailsByCertificate.values()) {
    const result = await enrollStudentsIntoCertificate({
      certificateId: entry.certificate.id,
      certificateName: entry.certificate.name || "",
      examCode: entry.certificate.examCode || "",
      projectCode,
      studentEmails: Array.from(entry.emails),
      assignedSemesterNumber: semesterNumber,
    });
    assignedCount += Number(result?.enrolledCount || 0);
    alreadyEnrolledCount += Number(result?.alreadyEnrolledCount || 0);
  }

  return {
    assignedCount,
    alreadyEnrolledCount,
    unmatchedExamCodes: Array.from(unmatchedExamCodes),
  };
}


