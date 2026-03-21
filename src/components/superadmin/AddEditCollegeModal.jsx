import { useState, useEffect } from "react";
import { addCollege, updateCollege } from "../../../services/collegeService";
import { createCollegeAdmin } from "../../../services/userService";
import { uploadImageToCloudinary } from "../../../services/cloudinaryService";
import { notifySuperAdminSuccess } from "../../utils/superAdminNotifier";

export default function AddEditCollegeModal({
  college,
  onClose,
  onCollageAdded,
}) {
  const isEdit = Boolean(college);

  const [form, setForm] = useState({
    name: "",
    code: "",
    logoUrl: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

  useEffect(() => {
    if (college) {
      setForm({
        name: college.college_name || "",
        code: college.college_code || "",
        logoUrl: college.college_logo || "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      setLogoFile(null);
    } else {
      setForm({
        name: "",
        code: "",
        logoUrl: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      setLogoFile(null);
    }
  }, [college]);

  useEffect(() => {
    if (logoFile) {
      const objectUrl = URL.createObjectURL(logoFile);
      setLogoPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setLogoPreviewUrl(form.logoUrl || "");
    return undefined;
  }, [logoFile, form.logoUrl]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    setError(null);
  };

  // Validate form fields
  const validateForm = () => {
    if (isEdit) {
      // For edit mode, existing logo or newly selected image is required
      if (!form.logoUrl.trim() && !logoFile) {
        setError("College logo is required");
        return false;
      }
    } else {
      // For add mode, all fields including admin are required
      if (!form.name.trim()) {
        setError("College name is required");
        return false;
      }
      if (!form.code.trim()) {
        setError("College code is required");
        return false;
      }
      if (!logoFile && !form.logoUrl.trim()) {
        setError("College logo is required");
        return false;
      }
      if (!form.adminName.trim()) {
        setError("Admin name is required");
        return false;
      }
      if (!form.adminEmail.trim()) {
        setError("Admin email is required");
        return false;
      }
      if (!form.adminPassword.trim()) {
        setError("Admin password is required");
        return false;
      }
    }
    setError(null);
    return true;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      let logoUrl = form.logoUrl.trim();

      if (logoFile) {
        setUploadingLogo(true);
        const uploadedLogo = await uploadImageToCloudinary(logoFile, {
          folder: "colleges",
        });
        logoUrl = uploadedLogo.secureUrl;
        setForm((prev) => ({ ...prev, logoUrl }));
      }

      if (isEdit) {
        // In edit mode, only update the logo URL
        await updateCollege(college.collegeCode, {
          college_logo: logoUrl,
        });
        notifySuperAdminSuccess("College details edited");
      } else {
        // 1. Create college in Firestore
        await addCollege({
          college_name: form.name,
          college_code: form.code,
          college_logo: logoUrl,
        });

        // 2. Create college admin
        await createCollegeAdmin(
          {
            name: form.adminName,
            email: form.adminEmail,
            password: form.adminPassword,
          },
          form.code,
        );
        notifySuperAdminSuccess("College added");
      }

      // Call the callback to refresh the colleges list
      if (onCollageAdded) {
        onCollageAdded();
      }

      setForm({
        name: "",
        code: "",
        logoUrl: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
      });
      setLogoFile(null);

      onClose();
    } catch (err) {
      console.error("Error creating or updating college:", err);

      // Handle specific Firebase Auth errors
      if (err.code === "auth/email-already-in-use") {
        setError(
          "This email is already registered. Please use a different email.",
        );
      } else if (err.code === "auth/weak-password") {
        setError(
          "Password is too weak. Please use a stronger password (at least 6 characters).",
        );
      } else if (err.code === "auth/invalid-email") {
        setError("Invalid email address. Please check and try again.");
      } else {
        setError(err.message || "Failed to process request");
      }
    } finally {
      setUploadingLogo(false);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-[700px] max-h-[90vh] rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h2 className="text-xl font-semibold">
            {isEdit ? "Edit College" : "Add New College"}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-6 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!isEdit && (
            <>
              <div>
                <label className="text-sm font-medium">College Name</label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>

              <div>
                <label className="text-sm font-medium">College Code</label>
                <input
                  name="code"
                  value={form.code}
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>
            </>
          )}

          <div>
            <label className="text-sm font-medium">College Logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="w-full border rounded-lg px-4 py-2"
            />
            <p className="mt-2 text-xs text-gray-500">
              Selected logo will be uploaded to Cloudinary and saved as a
              Cloudinary URL.
            </p>
            {logoFile && (
              <p className="mt-1 text-xs text-gray-700">
                Selected: {logoFile.name}
              </p>
            )}
            {form.logoUrl && (
              <p className="mt-1 text-xs text-gray-600 break-all">
                Current logo URL: {form.logoUrl}
              </p>
            )}

            {logoPreviewUrl && (
              <div className="mt-3 rounded-lg border bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  Logo Preview
                </p>
                <div className="h-28 w-full overflow-hidden rounded-md bg-white">
                  <img
                    src={logoPreviewUrl}
                    alt="College logo preview"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          {!isEdit && (
            <>
              <div className="border-t pt-6">
                <p className="text-sm font-medium mb-4">
                  Create a new college admin
                </p>

                <input
                  name="adminName"
                  placeholder="Admin Name"
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2 mb-3"
                />
                <input
                  name="adminEmail"
                  placeholder="Email"
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2 mb-3"
                />
                <input
                  name="adminPassword"
                  placeholder="Password"
                  type="password"
                  onChange={handleChange}
                  className="w-full border rounded-lg px-4 py-2"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="border px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || uploadingLogo}
            className="bg-[#0B2A4A] text-white px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {uploadingLogo
              ? "Uploading..."
              : loading
                ? isEdit
                  ? "Updating..."
                  : "Creating..."
                : isEdit
                  ? "Update"
                  : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
