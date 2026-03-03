import { useNavigate } from "react-router-dom";

export default function ERPCTA() {
  const navigate = useNavigate();

  return (
    <section className="bg-[#062a4d] py-16">
      <div className="max-w-7xl mx-auto px-6">
        <div className="bg-white rounded-2xl p-10 md:p-14 flex flex-col md:flex-row items-center justify-between gap-8 shadow-lg">
          
          {/* TEXT */}
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              Login to your ERP Dashboard
            </h2>
            <p className="mt-3 text-gray-600 max-w-xl">
              Access your college ERP to manage students, certifications,
              academic structure, and progress tracking securely.
            </p>
          </div>

          {/* LOGIN BUTTON */}
          <button
            onClick={() => navigate("/college-admin")}
            className="px-10 py-3 bg-[#062a4d] text-white font-semibold rounded-lg transition"
          >
            Login →
          </button>
        </div>
      </div>
    </section>
  );
}
