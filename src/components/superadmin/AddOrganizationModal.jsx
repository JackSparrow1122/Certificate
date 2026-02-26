import { useEffect, useState } from "react";
import {
  createOrganization,
  updateOrganization,
} from "../../../services/organizationService";
import { uploadImageToCloudinary } from "../../../services/cloudinaryService";

export default function AddOrganizationModal({
  onClose,
  onOrganizationAdded,
  onOrganizationUpdated,
  organizations = [],
  mode = "create",
}) {
  const isEditMode = mode === "edit";
  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
  });
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (logoFile) {
      const objectUrl = URL.createObjectURL(logoFile);
      setLogoPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }

    setLogoPreviewUrl(form.logoUrl || "");
    return undefined;
  }, [logoFile, form.logoUrl]);

  useEffect(() => {
    if (!isEditMode) return;
    if (!Array.isArray(organizations) || organizations.length === 0) {
      setSelectedOrganizationId("");
      setForm({ name: "", logoUrl: "" });
      return;
    }

    const initialId = selectedOrganizationId || organizations[0]?.id || "";
    setSelectedOrganizationId(initialId);
  }, [isEditMode, organizations]);

  useEffect(() => {
    if (!isEditMode) return;
    const selectedOrganization = (organizations || []).find(
      (organization) => organization.id === selectedOrganizationId,
    );
    if (!selectedOrganization) {
      setForm({ name: "", logoUrl: "" });
      return;
    }
    setForm({
      name: selectedOrganization.name || "",
      logoUrl: selectedOrganization.logoUrl || "",
    });
    setLogoFile(null);
    setError("");
  }, [isEditMode, organizations, selectedOrganizationId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0] || null;
    setLogoFile(file);
    setError("");
  };

  const validate = () => {
    if (isEditMode && !selectedOrganizationId) {
      return "Select an organisation to edit";
    }
    if (!form.name.trim()) return "Organisation name is required";
    if (!logoFile && !form.logoUrl.trim())
      return "Organisation logo is required";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);

    try {
      let finalLogoUrl = form.logoUrl.trim();

      if (logoFile) {
        setUploadingLogo(true);
        const uploadedLogo = await uploadImageToCloudinary(logoFile, {
          folder: "organizations",
        });
        finalLogoUrl = uploadedLogo.secureUrl;
        setForm((prev) => ({ ...prev, logoUrl: finalLogoUrl }));
      }

      if (isEditMode) {
        await updateOrganization(selectedOrganizationId, {
          name: form.name,
          logoUrl: finalLogoUrl,
        });
        onOrganizationUpdated?.();
      } else {
        await createOrganization({
          name: form.name,
          logoUrl: finalLogoUrl,
        });
        onOrganizationAdded?.();
      }
      onClose();
    } catch (submitError) {
      setError(
        submitError?.message ||
          (isEditMode
            ? "Failed to update organization"
            : "Failed to create organization"),
      );
      console.error(submitError);
    } finally {
      setUploadingLogo(false);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? "Edit Organisation" : "Add New Organisation"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-md bg-red-100 px-4 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {isEditMode && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Select Organisation
              </label>
              <select
                value={selectedOrganizationId}
                onChange={(event) =>
                  setSelectedOrganizationId(event.target.value)
                }
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
              >
                {(organizations || []).length === 0 ? (
                  <option value="">No organisations available</option>
                ) : (
                  (organizations || []).map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name || "-"}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Organisation Name
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
              placeholder="Enter organisation name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Organisation Logo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-2 text-xs text-gray-500">
              Logo will be uploaded to Cloudinary and saved as URL.
            </p>
            {logoFile && (
              <p className="mt-1 text-xs text-gray-700">
                Selected: {logoFile.name}
              </p>
            )}
            {form.logoUrl && (
              <p className="mt-1 text-xs text-gray-600 break-all">
                Logo URL: {form.logoUrl}
              </p>
            )}

            {logoPreviewUrl && (
              <div className="mt-3 rounded-lg border bg-gray-50 p-3">
                <p className="mb-2 text-xs font-medium text-gray-700">
                  Logo Preview
                </p>
                <div className="h-24 w-full overflow-hidden rounded-md bg-white">
                  <img
                    src={logoPreviewUrl}
                    alt="Organisation logo preview"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                uploadingLogo ||
                (isEditMode && (organizations || []).length === 0)
              }
              className="rounded-md bg-[#0B2A4A] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {uploadingLogo
                ? "Uploading logo..."
                : loading
                  ? isEditMode
                    ? "Updating..."
                    : "Creating..."
                  : isEditMode
                    ? "Update Organisation"
                    : "Create Organisation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
