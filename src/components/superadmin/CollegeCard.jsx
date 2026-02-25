import CollegeActionsMenu from "./CollegeActionsMenu";

export default function CollegeCard({ college, onEdit, onDelete, onOpen }) {
  return (
    <div
      onClick={() => {
        if (onOpen) onOpen();
      }}
      className={`relative rounded-2xl border border-transparent bg-gray-200 p-5 shadow transition-all duration-200 ${
        onOpen
          ? "cursor-pointer hover:-translate-y-1 hover:border-[#0B2A4A]/20 hover:shadow-lg"
          : ""
      }`}
    >
      <div
        className="absolute top-3 right-3 z-20"
        onClick={(e) => e.stopPropagation()}
      >
        <CollegeActionsMenu onEdit={onEdit} onDelete={onDelete} />
      </div>

      <div className="bg-white rounded-lg p-2 text-center text-lg mb-4 h-32 flex items-center justify-center overflow-hidden">
        {college.college_logo ? (
          <img
            src={college.college_logo}
            alt={college.college_name}
            className="w-full h-full object-contain rounded-lg"
          />
        ) : (
          "College Logo"
        )}
      </div>

      <p className="text-lg font-medium">{college.college_name}</p>
      <p className="text-sm text-gray-700 mt-1">
        College Code:{" "}
        <span className="font-medium">{college.college_code}</span>
      </p>
    </div>
  );
}
