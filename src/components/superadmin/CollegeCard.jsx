import CollegeActionsMenu from "./CollegeActionsMenu";

export default function CollegeCard({ college, onEdit, onDelete, onOpen }) {
  return (
    <div
      onClick={() => {
        if (onOpen) onOpen();
      }}
      className={`relative rounded-2xl border border-[#D7E2F1] bg-[#E9EEF5] p-5 transition-all duration-200 ${
        onOpen
          ? "cursor-pointer"
          : ""
      }`}
    >
      <div
        className="absolute top-3 right-3 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <CollegeActionsMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div className="pointer-events-none mb-4 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-[#D7E2F1] bg-white p-2 text-center text-lg">
        {college.college_logo ? (
          <img
            src={college.college_logo}
            alt={college.college_name}
            className="h-full w-full rounded-lg object-contain"
          />
        ) : (
          "College Logo"
        )}
      </div>

      <p className="text-lg font-medium text-[#0B2A4A]">
        {college.college_name}
      </p>
      <p className="mt-1 text-sm text-[#415a77]">
        College Code:{" "}
        <span className="font-semibold text-[#0B2A4A]">
          {college.college_code}
        </span>
      </p>
    </div>
  );
}
