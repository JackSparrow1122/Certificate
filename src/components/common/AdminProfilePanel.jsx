import { useMemo, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { Lock, Mail, Shield, UserCircle2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { db } from "../../firebase/config";

export default function AdminProfilePanel({ roleLabel = "Admin" }) {
  const { user, profile } = useAuth();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const adminName = useMemo(
    () =>
      profile?.name ||
      user?.displayName ||
      user?.email?.split("@")[0] ||
      roleLabel,
    [profile?.name, roleLabel, user?.displayName, user?.email],
  );
  const adminEmail = profile?.email || user?.email || "-";
  const adminInitial = String(adminName || "A").charAt(0).toUpperCase();

  const onChange = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePasswordUpdate = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!user?.email) {
      setError("Authenticated user not found.");
      return;
    }

    const currentPassword = String(passwordForm.currentPassword || "").trim();
    const newPassword = String(passwordForm.newPassword || "").trim();
    const confirmPassword = String(passwordForm.confirmPassword || "").trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill all password fields.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from current password.");
      return;
    }

    setLoading(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      await setDoc(
        doc(db, "users", user.uid),
        {
          passwordLastUpdatedAt: new Date(),
          passwordUpdatedBy: roleLabel,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSuccess("Password updated successfully.");
    } catch (err) {
      console.error("Failed to update admin password:", err);
      const code = err?.code || "";
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setError("Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        setError("New password is too weak.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Failed to update password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[#0B2A4A]/10 p-2 text-[#0B2A4A]">
              <UserCircle2 size={18} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Profile Information</h2>
              <p className="text-xs text-gray-500">Your personal account details</p>
            </div>
          </div>
        </header>

        <div className="space-y-4 p-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Full Name</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-300 text-lg font-bold text-[#0B2A4A]">
                {adminInitial}
              </div>
              <p className="text-lg font-semibold text-gray-900">{adminName}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">Email Address</p>
            <div className="mt-2 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Mail size={16} className="text-gray-500" />
              <span className="break-all text-sm sm:text-base">{adminEmail}</span>
            </div>
          </div>

          <div className="w-fit rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
            <p className="text-xs uppercase tracking-wide text-gray-500">Role</p>
            <div className="mt-1 flex items-center gap-2 text-base font-semibold text-gray-900">
              <Shield size={15} className="text-[#0B2A4A]" />
              <span>{roleLabel}</span>
            </div>
          </div>
        </div>
      </article>

      <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-[#0B2A4A]/10 p-2 text-[#0B2A4A]">
              <Lock size={18} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Security Settings</h2>
              <p className="text-xs text-gray-500">Update your password to keep account secure</p>
            </div>
          </div>
        </header>

        <form onSubmit={handlePasswordUpdate} className="space-y-3 p-4">
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {success}
            </p>
          )}

          <Field
            label="Current Password"
            name="currentPassword"
            value={passwordForm.currentPassword}
            onChange={onChange}
            placeholder="Enter current password"
          />
          <Field
            label="New Password"
            name="newPassword"
            value={passwordForm.newPassword}
            onChange={onChange}
            placeholder="Enter new password (min. 6 chars)"
          />
          <Field
            label="Confirm New Password"
            name="confirmPassword"
            value={passwordForm.confirmPassword}
            onChange={onChange}
            placeholder="Re-enter new password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#0B2A4A] px-4 py-2.5 text-base font-semibold text-white transition hover:bg-[#113A63] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </article>
    </section>
  );
}

function Field({ label, name, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        type="password"
        name={name}
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#1D5FA8]"
        placeholder={placeholder}
        autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
      />
    </label>
  );
}
