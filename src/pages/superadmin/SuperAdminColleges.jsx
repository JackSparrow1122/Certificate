import { colleges } from "../../data/colleges";
import CollegeCard from "../../components/superadmin/CollegeCard";
import { useNavigate } from "react-router-dom";

export default function SuperAdminColleges() {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Colleges</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {colleges.map((college) => (
          <CollegeCard
            key={college.code}
            college={college}
            onClick={() =>
              navigate(
                `/superadmin/colleges/${college.code}/project-codes`
              )
            }
          />
        ))}
      </div>
    </div>
  );
}