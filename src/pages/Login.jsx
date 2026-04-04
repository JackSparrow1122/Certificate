import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      try {
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
      <div className="hidden lg:flex w-1/2 bg-[#acf74d] flex-col items-center justify-center px-8">
        <div className="text-center space-y-6 max-w-md">
          <div className="rounded-xl p-6 inline-block ">
            <img src={logo} alt="Gryphon Logo" className="h-40 w-auto mx-auto" />
          </div>

          <h2 className="text-2xl font-semibold text-[012920]">
            Certificate Management Platform
          </h2>

          <p className="text-[#012920] text-base leading-relaxed">
            Manage students, faculty, projects, and certifications. Access
            comprehensive dashboards to monitor academic progress and
            institutional performance with ease.
          </p>

          <p className="text-[#012920] text-base leading-relaxed pt-4">
            Student & Faculty Management. Project Tracking & Monitoring.
            Certificate Management.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#F5F4EB] px-6">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-bold text-center text-[#012920]">
            Welcome Back
          </h2>
          <p className="text-center text-gray-600 mt-2 mb-8 text-sm">
            Sign in to access your admin dashboard
          </p>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 bg-white p-8 rounded-xl shadow-sm border border-gray-200"
          >
            {error && (
              <p className="text-red-500 text-sm text-center bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

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
            </div>

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
    </div>
  );
}
