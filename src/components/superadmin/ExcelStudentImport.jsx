import { useState } from "react";
import { db } from "../../firebase/config";
import { writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { codeToDocId } from "../../utils/projectCodeUtils";
import { getStudentsByProject } from "../../../services/studentService";
import { createStudentAuthUser } from "../../../services/userService";

const REQUIRED_HEADERS = [
  "SN",
  "FULL NAME OF STUDENT",
  "EMAIL ID",
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

  const handleFile = async (file) => {
    setLoading(true);
    setError(null);
    setMissingColumns([]);
    setSkippedEntries([]);
    setSuccess(null);

    try {
      const fileName = String(file.name || "").toLowerCase();
      const isCsv = fileName.endsWith(".csv");

      if (isCsv) {
        const text = await file.text();
        const rows = parseCsvToObjects(text);
        if (!rows || rows.length === 0) {
          throw new Error("CSV is empty");
        }

        const headers = Object.keys(rows[0]).map(normalizeHeader);
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

        await processRows(
          rows,
          headerMap,
          projectCode,
          onStudentAdded,
          setLoading,
          setError,
          setSuccess,
        );
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

        const headers = Object.keys(rows[0]).map(normalizeHeader);
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

        // Duplicate detection before importing (email & phone)
        await detectAndImport({
          rows,
          headerMap,
          projectCode,
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

      // Check for missing columns
      const missing = REQUIRED_HEADERS.filter(
        (h) =>
          !Object.keys(headerMap).some(
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
    onStudentAdded,
    setLoading,
    setError,
    setSuccess,
  }) {
    try {
      // Primary keys
      const emailKey = headerMap[normalizeHeader("EMAIL ID")] || "EMAIL ID";
      const phoneKey = headerMap[normalizeHeader("MOBILE NO.")] || "MOBILE NO.";
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
            maxDocs: 5000,
          });
          existing.forEach((s) => {
            const e = s.OFFICIAL_DETAILS?.["EMAIL ID"] || s.email || null;
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
      const toImportRows = [];

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

        if (!emailVal || !phoneVal) {
          missingMobileOrEmail.push({
            row: idx + 1,
            sn: snVal,
            name: nameVal,
            missing: `${!emailVal ? "Email" : ""}${!emailVal && !phoneVal ? ", " : ""}${!phoneVal ? "Mobile" : ""}`,
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
        onStudentAdded,
        setLoading,
        setError,
        setSuccess,
      );
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
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg bg-blue-500 hover:bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition">
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
const AUTH_CONCURRENCY = 10;

function pauseMainThread() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function processInChunks(items, chunkSize, handler) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await handler(chunk, i / chunkSize);
    await pauseMainThread();
  }
}

async function processRows(
  rows,
  headerMap,
  projectCode,
  onStudentAdded,
  setLoading,
  setError,
  setSuccess,
) {
  try {
    let successCount = 0;
    let failedCount = 0;
    let authCreatedCount = 0;
    let authSkippedExistingCount = 0;
    const authFailures = [];

    // Convert project code to document ID (replace "/" with "-")
    const projectDocId = codeToDocId(projectCode);
    const collegeCode = String(projectCode || "").split("/")[0] || "";
    const authCandidates = [];

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
              "EMAIL ID": headerMap["EMAIL ID"] || "EMAIL ID",
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

            const idVal =
              official && official.SN ? String(official.SN) : undefined;
            if (!idVal) {
              failedCount++;
              continue;
            }
            docBody.createdAt = serverTimestamp();
            docBody.updatedAt = serverTimestamp();

            const studentDocRef = doc(
              db,
              "students",
              projectDocId,
              "students_list",
              idVal,
            );
            batch.set(studentDocRef, docBody, { merge: true });

            authCandidates.push({
              studentId: idVal,
              name:
                official && official["FULL NAME OF STUDENT"]
                  ? String(official["FULL NAME OF STUDENT"])
                  : "",
              email:
                official && official["EMAIL ID"]
                  ? String(official["EMAIL ID"]).trim().toLowerCase()
                  : "",
              mobile: official ? official["MOBILE NO."] : "",
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
      authCandidates,
      AUTH_CONCURRENCY,
      async (authChunk) => {
        const results = await Promise.allSettled(
          authChunk.map((student) => createStudentAuthUser(student)),
        );

        results.forEach((result, index) => {
          const student = authChunk[index];
          if (result.status === "fulfilled") {
            if (result.value?.skippedExisting) {
              authSkippedExistingCount++;
            } else {
              authCreatedCount++;
            }
            return;
          }

          const authError = result.reason;
          authFailures.push({
            studentId: student?.studentId || "-",
            email: student?.email || "-",
            reason: authError?.message || "Auth creation failed",
          });
        });
      },
    );

    setSuccess(
      `✅ Imported ${successCount} students${
        failedCount ? `, ${failedCount} failed` : ""
      }. Auth created for ${authCreatedCount}${
        authSkippedExistingCount
          ? `, ${authSkippedExistingCount} skipped (email already in student_users)`
          : ""
      }${authFailures.length ? `, ${authFailures.length} auth failed` : ""}`,
    );

    if (authFailures.length > 0) {
      setError(
        `Auth creation failed for: ${authFailures
          .slice(0, 10)
          .map((item) => `${item.studentId} (${item.email})`)
          .join(", ")}${authFailures.length > 10 ? " ..." : ""}`,
      );
    }

    onStudentAdded?.(true);
  } catch (e) {
    console.error(e);
    setError(e.message || "Failed to process rows");
    onStudentAdded?.(false);
  } finally {
    setLoading(false);
  }
}
