import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

/* ================= PUBLIC ================= */
import Landing from "./pages/Landing";
import Login from "./pages/Login";

/* ================= PROTECTED ROUTE ================= */
import ProtectedRoute from "./routes/ProtectedRoute";

/* ================= SUPER ADMIN ================= */
import SuperAdminDashboard from "../src/pages/superadmin/Dashboard";
import SuperAdminColleges from "../src/pages/superadmin/Colleges";
import SuperAdminCertificationConfig from "../src/pages/superadmin/CertificateConfig"
import SuperAdminAdmins from "../src/pages/superadmin/Admins"
import SuperAdminProjectCodes from "../src/pages/superadmin/ProjectCodes"
import CollegeProjectCodes from "./pages/superadmin/CollegeProjectCodes";
import ProjectCodeStudents from "./pages/superadmin/ProjectCodeStudents";

/* ================= COLLEGE ADMIN ================= */
import CollegeAdminSidebar from "./components/collegeadmin/CollegeAdminSidebar";
import CollegeAdminNavbar from "./components/collegeadmin/CollegeAdminNavbar";

import AdminDashboard from "./pages/college-admin/Dashboard";
import Students from "./pages/college-admin/Students";
import StudentDetails from "./pages/college-admin/StudentDetails";
import ProjectStudents from "./pages/college-admin/ProjectStudents";
import Certificates from "./pages/college-admin/Certificates";
import Exams from "./pages/college-admin/Exams";
import Help from "./pages/college-admin/Help";

/* ================= STUDENT ================= */
import StudentLayout from "./components/layout/StudentLayout";
import StudentDashboard from "./pages/student/Dashboard";
import StudentProfile from "./pages/student/Profile";

/* ================= COLLEGE ADMIN LAYOUT ================= */
 function CollegeAdminLayout() {
  return (
    <div className="flex min-h-screen">
      <CollegeAdminSidebar />

      <div className="flex-1 bg-gray-100 flex flex-col">
        <CollegeAdminNavbar />
        <main className="p-8 flex-1">
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
  <Route path="dashboard" element={<SuperAdminDashboard />} />
  <Route path="colleges" element={<SuperAdminColleges />} />
   <Route
    path="colleges/:collegeId/project-codes"
    element={<CollegeProjectCodes />}
  />

  <Route
    path="project-codes/:projectCode/students"
    element={<ProjectCodeStudents />}
  />
  <Route
    path="certificationconfig"
    element={<SuperAdminCertificationConfig />}
  />
  <Route path="admins" element={<SuperAdminAdmins />} />
  <Route path="projectcodes" element={<SuperAdminProjectCodes />} />
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
          <Route index element={<StudentDashboard />} />
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
          <Route index element={<AdminDashboard />} />
          <Route path="students" element={<Students />} />
          <Route path="students/:studentId" element={<StudentDetails />} />
          <Route path="projects/:projectId" element={<ProjectStudents />} />
          <Route path="certificates" element={<Certificates />} />
          <Route path="exams" element={<Exams />} />
          <Route path="help" element={<Help />} />
        </Route>

        {/* ================= FALLBACK ================= */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}