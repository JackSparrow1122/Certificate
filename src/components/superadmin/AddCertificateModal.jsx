import { useEffect, useState } from "react";
import {
  createCertificateAndEnrollStudents,
  updateCertificate,
} from "../../../services/certificateService";

export default function AddCertificateModal({
  onClose,
  onCertificateAdded,
  onCertificateUpdated,
  initialCertificate = null,
  organizations = [],
}) {
  const isEditMode = Boolean(initialCertificate?.id);
  const [form, setForm] = useState({
    domain: "",
    name: "",
    platform: "",
    examCode: "",
    level: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEditMode) return;

    setForm({
      domain: initialCertificate?.domain || "",
      name: initialCertificate?.name || "",
      platform: initialCertificate?.platform || "",
      examCode: initialCertificate?.examCode || "",
      level: initialCertificate?.level || "",
    });
  }, [initialCertificate, isEditMode]);

  const selectedOrganization = organizations.find(
    (organization) =>
      String(organization?.name || "").trim() ===
      String(form.domain || "").trim(),
  );

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    if (!form.domain.trim()) return "Organisation name is required";
    if (!form.name.trim()) return "Certificate name is required";
    if (!form.platform.trim()) return "Platform is required";
    if (!form.examCode.trim()) return "Exam code is required";
    if (!form.level.trim()) return "Level is required";
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
      if (isEditMode) {
        await updateCertificate(initialCertificate.id, form);
        onCertificateUpdated?.();
      } else {
        await createCertificateAndEnrollStudents(form);
        onCertificateAdded?.();
      }
      onClose();
    } catch (submitError) {
      setError(
        isEditMode
          ? "Failed to update certificate"
          : "Failed to create certificate",
      );
      console.error(submitError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      <div className="relative z-10 mx-4 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400"
        >
          ✕
        </button>

        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {isEditMode ? "Edit Certificate" : "Add New Certificate"}
        </h2>

        {error && (
          <div className="mb-4 rounded-md bg-red-100 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {organizations.length === 0 && (
          <div className="mb-4 rounded-md bg-yellow-100 p-2 text-sm text-yellow-800">
            No organisations found. Please add an organisation first.
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Organisation Name
            </label>
            <select
              name="domain"
              value={form.domain}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
            >
              <option value="">Select organisation</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.name || ""}>
                  {organization.name || "-"}
                </option>
              ))}
            </select>
            {selectedOrganization?.logoUrl && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-2">
                <img
                  src={selectedOrganization.logoUrl}
                  alt={`${selectedOrganization.name || "Organisation"} logo`}
                  className="h-8 w-8 rounded object-contain bg-white"
                />
                <span className="text-xs text-gray-600">
                  Selected organisation logo preview
                </span>
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Certificate Name
            </label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Domain
            </label>
            <input
              name="platform"
              value={form.platform}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Exam Code
            </label>
            <input
              name="examCode"
              value={form.examCode}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Level
            </label>
            <input
              name="level"
              value={form.level}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm outline-none"
            />
          </div>
          <div className="col-span-full mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || organizations.length === 0}
              className="rounded-md bg-[#0B2A4A] px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading
                ? isEditMode
                  ? "Updating..."
                  : "Creating..."
                : isEditMode
                  ? "Update Certificate"
                  : "Create Certificate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
