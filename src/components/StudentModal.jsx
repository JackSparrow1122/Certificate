export default function StudentModal({ student, onClose }) {
  if (!student) return null;

  const projectCode = student.projectCode || student.projectId || "-";
  const currentYearFromCode = getCurrentYearFromProjectCode(projectCode);
  const certificateItems = getCertificateItems(student);

  const PRIMARY_KEYS = [
    ["Roll No", student.id || student.docId],
    [
      "Name",
      student.name || student?.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"],
    ],
    ["Gender", student.gender || student?.OFFICIAL_DETAILS?.GENDER],
    ["Date of Birth", student.dob || student?.OFFICIAL_DETAILS?.["BIRTH DATE"]],
    ["Project Code", projectCode],
    ["Email", student.email || student?.OFFICIAL_DETAILS?.["EMAIL_ID"]],
    ["Phone", student.phone || student?.OFFICIAL_DETAILS?.["MOBILE NO."]],
    [
      "Current Year",
      currentYearFromCode ||
        student.currentYear ||
        student.currentSemester ||
        student.semesterLabel,
    ],
    ["Passing Year", student.passingYear],
  ];

  const nestedSections = Object.entries(student).filter(([, value]) =>
    isPlainObject(value),
  );

  const seenKeys = new Set();
  const dedupeEntry = (label, value) => {
    if (!isDisplayableValue(value)) return false;
    const canonicalKey = toCanonicalKey(label);
    if (seenKeys.has(canonicalKey)) return false;
    seenKeys.add(canonicalKey);
    return true;
  };

  const primaryEntries = PRIMARY_KEYS.filter(([label, value]) =>
    dedupeEntry(label, value),
  );
  const nestedSectionEntries = nestedSections
    .map(([sectionKey, sectionValue]) => ({
      sectionKey,
      entries: Object.entries(sectionValue).filter(([label, value]) =>
        dedupeEntry(label, value),
      ),
    }))
    .filter((section) => section.entries.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* BACKDROP */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* MODAL */}
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400"
        >
          ✕
        </button>

        <div className="student-modal-scroll mt-12 max-h-[calc(90vh-3rem)] overflow-y-auto px-8 pb-8">
          {/* TITLE */}
          <h2 className="text-2xl font-semibold mb-6">Student Details</h2>

          <Section title="Primary Information">
            {primaryEntries.map(([label, value]) => (
              <Detail key={label} label={label} value={value} />
            ))}
          </Section>

          {certificateItems.length > 0 && (
            <Section title="Certificate Status">
              {certificateItems.map((item) => (
                <Detail
                  key={`${item.name}-${item.status}`}
                  label={item.name}
                  value={item.status}
                />
              ))}
            </Section>
          )}

          {nestedSectionEntries.map(({ sectionKey, entries }) => (
            <Section key={sectionKey} title={toLabel(sectionKey)}>
              {entries.map(([label, value]) => (
                <Detail
                  key={`${sectionKey}-${label}`}
                  label={toLabel(label)}
                  value={value}
                />
              ))}
            </Section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- REUSABLE UI ---------- */

function Section({ title, children }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 border-b pb-2">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-900">{toDisplayValue(value)}</p>
    </div>
  );
}

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value?.toDate !== "function",
  );
}

function isDisplayableValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return !isPlainObject(value);
  return true;
}

function toDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date?.getTime?.()) ? "-" : date.toLocaleString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function toLabel(key) {
  return String(key || "")
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCanonicalKey(label) {
  const normalized = String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[%._-]/g, " ")
    .replace(/\s+/g, " ");

  const aliases = {
    "FULL NAME OF STUDENT": "NAME",
    "STUDENT NAME": "NAME",
    SN: "ROLL NO",
    "MOBILE NO": "PHONE",
    "MOBILE NO.": "PHONE",
    "EMAIL_ID": "EMAIL",
    "EMAIL_ID.": "EMAIL",
    "BIRTH DATE": "DATE OF BIRTH",
    "CURRENT YEAR": "CURRENT YEAR",
    "CURRENT SEMESTER": "CURRENT YEAR",
    "CURRENT SEM YEAR": "CURRENT YEAR",
    "ADMISSION YEAR": "REMOVED_ADMISSION_YEAR",
  };

  return aliases[normalized] || normalized;
}

function getCurrentYearFromProjectCode(projectCode) {
  const parts = String(projectCode || "")
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
  return parts.length >= 3 ? parts[2] : "";
}

function normalizeStatus(status) {
  const value = String(status || "")
    .trim()
    .toLowerCase();
  if (["passed", "completed", "certified"].includes(value)) return "Passed";
  if (["failed"].includes(value)) return "Failed";
  return "Enrolled";
}

function getCertificateItems(student) {
  const resultMap =
    student?.certificateResults &&
    typeof student.certificateResults === "object"
      ? Object.values(student.certificateResults).filter((r) => !r?.isDeleted)
      : [];

  const items = resultMap
    .map((result) => ({
      name: String(result?.certificateName || "").trim(),
      status: normalizeStatus(result?.status || result?.result || "enrolled"),
    }))
    .filter((item) => item.name);

  if (items.length === 0 && student?.certificate) {
    items.push({
      name: String(student.certificate).trim(),
      status: normalizeStatus(student?.certificateStatus || "enrolled"),
    });
  }

  return items;
}
