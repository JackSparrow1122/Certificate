import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { useState } from "react";
import { Menu } from "lucide-react";

/* ================= PUBLIC ================= */
import Landing from "./pages/Landing";
import Login from "./pages/Login";

/* ================= PROTECTED ROUTE ================= */
import ProtectedRoute from "./routes/ProtectedRoute";

/* ================= SUPER ADMIN ================= */
import SuperAdminDashboard from "../src/pages/superadmin/Dashboard";
import SuperAdminColleges from "../src/pages/superadmin/Colleges";
import SuperAdminCertificationConfig from "../src/pages/superadmin/CertificateConfig";
import SuperAdminAdmins from "../src/pages/superadmin/Admins";
import SuperAdminProjectCodes from "../src/pages/superadmin/ProjectCodes";
import CollegeProjectCodes from "./pages/superadmin/CollegeProjectCodes";
import ProjectCodeStudents from "./pages/superadmin/ProjectCodeStudents";
import StudentCertificateProgress from "./pages/superadmin/StudentCertificateProgress";
import SuperAdminProfile from "./pages/superadmin/Profile";
import SuperAdminHelp from "./pages/superadmin/Help";

/* ================= COLLEGE ADMIN ================= */
import CollegeAdminSidebar from "./components/collegeadmin/CollegeAdminSidebar";

import AdminDashboard from "./pages/college-admin/Dashboard";
import Students from "./pages/college-admin/Students";
import StudentDetails from "./pages/college-admin/StudentDetails";
import ProjectStudents from "./pages/college-admin/ProjectStudents";
import Certificates from "./pages/college-admin/Certificates";
import Exams from "./pages/college-admin/Exams";
import CollegeAdminHelp from "./pages/college-admin/Help";
import CollegeAdminProfile from "./pages/college-admin/Profile";

/* ================= STUDENT ================= */
import StudentLayout from "./components/student/StudentLayout";
import StudentDashboard from "./pages/student/Dashboard";
import StudentProfile from "./pages/student/Profile";

/* ================= COLLEGE ADMIN LAYOUT ================= */
function CollegeAdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F3F6FA]">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <CollegeAdminSidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-y-auto bg-[#F3F6FA]">
        <div className="px-4 pt-4 sm:px-6 md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-2 text-gray-700 shadow-sm"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
        </div>
        <main className="p-4 sm:p-6 md:p-8 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ================= APP ================= */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ================= DEFAULT ================= */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* ================= AUTH ================= */}
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Landing />} />

        {/* ================= SUPER ADMIN ================= */}
        {/* ================= SUPER ADMIN ================= */}
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute allowedRoles={["superAdmin"]}>
              <Outlet />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<SuperAdminDashboard />} />
          <Route path="colleges" element={<SuperAdminColleges />} />
          <Route
            path="colleges/:collegeId/project-codes"
            element={<CollegeProjectCodes />}
          />
          <Route
            path="project-codes/:projectId/students"
            element={<ProjectCodeStudents />}
          />
          <Route
            path="students/:studentDocId/certificate-progress"
            element={<StudentCertificateProgress />}
          />
          <Route path="profile" element={<SuperAdminProfile />} />
          <Route
            path="certificationconfig"
            element={<SuperAdminCertificationConfig />}
          />
          <Route path="admins" element={<SuperAdminAdmins />} />
          <Route path="projectcodes" element={<SuperAdminProjectCodes />} />
          <Route path="help" element={<SuperAdminHelp />} />
        </Route>

        {/* ================= STUDENT ================= */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />

          <Route path="dashboard" element={<StudentDashboard />} />

          <Route path="profile" element={<StudentProfile />} />
        </Route>

        {/* ================= COLLEGE ADMIN ================= */}
        <Route
          path="/college-admin"
          element={
            <ProtectedRoute allowedRoles={["collegeAdmin"]}>
              <CollegeAdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:studentId" element={<StudentDetails />} />
          <Route path="projects/:projectId" element={<ProjectStudents />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="exams" element={<Exams />} />
          <Route path="help" element={<CollegeAdminHelp />} />
          <Route path="profile" element={<CollegeAdminProfile />} />
        </Route>

        {/* ================= FALLBACK ================= */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
