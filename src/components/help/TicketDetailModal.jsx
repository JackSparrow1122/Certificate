import { MessageCircle, X, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { TICKET_STATUS_OPTIONS } from "../../../services/ticketService";

const formatDate = (value) => {
  if (!value) return "-";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
};

export default function TicketDetailModal({
  ticket,
  onClose,
  role,
  onStatusChange,
  statusUpdating,
  remarks = [],
  loadingRemarks,
  onAddRemark,
  addingRemark,
}) {
  const [remarkText, setRemarkText] = useState("");

  const canManageStatus = String(role || "").toLowerCase() === "superadmin";
  const canAddRemark =
    canManageStatus || String(ticket?.status || "") === "Pending Info";

  const parsedRemarks = useMemo(
    () =>
      (remarks || []).map((remark) => ({
        ...remark,
        createdAtLabel: formatDate(remark.createdAt),
      })),
    [remarks],
  );

  const handleRemarkSubmit = async () => {
    const trimmed = String(remarkText || "").trim();
    if (!trimmed || !canAddRemark) return;
    await onAddRemark?.(trimmed);
    setRemarkText("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="relative w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400"
        >
          <X size={18} />
        </button>

        <h2 className="text-3xl font-semibold text-[#1b2a46]">
          {ticket?.subject || "Ticket"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Ticket ID: {ticket?.id?.slice(0, 8) || "-"} • Created{" "}
          {formatDate(ticket?.createdAt)}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-500">Status</span>
            <select
              value={ticket?.status || "Open"}
              disabled={!canManageStatus || statusUpdating}
              onChange={(event) => onStatusChange?.(event.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 outline-none disabled:bg-gray-100"
            >
              {TICKET_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm">
            <span className="mb-1 block text-gray-500">Priority</span>
            <span className="inline-flex rounded-full bg-[#0B2A4A] px-3 py-1 text-xs font-medium text-white">
              {ticket?.priority || "-"}
            </span>
          </div>

          <div className="text-sm">
            <span className="mb-1 block text-gray-500">Category</span>
            <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {ticket?.category || "-"}
            </span>
          </div>
        </div>

        <div className="mt-5 border-t pt-4">
          <p className="text-sm font-semibold text-[#1b2a46]">Description</p>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
            {ticket?.description || "-"}
          </p>
        </div>

        <div className="mt-5 border-t pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#1b2a46]">
            <MessageCircle size={16} /> Admin Remarks ({parsedRemarks.length})
          </p>

          {loadingRemarks ? (
            <p className="mt-2 text-sm text-gray-500">Loading remarks...</p>
          ) : parsedRemarks.length === 0 ? (
            <p className="mt-2 text-sm italic text-gray-500">
              No remarks yet. Admin will respond to your ticket here.
            </p>
          ) : (
            <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg border bg-gray-50 p-3">
              {parsedRemarks.map((remark) => (
                <div
                  key={remark.id}
                  className="rounded-md bg-white p-2 text-sm"
                >
                  <p className="text-gray-800">{remark.text}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {remark.authorName || "Admin"} ({remark.authorRole || ""}) •{" "}
                    {remark.createdAtLabel}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 border-t pt-4">
          <label className="mb-2 block text-sm font-semibold text-[#1b2a46]">
            Add Remark
          </label>
          <textarea
            value={remarkText}
            onChange={(event) =>
              setRemarkText(event.target.value.slice(0, 500))
            }
            disabled={!canAddRemark || addingRemark}
            placeholder={
              canAddRemark
                ? "Type your response here..."
                : "Remarks are enabled only when status is Pending Info"
            }
            className="h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none disabled:bg-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            {remarkText.length}/500 characters
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!canAddRemark || addingRemark || !remarkText.trim()}
            onClick={handleRemarkSubmit}
            className="rounded-lg bg-[#8FA1B8] px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {addingRemark ? "Adding..." : "Add Remark"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TicketViewActionButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[#2f3f59]"
      title="View ticket"
    >
      <Eye size={16} />
    </button>
  );
}
