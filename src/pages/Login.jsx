import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { Eye, EyeOff } from "lucide-react";

import { auth } from "../firebase/config";
import { getDashboardByRole } from "../utils/roleRedirect";
import { getAuthUserProfile } from "../utils/authProfileLookup";
import { authenticateStudentUser } from "../../services/userService";
import { setStudentSession } from "../utils/studentSession";
import logo from "../assets/image.png";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      try {
        // Try student login first (collection-based auth).
        const studentProfile = await authenticateStudentUser({
          email,
          password,
        });
        setStudentSession({
          loginId: studentProfile.id || "",
          uid: studentProfile.id || studentProfile.uid || "",
          email: studentProfile.email || String(email || "").trim(),
          role: "student",
          profile: studentProfile,
        });
        navigate("/student/dashboard", { replace: true });
        return;
      } catch {
        // Admin/college login via Firebase Authentication.
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
          throw new Error("User role not found in users/student_login_users.");
        }

        localStorage.setItem("role", role);
        navigate(getDashboardByRole(role));
        return;
      }
    } catch (err) {
      const code = String(err?.code || "").toLowerCase();
      if (
        code === "auth/invalid-credential" ||
        code === "auth/user-not-found" ||
        code === "auth/wrong-password"
      ) {
        setError("Invalid email or password.");
      } else {
        setError(err?.message || "Invalid credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* LEFT BLUE PANEL - With Gryphon Branding */}
      <div className="hidden lg:flex w-1/2 bg-[#acf74d] flex-col items-center justify-center px-8">
        <div className="text-center space-y-6 max-w-md">
          {/* Logo/Branding - Gryphon */}
          <div className="rounded-xl p-6 inline-block ">
            <img src={logo} alt="Gryphon Logo" className="h-40 w-auto mx-auto" />
          </div>

          

          {/* Tagline */}
          <h2 className="text-2xl font-semibold text-[012920]">
           Certificate Management Platform
          </h2>

          {/* Description */}
          <p className="text-[#012920] text-base leading-relaxed">
            Manage students, faculty, projects, and certifications. Access comprehensive dashboards to monitor academic progress and institutional performance with ease.
          </p>

          {/* Features List */}
          <p className="text-[#012920] text-base leading-relaxed pt-4">
            Student & Faculty Management. Project Tracking & Monitoring. Certificate Management.
          </p>
        </div>
      </div>

      {/* RIGHT LOGIN PANEL */}
      <div className="flex flex-1 items-center justify-center bg-[#F5F4EB] px-6">
        <div className="w-full max-w-md">
          {/* Header */}
          <h2 className="text-3xl font-bold text-center text-[#012920]">
            Welcome Back
          </h2>
          <p className="text-center text-gray-600 mt-2 mb-8 text-sm">
            Sign in to access your admin dashboard
          </p>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="space-y-5 bg-white p-8 rounded-xl shadow-sm border border-gray-200"
          >
            {/* Error */}
            {error && (
              <p className="text-red-500 text-sm text-center bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0B2A4A] focus:border-transparent transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0B2A4A] focus:border-transparent transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-500"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-sm text-[#0B2A4A] font-medium hover:underline"
              >
                Forgot Password?
              </button>
            </div>
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#012920] hover:bg-[#081f35] disabled:bg-gray-400 text-white py-2.5 rounded-lg font-semibold transition duration-200 mt-6"
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

