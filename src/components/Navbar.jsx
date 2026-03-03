export default function Navbar() {
  return (
    <header className="w-full bg-[#062a4d] text-white">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          🎓 ERP Certificate System
        </div>

        <button className="bg-white text-[#062a4d] px-5 py-2 rounded-lg font-medium transition">
          Login →
        </button>
      </div>
    </header>
  );
}