import { useEffect, useState } from "react";
import { SUPER_ADMIN_SUCCESS_EVENT } from "../../utils/superAdminNotifier";

const TOAST_TIMEOUT_MS = 2800;

export default function SuperAdminSuccessToasts() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleSuccess = (event) => {
      const message = String(event?.detail?.message || "").trim();
      if (!message) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev, { id, message }]);

      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, TOAST_TIMEOUT_MS);
    };

    window.addEventListener(SUPER_ADMIN_SUCCESS_EVENT, handleSuccess);
    return () => {
      window.removeEventListener(SUPER_ADMIN_SUCCESS_EVENT, handleSuccess);
    };
  }, []);

  if (toasts.length === 0) return null;

  const currentToast = toasts[0];
  const closeCurrentToast = () => {
    if (!currentToast) return;
    setToasts((prev) => prev.filter((toast) => toast.id !== currentToast.id));
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/20 px-4">
      <div className="relative w-full max-w-md rounded-xl border border-green-200 bg-green-50 p-5 shadow-xl">
        <button
          type="button"
          onClick={closeCurrentToast}
          className="absolute right-3 top-3 rounded p-1 text-green-800"
          aria-label="Close success popup"
        >
          ✕
        </button>
        <p className="pr-7 text-sm font-medium text-green-800">
          {currentToast.message}
        </p>
      </div>
    </div>
  );
}
