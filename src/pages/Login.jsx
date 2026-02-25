import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";

import { auth } from "../firebase/config";
import { getDashboardByRole } from "../utils/roleRedirect";
import { getAuthUserProfile } from "../utils/authProfileLookup";

export default function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0F2B46] hover:bg-[#123a5c] disabled:bg-gray-400 text-white py-2.5 rounded-lg font-medium transition"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
