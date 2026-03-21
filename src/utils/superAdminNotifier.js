export const SUPER_ADMIN_SUCCESS_EVENT = "superadmin:success";

export function notifySuperAdminSuccess(message) {
  const text = String(message || "").trim();
  if (!text || typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(SUPER_ADMIN_SUCCESS_EVENT, {
      detail: { message: text },
    }),
  );
}
