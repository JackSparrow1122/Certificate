import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { Suspense, lazy, useState } from "react";

/* ================= PUBLIC ================= */
const Landing = lazy(() => import("./pages/Landing"));
const Login = lazy(() => import("./pages/Login"));

/* ================= PROTECTED ROUTE ================= */
import ProtectedRoute from "./routes/ProtectedRoute";

/* ================= SUPER ADMIN ================= */
const SuperAdminDashboard = lazy(() => import("./pages/superadmin/Dashboard"));
const SuperAdminColleges = lazy(() => import("./pages/superadmin/Colleges"));
const SuperAdminCertificationConfig = lazy(
  () => import("./pages/superadmin/CertificateConfig"),
);
const SuperAdminAdmins = lazy(() => import("./pages/superadmin/Admins"));
const SuperAdminProjectCodes = lazy(
  () => import("./pages/superadmin/ProjectCodes"),
);
const CollegeProjectCodes = lazy(
  () => import("./pages/superadmin/CollegeProjectCodes"),
);
const ProjectCodeCertificates = lazy(
  () => import("./pages/superadmin/ProjectCodeCertificates"),
);
const ProjectCodeStudents = lazy(
  () => import("./pages/superadmin/ProjectCodeStudents"),
);
const StudentCertificateProgress = lazy(
  () => import("./pages/superadmin/StudentCertificateProgress"),
);
const SuperAdminProfile = lazy(() => import("./pages/superadmin/Profile"));
const SuperAdminHelp = lazy(() => import("./pages/superadmin/Help"));

/* ================= COLLEGE ADMIN ================= */
import CollegeAdminSidebar from "./components/collegeadmin/CollegeAdminSidebar";
import CollegeAdminNavbar from "./components/collegeadmin/CollegeAdminNavbar";

const AdminDashboard = lazy(() => import("./pages/college-admin/Dashboard"));
const Students = lazy(() => import("./pages/college-admin/Students"));
const StudentDetails = lazy(
  () => import("./pages/college-admin/StudentDetails"),
);
const ProjectStudents = lazy(
  () => import("./pages/college-admin/ProjectStudents"),
);
const Certificates = lazy(() => import("./pages/college-admin/Certificates"));
const CollegeAdminHelp = lazy(() => import("./pages/college-admin/Help"));
const CollegeAdminProfile = lazy(() => import("./pages/college-admin/Profile"));

/* ================= STUDENT ================= */
const StudentLayout = lazy(() => import("./components/student/StudentLayout"));
const StudentDashboard = lazy(() => import("./pages/student/Dashboard"));
const StudentProfile = lazy(() => import("./pages/student/Profile"));

/* ================= COLLEGE ADMIN LAYOUT ================= */
function CollegeAdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#F3F6FA]">
      <div
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-300 md:hidden ${
          mobileMenuOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <CollegeAdminSidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <div className="flex h-full min-w-0 w-full flex-1 flex-col overflow-y-auto bg-[#F5F4EB]">
        <CollegeAdminNavbar onMenuClick={() => setMobileMenuOpen(true)} />
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
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-[#F3F6FA] text-[#0B2A4A]">
            Loading...
          </div>
        }
      >
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
              path="project-codes/:projectId/certificates"
              element={<ProjectCodeCertificates />}
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
            <Route path="help" element={<CollegeAdminHelp />} />
            <Route path="profile" element={<CollegeAdminProfile />} />
          </Route>

          {/* ================= FALLBACK ================= */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
