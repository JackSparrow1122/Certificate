import { useEffect, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/config";
import { getStudentForAuthUser } from "../../../services/studentService";

const getCurrentYearFromProjectCode = (projectCodeValue) => {
  const parts = String(projectCodeValue || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return parts[2];
  }

  return "";
};

const toCanonicalKey = (label) => {
  const normalized = String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[%._-]/g, " ")
    .replace(/\s+/g, " ");

  const aliases = {
    "STUDENT NAME": "FULL NAME OF STUDENT",
    "ROLL NO": "SN",
    PHONE: "MOBILE NO",
    "DATE OF BIRTH": "BIRTH DATE",
    "10TH PERCENTAGE": "10TH OVERALL MARKS",
    "12TH PERCENTAGE": "12TH OVERALL MARKS",
  };

  return aliases[normalized] || normalized;
};

const getUniqueEntries = (entries, seenKeys) => {
  const result = [];
  entries.forEach(([label, value]) => {
    if (String(value ?? "").trim() === "") return;
    const canonicalKey = toCanonicalKey(label);
    if (seenKeys.has(canonicalKey)) return;
    seenKeys.add(canonicalKey);
    result.push([label, value]);
  });
  return result;
};

export default function StudentProfile() {
  const { user, profile } = useAuth();
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const s = await getStudentForAuthUser({ profile, user });
        if (!mounted) return;
        setStudent(s || null);
      } catch (error) {
        console.error("Failed to load student profile:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [profile, user]);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (!student) return <p className="text-gray-500">Profile not found.</p>;

  const officialDetails = student?.OFFICIAL_DETAILS || {};
  const tenthDetails = student?.TENTH_DETAILS || {};
  const twelfthDetails = student?.TWELFTH_DETAILS || {};
  const diplomaDetails = student?.DIPLOMA_DETAILS || {};
  const graduationDetails = student?.GRADUATION_DETAILS || {};
  const postGraduationDetails = student?.POST_GRADUATION_DETAILS || {};

  const fullName =
    officialDetails["FULL NAME OF STUDENT"] || student?.name || "-";
  const rollNo = officialDetails.SN || student?.id || "-";
  const gender = officialDetails.GENDER || student?.gender || "-";
  const dob = officialDetails["BIRTH DATE"] || student?.dob || "-";

  const email = officialDetails["EMAIL_ID"] || student?.email || "-";
  const phone = officialDetails["MOBILE NO."] || student?.phone || "-";
  const hometown = officialDetails.HOMETOWN || "-";
  const passingYear =
    graduationDetails["GRADUATION PASSING YR"] ||
    student?.passingYear ||
    student?.admissionYear ||
    "-";
  const structuredProjectCode =
    student?.projectCode || student?.projectId || "";
  const currentYearFromCode = getCurrentYearFromProjectCode(
    structuredProjectCode,
  );
  const currentYear =
    currentYearFromCode || student?.currentYear || student?.currentSemester || "-";
  const seenKeys = new Set(
    [
      "STUDENT NAME",
      "ROLL NO",
      "GENDER",
      "DATE OF BIRTH",
      "EMAIL",
      "PHONE",
      "PASSING YEAR",
      "CURRENT YEAR",
      "10TH PERCENTAGE",
      "12TH PERCENTAGE",
    ].map(toCanonicalKey),
  );

  const filteredTenthEntries = getUniqueEntries(
    Object.entries(tenthDetails),
    seenKeys,
  );
  const filteredTwelfthEntries = getUniqueEntries(
    Object.entries(twelfthDetails),
    seenKeys,
  );
  const filteredDiplomaEntries = getUniqueEntries(
    Object.entries(diplomaDetails),
    seenKeys,
  );
  const filteredGraduationEntries = getUniqueEntries(
    Object.entries(graduationDetails),
    seenKeys,
  );
  const filteredPostGraduationEntries = getUniqueEntries(
    Object.entries(postGraduationDetails),
    seenKeys,
  );

  const handlePasswordFieldChange = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    const currentPassword = String(passwordForm.currentPassword || "").trim();
    const newPassword = String(passwordForm.newPassword || "").trim();
    const confirmPassword = String(passwordForm.confirmPassword || "").trim();

    if (!user || !user.email) {
      setPasswordError("Authenticated user not found.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill all password fields.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from current password.");
      return;
    }

    setPasswordLoading(true);
    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword,
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      const studentUsersRef = doc(db, "student_users", user.uid);
      const usersRef = doc(db, "users", user.uid);
      const [studentUsersSnap, usersSnap] = await Promise.all([
        getDoc(studentUsersRef),
        getDoc(usersRef),
      ]);

      const targetRef = studentUsersSnap.exists()
        ? studentUsersRef
        : usersSnap.exists()
          ? usersRef
          : studentUsersRef;

      await setDoc(
        targetRef,
        {
          passwordLastUpdatedAt: new Date(),
          passwordUpdatedBy: "student",
          updatedAt: new Date(),
        },
        { merge: true },
      );

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordSuccess("Password updated successfully.");
    } catch (error) {
      console.error("Failed to update password:", error);
      const code = error?.code || "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setPasswordError("Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        setPasswordError("New password is too weak.");
      } else if (code === "auth/too-many-requests") {
        setPasswordError("Too many attempts. Please try again later.");
      } else {
        setPasswordError("Failed to update password. Please try again.");
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-6 ">
      <section className="student-navbar-card rounded-3xl border border-[#012920] bg-white p-6">
        <h1 className="text-3xl font-semibold text-[#012920]">
          Student Profile
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your details and academic information.
        </p>
      </section>

      <section className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-[#012920]">
          Basic Information
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProfileItem label="Student Name" value={fullName} />
          <ProfileItem label="Roll No" value={rollNo} />
          <ProfileItem label="Gender" value={gender} />
          <ProfileItem label="Date of Birth" value={dob} />
          <ProfileItem label="Current Year" value={currentYear} />
          <ProfileItem label="Passing Year" value={passingYear} />
        </div>
      </section>

      <section className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-[#012920]">
          Contact Details
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ProfileItem label="Email" value={email} />
          <ProfileItem label="Phone" value={phone} />
          <ProfileItem label="Hometown" value={hometown} />
        </div>
      </section>

      <DetailsSection title="10th Details" entries={filteredTenthEntries} />
      <DetailsSection title="12th Details" entries={filteredTwelfthEntries} />
      <DetailsSection
        title="Diploma Details"
        entries={filteredDiplomaEntries}
      />
      <DetailsSection
        title="Graduation Details"
        entries={filteredGraduationEntries}
      />
      <DetailsSection
        title="Post Graduation Details"
        entries={filteredPostGraduationEntries}
      />

      <section className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-[#012920]">
          Change Password
        </h2>

        {passwordError && (
          <p className="mb-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {passwordError}
          </p>
        )}
        {passwordSuccess && (
          <p className="mb-3 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
            {passwordSuccess}
          </p>
        )}

        <form
          onSubmit={handlePasswordChange}
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-[#012920]">
              Current Password
            </span>
            <input
              type="password"
              name="currentPassword"
              value={passwordForm.currentPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1D5FA8] focus:bg-white"
              autoComplete="current-password"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              New Password
            </span>
            <input
              type="password"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1D5FA8] focus:bg-white"
              autoComplete="new-password"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Confirm New Password
            </span>
            <input
              type="password"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#1D5FA8] focus:bg-white"
              autoComplete="new-password"
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={passwordLoading}
              className="rounded-xl bg-[#0B2A4A] px-5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70"
            >
              {passwordLoading ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ---------- REUSABLE ---------- */

function ProfileItem({ label, value }) {
  return (
    <div className="rounded-xl border border-[#D7E2F1] bg-white p-4 shadow-sm transition">
      <p className="text-xs uppercase tracking-wide text-[#012920]">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-[#012920]">
        {value || "-"}
      </p>
    </div>
  );
}

function DetailsSection({ title, entries }) {
  const filteredEntries = entries.filter(
    ([, value]) => String(value ?? "").trim() !== "",
  );

  if (filteredEntries.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[#012920] bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold text-[#012920]">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredEntries.map(([label, value]) => (
          <ProfileItem key={`${title}-${label}`} label={label} value={value} />
        ))}
      </div>
    </section>
  );
}
