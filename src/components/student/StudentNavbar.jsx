import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  getAllColleges,
  getCollegeByCode,
} from "../../../services/collegeService";
import { getStudentForAuthUser } from "../../../services/studentService";
import { db } from "../../firebase/config";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { firebaseConfig } from "../../firebase/config";

const titleByPath = {
  "/student": "Dashboard",
  "/student/dashboard": "Dashboard",
  "/student/profile": "Profile",
};

const subtitleByPath = {
  "/student":
    "Track your enrolled certificates and academic snapshot in one place.",
  "/student/dashboard":
    "Track your enrolled certificates and academic snapshot in one place.",
  "/student/profile": "View and manage your profile details.",
};

const normalizeCollegeLogoUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lowerRaw = raw.toLowerCase();
  if (lowerRaw.startsWith("data:image/")) return raw;
  if (lowerRaw.startsWith("http://") || lowerRaw.startsWith("https://"))
    return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  if (lowerRaw.startsWith("gs://")) {
    const withoutScheme = raw.replace(/^gs:\/\//i, "");
    const slashIndex = withoutScheme.indexOf("/");
    if (slashIndex <= 0) return "";

    const bucket = withoutScheme.slice(0, slashIndex);
    const filePath = withoutScheme.slice(slashIndex + 1);
    if (!bucket || !filePath) return "";

    return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(filePath)}?alt=media`;
  }

  // If only a storage object path is saved, resolve against configured bucket.
  const configuredBucket = String(firebaseConfig?.storageBucket || "").trim();
  if (!configuredBucket) return raw;
  const normalizedPath = raw.replace(/^\/+/, "");
  if (!normalizedPath) return "";
  return `https://firebasestorage.googleapis.com/v0/b/${configuredBucket}/o/${encodeURIComponent(normalizedPath)}?alt=media`;
};

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

export default function StudentNavbar({ onMenuClick }) {
  const location = useLocation();
  const { user, profile } = useAuth();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [collegeInfo, setCollegeInfo] = useState({
    code: "",
    name: "",
    logo: "",
  });

  const heading = titleByPath[location.pathname] || "Student Portal";
  const subtitle =
    subtitleByPath[location.pathname] ||
    "Track your enrolled certificates and academic snapshot in one place.";
  const isDashboardView =
    location.pathname === "/student" ||
    location.pathname === "/student/dashboard";
  const studentName =
    profile?.name ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Student";

  const [enrolledCollegeCode, setEnrolledCollegeCode] = useState(() => {
    const fromProfile = String(profile?.collegeCode || "")
      .trim()
      .toUpperCase();
    if (fromProfile) return fromProfile;

    const fromProject = String(profile?.projectCode || profile?.projectId || "")
      .split(/[-/]/)[0]
      ?.trim()
      .toUpperCase();
    if (fromProject) return fromProject;

    return "";
  });

  useEffect(() => {
    let mounted = true;

    const loadCollege = async () => {
      try {
        let inferredStudent = null;
        // If we don't have a college code yet, infer from the logged-in student's full record.
        if (!enrolledCollegeCode) {
          inferredStudent = await getStudentForAuthUser({ profile, user });
          if (inferredStudent && mounted) {
            const fromStudentProject = String(
              inferredStudent.projectCode || inferredStudent.projectId || "",
            )
              .split(/[-/]/)[0]
              ?.trim()
              .toUpperCase();
            if (fromStudentProject) {
              setEnrolledCollegeCode(fromStudentProject);
              return; // next effect run will load college info
            }
          }
        }

        if (!enrolledCollegeCode) {
          if (mounted) setCollegeInfo({ code: "", name: "", logo: "" });
          return;
        }

        let college = null;
        try {
          college = await getCollegeByCode(enrolledCollegeCode);
        } catch (error) {
          console.warn("Direct college doc lookup failed:", error);
        }
        if (!college) {
          try {
            const fallbackSnapshot = await getDocs(
              query(
                collection(db, "college"),
                where("college_code", "==", enrolledCollegeCode),
                limit(1),
              ),
            );
            if (!fallbackSnapshot.empty) {
              college = {
                collegeCode: fallbackSnapshot.docs[0].id,
                ...fallbackSnapshot.docs[0].data(),
              };
            }
          } catch (error) {
            console.warn("Fallback college query failed:", error);
          }
        }
        if (!college) {
          try {
            const allColleges = await getAllColleges();
            college =
              (allColleges || []).find((row) => {
                const byDocId =
                  normalizeCode(row?.collegeCode) ===
                  normalizeCode(enrolledCollegeCode);
                const byField =
                  normalizeCode(row?.college_code) ===
                  normalizeCode(enrolledCollegeCode);
                return byDocId || byField;
              }) || null;
          } catch (error) {
            console.warn("Bulk college fetch failed:", error);
          }
        }
        if (!mounted) return;

        const profileLogo = normalizeCollegeLogoUrl(
          profile?.college_logo ||
            profile?.collegeLogo ||
            profile?.logo ||
            profile?.logoUrl ||
            "",
        );
        const studentLogo = normalizeCollegeLogoUrl(
          inferredStudent?.college_logo ||
            inferredStudent?.collegeLogo ||
            inferredStudent?.logo ||
            inferredStudent?.logoUrl ||
            "",
        );

        setCollegeInfo({
          code: enrolledCollegeCode,
          name: college?.college_name || enrolledCollegeCode,
          logo: normalizeCollegeLogoUrl(
            college?.college_logo ||
              college?.collegeLogo ||
              college?.logo ||
              profileLogo ||
              studentLogo ||
              "",
          ),
        });
        setLogoLoadFailed(false);
      } catch (error) {
        console.error(error);
        if (mounted) {
          setCollegeInfo({
            code: enrolledCollegeCode || "",
            name: enrolledCollegeCode || "College",
            logo: "",
          });
          setLogoLoadFailed(false);
        }
      }
    };

    loadCollege();
    return () => {
      mounted = false;
    };
  }, [enrolledCollegeCode, profile, user]);

  const collegeInitials = (collegeInfo.code || "CLG").slice(0, 2);

  return (
    <header className="bg-[#F5F4EB] px-4 pt-4 sm:px-6 sm:pt-6">
      <div className="student-navbar-card rounded-3xl border border-[#D7E2F1] bg-white px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex items-start justify-between gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <button
              type="button"
              onClick={onMenuClick}
              className="mt-0.5 inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700 md:hidden"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>

            <div className="hidden min-w-0 text-left sm:block">
              <h1 className="text-xl font-semibold text-[#0B2A4A] sm:text-3xl">
                {isDashboardView ? "Dashboard" : heading}
              </h1>
              <p className="mt-1 text-xs leading-snug text-gray-600 sm:text-sm">
               
                {subtitle}
              </p>
              {!isDashboardView && (
                <p className="mt-1 text-xs text-gray-500 sm:text-sm">
                  Welcome back, {studentName}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-start self-start ">
            <div className="inline-flex items-center">
              {collegeInfo.logo && !logoLoadFailed ? (
                <img
                  src={collegeInfo.logo}
                  alt={collegeInfo.name || "College"}
                  className="h-12 w-auto max-w-32 rounded-lg object-contain sm:h-24 sm:max-w-104"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoLoadFailed(true)}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0B2A4A] text-base font-bold text-white sm:h-24 sm:w-24 sm:text-2xl">
                  {collegeInitials}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
