import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getCollegeByCode } from "../../../services/collegeService";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const normalizeCollegeLogoUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lowerRaw = raw.toLowerCase();
  if (lowerRaw.startsWith("http://") || lowerRaw.startsWith("https://")) {
    return raw;
  }
  if (raw.startsWith("//")) return `https:${raw}`;
  return "";
};

export default function CollegeAdminNavbar({ onMenuClick }) {
  const { user, profile } = useAuth();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [collegeLogo, setCollegeLogo] = useState("");

  const collegeCode =
    normalizeCode(profile?.collegeCode || profile?.college_code) ||
    normalizeCode(
      String(profile?.projectCode || profile?.projectId || "").split(/[/-]/)[0],
    );

  useEffect(() => {
    let mounted = true;

    const loadCollegeLogo = async () => {
      if (!collegeCode) {
        if (mounted) setCollegeLogo("");
        return;
      }

      let college = null;
      try {
        college = await getCollegeByCode(collegeCode);
      } catch {
        college = null;
      }

      if (!college) {
        try {
          const lookupSnapshot = await getDocs(
            query(
              collection(db, "college"),
              where("college_code", "==", collegeCode),
              limit(1),
            ),
          );
          if (!lookupSnapshot.empty) {
            college = {
              collegeCode: lookupSnapshot.docs[0].id,
              ...lookupSnapshot.docs[0].data(),
            };
          }
        } catch {
          college = null;
        }
      }

      if (!mounted) return;

      setCollegeLogo(
        normalizeCollegeLogoUrl(
          college?.college_logo || college?.collegeLogo || college?.logo || "",
        ),
      );
      setLogoLoadFailed(false);
    };

    loadCollegeLogo();
    return () => {
      mounted = false;
    };
  }, [collegeCode]);

  const collegeInitials = (collegeCode || "CLG").slice(0, 2);

  return (
    <header className="px-4 pt-4 sm:px-6 md:hidden">
      <div className="collegeadmin-navbar-card rounded-3xl border border-[#D7E2F1] bg-white px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 p-2 text-gray-700"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>

          {collegeLogo && !logoLoadFailed ? (
            <img
              src={collegeLogo}
              alt="College"
              className="h-14 w-auto max-w-48 rounded-lg object-contain"
              referrerPolicy="no-referrer"
              onError={() => setLogoLoadFailed(true)}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#0B2A4A] text-base font-bold text-white">
              {collegeInitials}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
