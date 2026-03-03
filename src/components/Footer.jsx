export default function Footer() {
  return (
    <footer className="bg-[#062a4d] text-gray-300">
      {/* TOP */}
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-10">
        
        {/* BRAND */}
        <div>
          <h3 className="text-white text-xl font-semibold mb-4">
            🎓 ERP Certificate System
          </h3>
          <p className="text-sm leading-relaxed text-gray-400">
            A centralized ERP platform to manage student certifications,
            academic structure, and progress tracking across institutions.
          </p>
        </div>

        {/* QUICK LINKS */}
        <div>
          <h4 className="text-white font-semibold mb-4">Product</h4>
          <ul className="space-y-2 text-sm">
            <li className="cursor-pointer">Dashboard</li>
            <li className="cursor-pointer">Certificates</li>
            <li className="cursor-pointer">Students</li>
            <li className="cursor-pointer">Reports</li>
          </ul>
        </div>

        {/* ERP FEATURES */}
        <div>
          <h4 className="text-white font-semibold mb-4">ERP Features</h4>
          <ul className="space-y-2 text-sm">
            <li className="cursor-pointer">
              Certificate Management
            </li>
            <li className="cursor-pointer">
              Student Progress Tracking
            </li>
            <li className="cursor-pointer">
              Role-Based Access
            </li>
            <li className="cursor-pointer">
              College & Department Mapping
            </li>
          </ul>
        </div>

        {/* CONTACT */}
        <div>
          <h4 className="text-white font-semibold mb-4">Contact</h4>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>Email: support@erp-system.com</li>
            <li>Phone: +91 9XXXXXXXXX</li>
            <li>Location: India</li>
          </ul>
        </div>
      </div>

      {/* DIVIDER */}
      <div className="border-t border-white/10" />

      {/* BOTTOM */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-400">
        <p>© 2026 ERP Certificate System. All rights reserved.</p>
        <div className="flex gap-4 mt-4 md:mt-0">
          <span className="cursor-pointer">
            Privacy Policy
          </span>
          <span className="cursor-pointer">
            Terms of Service
          </span>
        </div>
      </div>
    </footer>
  );
}