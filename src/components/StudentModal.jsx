export default function StudentModal({ student, onClose }) {
  if (!student) return null;

  const PRIMARY_KEYS = [
    ["Roll No", student.id || student.docId],
    ["Name", student.name || student?.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"]],
    ["Gender", student.gender || student?.OFFICIAL_DETAILS?.GENDER],
    ["Date of Birth", student.dob || student?.OFFICIAL_DETAILS?.["BIRTH DATE"]],
    ["Project Code", student.projectCode || student.projectId],
    ["Email", student.email || student?.OFFICIAL_DETAILS?.["EMAIL ID"]],
    ["Phone", student.phone || student?.OFFICIAL_DETAILS?.["MOBILE NO."]],
    ["Admission Year", student.admissionYear],
    ["Current Sem/Year", student.currentSemester || student.currentYear || student.semesterLabel],
    ["Passing Year", student.passingYear],
  ];

  const hiddenTopLevelKeys = new Set([
    "OFFICIAL_DETAILS",
    "TENTH_DETAILS",
    "TWELFTH_DETAILS",
    "DIPLOMA_DETAILS",
    "GRADUATION_DETAILS",
    "POST_GRADUATION_DETAILS",
    "certificateResults",
  ]);

  const topLevelEntries = Object.entries(student).filter(([key, value]) => {
    if (hiddenTopLevelKeys.has(key)) return false;
    return isDisplayableValue(value);
  });

  const nestedSections = Object.entries(student).filter(([, value]) =>
    isPlainObject(value),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl p-8 z-10 overflow-y-auto max-h-[90vh]">
        
        {/* CLOSE */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        {/* TITLE */}
        <h2 className="text-2xl font-semibold mb-6">
          Student Details
        </h2>

        <Section title="Primary Information">
          {PRIMARY_KEYS.map(([label, value]) => (
            <Detail key={label} label={label} value={value} />
          ))}
        </Section>

        {topLevelEntries.length > 0 && (
          <Section title="Student Data">
            {topLevelEntries.map(([label, value]) => (
              <Detail key={label} label={toLabel(label)} value={value} />
            ))}
          </Section>
        )}

        {nestedSections.map(([sectionKey, sectionValue]) => (
          <Section key={sectionKey} title={toLabel(sectionKey)}>
            {Object.entries(sectionValue)
              .filter(([, value]) => isDisplayableValue(value))
              .map(([label, value]) => (
                <Detail key={`${sectionKey}-${label}`} label={toLabel(label)} value={value} />
              ))}
          </Section>
        ))}
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {children}
      </div>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-medium text-gray-900">
        {toDisplayValue(value)}
      </p>
    </div>
  );
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value?.toDate !== "function");
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
