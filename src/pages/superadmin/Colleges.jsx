import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CollegeCard from "../../components/superadmin/CollegeCard";
import SuperAdminLayout from "../../components/layout/SuperAdminLayout";
import AddEditCollegeModal from "../../components/superadmin/AddEditCollegeModal";
import ConfirmDialog from "../../components/ConfirmDialog";
import {
  getAllColleges,
  deleteCollege,
} from "../../../services/collegeService";
import {
  getUserByCollegeCode,
  deleteCollegeAdmin,
} from "../../../services/userService";

export default function Colleges() {
  const [colleges, setColleges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [selectedCollege, setSelectedCollege] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    college: null,
    loading: false,
  });
  const navigate = useNavigate();

  // Fetch colleges from Firestore on component mount
  useEffect(() => {
    fetchCollegesData();
  }, []);

  const fetchCollegesData = async () => {
    try {
      setLoading(true);
      const data = await getAllColleges();
      setColleges(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching colleges:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setSelectedCollege(null);
    setOpen(true);
  };

  const openEdit = (college) => {
    setSelectedCollege(college);
    setOpen(true);
  };

  const handleDelete = (college) => {
    setDeleteConfirm({
      isOpen: true,
      college: college,
      loading: false,
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.college) return;

    setDeleteConfirm((prev) => ({ ...prev, loading: true }));
    try {
      // 1. Find and delete the college admin user
      const collegeAdmin = await getUserByCollegeCode(
        deleteConfirm.college.collegeCode,
      );
      if (collegeAdmin) {
        await deleteCollegeAdmin(collegeAdmin.uid);
        console.log("College admin deleted:", collegeAdmin.uid);
      }

      // 2. Delete the college
      await deleteCollege(deleteConfirm.college.collegeCode);
      alert("College and admin deleted successfully!");
      setDeleteConfirm({ isOpen: false, college: null, loading: false });
      fetchCollegesData();
    } catch (err) {
      console.error("Error deleting college or admin:", err);
      alert("Error deleting college: " + err.message);
      setDeleteConfirm((prev) => ({ ...prev, loading: false }));
    }
  };

  const cancelDelete = () => {
    setDeleteConfirm({ isOpen: false, college: null, loading: false });
  };

  return (
    <SuperAdminLayout>
      <div className="px-4 py-5 sm:px-5 sm:py-6 lg:px-6">
        <div className="w-full space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold leading-tight text-[#0B2A4A] sm:text-4xl">
              Colleges
            </h1>

            <button
              onClick={openAdd}
              className="rounded-lg bg-[#012920] px-4 py-2.5 text-sm font-semibold text-white"
            >
              + Add New College
            </button>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {loading ? (
              <div className="col-span-full text-center py-8">
                <p className="text-gray-600">Loading colleges...</p>
              </div>
            ) : error ? (
              <div className="col-span-full text-center py-8">
                <p className="text-red-600">Error: {error}</p>
              </div>
            ) : colleges.length === 0 ? (
              <div className="col-span-full text-center py-8">
                <p className="text-gray-600">No colleges found</p>
              </div>
            ) : (
              colleges.map((college) => (
                <CollegeCard
                  key={college.collegeCode}
                  college={college}
                  onEdit={() => openEdit(college)}
                  onDelete={() => handleDelete(college)}
                  onOpen={() =>
                    navigate(
                      `/superadmin/colleges/${college.collegeCode}/project-codes`,
                    )
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>
      {open && (
        <AddEditCollegeModal
          college={selectedCollege}
          onClose={() => setOpen(false)}
          onCollageAdded={fetchCollegesData}
        />
      )}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete College"
        message={`Are you sure you want to delete ${deleteConfirm.college?.college_name}? This action cannot be undone.`}
        warning="Please contact the IT Team before deleting a college."
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        loading={deleteConfirm.loading}
      />
    </SuperAdminLayout>
  );
}
