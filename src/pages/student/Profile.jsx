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
  const graduationDetails = student?.GRADUATION_DETAILS || {};

  const fullName = officialDetails["FULL NAME OF STUDENT"] || student?.name || "-";
  const rollNo = officialDetails.SN || student?.id || "-";
  const gender = officialDetails.GENDER || student?.gender || "-";
  const dob = officialDetails["BIRTH DATE"] || student?.dob || "-";
  const collegeCode =
    String(student?.collegeCode || "").trim() ||
    String(student?.projectId || "").split(/[-/]/)[0]?.trim() ||
    "-";
  const courseYear = student?.projectId || student?.courseYear || "-";

  const email = officialDetails["EMAIL ID"] || student?.email || "-";
  const phone = officialDetails["MOBILE NO."] || student?.phone || "-";
  const passingYear =
    graduationDetails["GRADUATION PASSING YR"] ||
    student?.passingYear ||
    student?.admissionYear ||
    "-";
  const structuredProjectCode = student?.projectCode || student?.projectId || "";
  const currentYearFromCode = getCurrentYearFromProjectCode(structuredProjectCode);
  const currentYear = currentYearFromCode || student?.currentSemester || "-";
  const tenthPercentage = student?.tenthPercentage ?? tenthDetails["10th OVERALL MARKS %"] ?? "-";
  const twelfthPercentage = student?.twelfthPercentage ?? twelfthDetails["12th OVERALL MARKS %"] ?? "-";

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
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
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
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-r from-[#0B2A4A] via-[#1D5FA8] to-[#6BC7A7] p-6 text-white shadow-sm">
        <h1 className="text-2xl font-semibold">Student Profile</h1>
        <p className="mt-1 text-sm text-white/90">Manage your academic and certification details.</p>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Basic Information</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ProfileItem label="Student Name" value={fullName} />
          <ProfileItem label="Roll No" value={rollNo} />
          <ProfileItem label="Gender" value={gender} />
          <ProfileItem label="Date of Birth" value={dob} />
          <ProfileItem label="College" value={collegeCode} />
          <ProfileItem label="Course / Year" value={courseYear} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Contact & Academic Details</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ProfileItem label="Email" value={email} />
          <ProfileItem label="Phone" value={phone} />
          <ProfileItem label="Passing Year" value={passingYear} />
          <ProfileItem label="Current Year" value={currentYear} />
          <ProfileItem label="10th Percentage" value={tenthPercentage === "-" ? "-" : `${tenthPercentage}%`} />
          <ProfileItem label="12th Percentage" value={twelfthPercentage === "-" ? "-" : `${twelfthPercentage}%`} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Change Password</h2>

        {passwordError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {passwordError}
          </p>
        )}
        {passwordSuccess && (
          <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {passwordSuccess}
          </p>
        )}

        <form onSubmit={handlePasswordChange} className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Current Password</span>
            <input
              type="password"
              name="currentPassword"
              value={passwordForm.currentPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#1D5FA8]"
              autoComplete="current-password"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">New Password</span>
            <input
              type="password"
              name="newPassword"
              value={passwordForm.newPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#1D5FA8]"
              autoComplete="new-password"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Confirm New Password</span>
            <input
              type="password"
              name="confirmPassword"
              value={passwordForm.confirmPassword}
              onChange={handlePasswordFieldChange}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#1D5FA8]"
              autoComplete="new-password"
            />
          </label>

          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={passwordLoading}
              className="rounded-xl bg-[#0B2A4A] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#113A63] disabled:cursor-not-allowed disabled:opacity-70"
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
    <div className="rounded-xl bg-gray-100 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-900">{value || "-"}</p>
    </div>
  );
}
 
