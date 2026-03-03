import { useState, useRef, useEffect } from "react";

export default function AdminActionsMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="h-8 w-8 rounded-full flex items-center justify-center text-gray-600"
      >
        ⋮
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-lg border z-20">
          <button
            onClick={onEdit}
            className="w-full px-4 py-2 text-sm text-left"
          >
            ✏️ Edit User
          </button>
          <button
            onClick={onDelete}
            className="w-full px-4 py-2 text-sm text-left text-red-600"
          >
            🗑 Delete User
          </button>
        </div>
      )}
    </div>
  );
}