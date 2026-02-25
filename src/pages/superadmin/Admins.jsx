import { useState, useEffect } from "react";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import AdminCard from "../../components/superadmin/AdminCard";
import AddAdminModal from "../../components/superadmin/AddAdminModal";
import { getAllAdmins } from "../../../services/userService";
import { getCollegeByCode } from "../../../services/collegeService";
import { useAuth } from "../../context/AuthContext";

export default function Admins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [sortBy, setSortBy] = useState("role"); // "role", "name", "college"
  const [filterCollege, setFilterCollege] = useState("all"); // Filter by college

  // Fetch all admins from Firestore
  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError(null);
      const adminsList = await getAllAdmins();

      // For each college admin, fetch the college name
      const enrichedAdmins = await Promise.all(
        adminsList.map(async (admin) => {
          let collegeName = null;
          if (admin.role === "collegeAdmin" && admin.collegeCode) {
            const college = await getCollegeByCode(admin.collegeCode);
            collegeName = college?.college_name || "Unknown College";
          } else if (admin.role === "superAdmin") {
            collegeName = "Gryphon Academy";
          }

          return {
            ...admin,
            college: collegeName,
          };
        }),
      );

      setAdmins(enrichedAdmins);
    } catch (err) {
      console.error("Error fetching admins:", err);
      setError("Failed to load admins. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch admins on component mount
  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleEdit = (admin) => {
    setEditingAdmin(admin);
  };

  // Sort admins based on sortBy criteria
  const getSortedAdmins = () => {
    // First, filter by college if selected
    let filtered = admins;
    if (filterCollege !== "all") {
      filtered = admins.filter((admin) => admin.college === filterCollege);
    }

    const sorted = [...filtered];

    switch (sortBy) {
      case "role":
        // Sort by role: superAdmin first, then collegeAdmin
        return sorted.sort((a, b) => {
          if (a.role === "superAdmin" && b.role !== "superAdmin") return -1;
          if (a.role !== "superAdmin" && b.role === "superAdmin") return 1;
          return a.name.localeCompare(b.name);
        });

      case "name":
        // Sort alphabetically by name
        return sorted.sort((a, b) => a.name.localeCompare(b.name));

      case "college":
        // Sort by college: college admins first, then super admins
        return sorted.sort((a, b) => {
          const aCollege = (a.college || "").trim();
          const bCollege = (b.college || "").trim();
          const aIsCollegeAdmin = a.role === "collegeAdmin";
          const bIsCollegeAdmin = b.role === "collegeAdmin";
          const aHasValidCollege =
            aIsCollegeAdmin &&
            aCollege.length > 0 &&
            aCollege !== "Unknown College";
          const bHasValidCollege =
            bIsCollegeAdmin &&
            bCollege.length > 0 &&
            bCollege !== "Unknown College";

          // 1) College admins with valid colleges
          if (aHasValidCollege && !bHasValidCollege) return -1;
          if (!aHasValidCollege && bHasValidCollege) return 1;

          // 2) Remaining college admins (missing/unknown college)
          if (aIsCollegeAdmin && !bIsCollegeAdmin) return -1;
          if (!aIsCollegeAdmin && bIsCollegeAdmin) return 1;

          const byCollege = aCollege.localeCompare(bCollege);
          if (byCollege !== 0) return byCollege;

          return (a.name || "").localeCompare(b.name || "");
        });

      default:
        return sorted;
    }
  };

  // Get all unique colleges from admins
  const getUniquColleges = () => {
    const colleges = new Set();
    admins.forEach((admin) => {
      if (admin.college && admin.college !== "Unknown College") {
        colleges.add(admin.college);
      }
    });
    return Array.from(colleges).sort();
  };

  const sortedAdmins = getSortedAdmins();

  return (
    <SuperAdminLayout>
      <div className="p-2 sm:p-2 md:p-3 lg:p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Admins Management</h1>
            <p className="text-gray-500 text-sm">
              Manage superadmins and college admins
            </p>
          </div>

          <div className="flex gap-3 items-center">
            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border border-gray-300 px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2A4A]"
            >
              <option value="role">Sort by Superadmin</option>
              <option value="name">Sort by Name</option>
              <option value="college">Sort by College</option>
            </select>

            <button
              onClick={() => setShowAddModal(true)}
              className="bg-[#0B2A4A] text-white px-4 py-2 rounded-lg hover:bg-[#0B2A4A]/90"
            >
              + Add Admin
            </button>
            <button
              onClick={fetchAdmins}
              disabled={loading}
              className="border px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0B2A4A]"></div>
              <p className="mt-4 text-gray-600">Loading admins...</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && admins.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-gray-500">No admins found</p>
          </div>
        )}

        {/* Cards */}
        {!loading && admins.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedAdmins.map((admin) => (
              <AdminCard key={admin.uid} admin={admin} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Admin Modal */}
      {(showAddModal || editingAdmin) && (
        <AddAdminModal
          admin={editingAdmin}
          currentUserUid={user?.uid}
          onClose={() => {
            setShowAddModal(false);
            setEditingAdmin(null);
          }}
          onAdminAdded={fetchAdmins}
        />
      )}
    </SuperAdminLayout>
  );
}
