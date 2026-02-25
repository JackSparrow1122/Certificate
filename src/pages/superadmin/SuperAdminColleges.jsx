import { useEffect, useState } from "react";
import CollegeCard from "../../components/superadmin/CollegeCard";
import { useNavigate } from "react-router-dom";
import { getAllColleges } from "../../../services/collegeService";

export default function SuperAdminColleges() {
  const navigate = useNavigate();
  const [colleges, setColleges] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await getAllColleges();
        if (!mounted) return;
        setColleges(data || []);
      } catch (error) {
        console.error("Failed to load colleges:", error);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Colleges</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {colleges.map((college) => (
  <CollegeCard
    key={college.id}
    college={college}
    onEdit={() => openEdit(college)}
    onOpen={() =>
      navigate(`/superadmin/colleges/${college.id}/project-codes`)
    }
  />
))}
      </div>
    </div>
  );
}
