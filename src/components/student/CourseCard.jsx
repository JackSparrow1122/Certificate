export default function CourseCard({ title, status }) {
  const statusColor = {
    Enrolled: "bg-yellow-100 text-yellow-700",
    "Exam Appeared": "bg-blue-100 text-blue-700",
    Passed: "bg-green-100 text-green-700",
    Failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border">
      <div className="h-8 bg-gray-200 rounded mb-4" />

      <h3 className="text-base sm:text-lg font-semibold mb-3 break-words">{title}</h3>

      <span
        className={`px-3 py-1 rounded-full text-sm font-medium ${
          statusColor[status] || "bg-gray-100"
        }`}
      >
        {status}
      </span>
    </div>
  );
}
