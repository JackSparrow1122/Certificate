import { useState, useEffect } from "react";
import {
  createCollegeAdmin,
  createSuperAdmin,
  updateAdmin,
} from "../../../services/userService";
import { getAllColleges } from "../../../services/collegeService";
import { app } from "../../firebase/config";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, setPersistence, inMemoryPersistence } from "firebase/auth";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

export default function AddAdminModal({
  admin,
  currentUserUid,
  onClose,
  onAdminAdded,
}) {
  const isEdit = Boolean(admin);
  const isEditingOtherSuperAdmin =
    isEdit && admin.role === "superAdmin" && admin.uid !== currentUserUid;

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "collegeAdmin",
    college: "",
  });

  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch colleges on mount
  useEffect(() => {
    const fetchColleges = async () => {
      try {
        const collegesList = await getAllColleges();
        setColleges(collegesList);
      } catch (err) {
        console.error("Error fetching colleges:", err);
      }
    };
    fetchColleges();
  }, []);

  // Prefill form if editing
  useEffect(() => {
    if (admin) {
      setForm({
        name: admin.name || "",
        email: admin.email || "",
        password: "",
        role: admin.role || "collegeAdmin",
        college: admin.collegeCode || "",
      });
    }
  }, [admin]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  // Validate form fields
  const validateForm = () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return false;
    }

    // Email validation - skip for other superadmins
    if (!isEditingOtherSuperAdmin) {
      if (!form.email.trim()) {
        setError("Email is required");
        return false;
      }
      if (!form.email.includes("@")) {
        setError("Please enter a valid email");
        return false;
      }
    }

    // Password is required for create mode only
    if (!isEdit) {
      if (!form.password.trim()) {
        setError("Password is required");
        return false;
      }
      if (form.password.length < 6) {
        setError("Password must be at least 6 characters");
        return false;
      }
    } else {
      // In edit mode, password is optional but must be at least 6 characters if provided
      if (form.password.trim() && form.password.length < 6) {
        setError("Password must be at least 6 characters");
        return false;
      }
    }

    if (form.role === "collegeAdmin" && !form.college) {
      setError("Please select a college for College Admin");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) return;

    try {
      setLoading(true);

      if (isEdit) {
        // Update existing admin
        let updateData = {
          name: form.name,
        };

        // If editing another superadmin, only allow name updates
        if (!isEditingOtherSuperAdmin) {
          // For own account or college admins, allow email updates
          updateData.email = form.email;
        }

        // Update college for college admins
        if (form.role === "collegeAdmin") {
          updateData.collegeCode = form.college;
        }

        await updateAdmin(admin.uid, updateData);
      } else {
        // Create new admin
        // Create auth user using secondary app to avoid logging out current user
        const secondaryAppName = `Secondary-${Date.now()}`;
        const secondaryApp = initializeApp(app.options, secondaryAppName);
        const secondaryAuth = getAuth(secondaryApp);
        let uid;

        try {
          await setPersistence(secondaryAuth, inMemoryPersistence);
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            form.email,
            form.password,
          );
          uid = userCredential.user.uid;
        } catch (authError) {
          await deleteApp(secondaryApp);
          throw authError;
        }
        await deleteApp(secondaryApp);

        if (form.role === "superAdmin") {
          await createSuperAdmin({
            uid,
            name: form.name,
            email: form.email,
          });
        } else {
          await createCollegeAdmin(
            {
              uid,
              name: form.name,
              email: form.email,
            },
            form.college,
          );
        }
      }

      setForm({
        name: "",
        email: "",
        password: "",
        role: "collegeAdmin",
        college: "",
      });

      notifySuperAdminSuccess(isEdit ? "Admin details updated" : "Admin added");
      onAdminAdded();
      onClose();
    } catch (err) {
      console.error("Error creating admin:", err);

      // Handle specific Firebase Auth errors
      if (err.code === "auth/email-already-in-use") {
        setError("Email already in use. Please use a different email.");
      } else if (err.code === "auth/weak-password") {
        setError("Password is too weak. Please use a stronger password.");
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address.");
      } else {
        setError(err.message || "Error creating admin. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-2">
          {isEdit ? "Edit Admin" : "Add New Admin"}
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          {isEdit
            ? "Update admin information"
            : "Create a new system administrator or college admin"}
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {isEditingOtherSuperAdmin && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mb-4 text-sm">
            ℹ️ You can only edit the name for other Super Admins.
          </div>
        )}

        {!isEdit && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4 text-sm">
            ✓ The account will be created using the password you enter above. Share
            the credentials securely with the new admin.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Full Name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A]"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="email@example.com"
              disabled={isEditingOtherSuperAdmin}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A] disabled:bg-gray-100"
            />
          </div>

          {/* Password (show for create mode and editing own account) */}
          {(!isEdit || !isEditingOtherSuperAdmin) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={
                  isEdit ? "Leave blank to keep current password" : "••••••"
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A]"
              />
            </div>
          )}

          {/* Role (disabled for edit mode) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <select
              name="role"
              value={form.role}
              onChange={handleChange}
              disabled={isEdit}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A] disabled:bg-gray-100"
            >
              <option value="collegeAdmin">College Admin</option>
              <option value="superAdmin">Super Admin</option>
            </select>
          </div>

          {/* College (only show for College Admin) */}
          {form.role === "collegeAdmin" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                College
              </label>
              <select
                name="college"
                value={form.college}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A]"
              >
                <option value="">Select College</option>
                {colleges.map((college) => (
                  <option key={college.collegeCode} value={college.collegeCode}>
                    {college.college_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-[#0B2A4A] text-white rounded-lg disabled:opacity-50"
            >
              {loading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update"
                  : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
