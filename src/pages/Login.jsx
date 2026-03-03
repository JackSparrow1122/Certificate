import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";

import { auth } from "../firebase/config";
import { getDashboardByRole } from "../utils/roleRedirect";
import { getAuthUserProfile } from "../utils/authProfileLookup";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    setResetError("");
    setResetSuccess(false);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetSuccess(true);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        setResetError("No account found with this email address.");
      } else {
        setResetError(err.message || "Failed to send reset email.");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setResetEmail("");
    setResetError("");
    setResetSuccess(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // 🔐 Firebase Auth login
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      const uid = userCredential.user.uid;

      const profile = await getAuthUserProfile({
        uid,
        email: userCredential.user.email,
      });
      const role = profile?.role || null;

      if (!role) {
        throw new Error("User role not found in users/student_users");
      }
      localStorage.setItem("role", role); // store role in localStorage for later use

      // 🚀 Redirect based on role
      const redirectPath = getDashboardByRole(role);
      navigate(redirectPath);
    } catch (err) {
      console.error(err);
      setError(err.message);
      console.error("LOGIN ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT BLUE PANEL (blank as requested) */}
      <div className="hidden lg:flex w-1/2 bg-[#0F2B46]" />

      {/* RIGHT LOGIN PANEL */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <h2 className="text-2xl font-semibold text-center text-gray-800">
            Welcome Back
          </h2>
          <p className="text-center text-gray-500 mt-1 mb-8"></p>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 bg-white p-8 rounded-xl shadow-sm border"
          >
            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0F2B46]"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0F2B46]"
              />
              <div className="mt-1.5 text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-sm text-[#0F2B46] font-medium"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0F2B46] disabled:bg-gray-400 text-white py-2.5 rounded-lg font-medium transition"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md mx-4 rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200 bg-linear-to-r from-[#0B2A4A] to-[#1a3a5c]">
              <h2 className="text-lg font-semibold text-white">
                Reset Password
              </h2>
              <p className="text-sm text-blue-100 mt-0.5">
                We'll send a reset link to your email
              </p>
            </div>

            {/* Body */}
            <div className="px-6 py-6">
              {resetSuccess ? (
                <div className="text-center space-y-3">
                  <div className="text-4xl">📧</div>
                  <p className="text-gray-800 font-medium">Reset email sent!</p>
                  <p className="text-sm text-gray-500">
                    Check your inbox at{" "}
                    <span className="font-medium text-[#0B2A4A]">
                      {resetEmail}
                    </span>{" "}
                    and follow the instructions to reset your password.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {resetError && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                      {resetError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="Enter your registered email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0F2B46] text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-1">
                    <button
                      type="button"
                      onClick={closeForgotModal}
                      className="px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      className="px-5 py-2.5 rounded-lg bg-[#0B2A4A] text-white text-sm font-medium disabled:opacity-60 transition-colors"
                    >
                      {resetLoading ? "Sending..." : "Send Reset Link"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Footer close when success */}
            {resetSuccess && (
              <div className="px-6 pb-6 flex justify-center">
                <button
                  type="button"
                  onClick={closeForgotModal}
                  className="px-6 py-2.5 rounded-lg bg-[#0B2A4A] text-white text-sm font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
