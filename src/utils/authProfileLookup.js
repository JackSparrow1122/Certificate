import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";

const isActiveProfile = (data) => (data?.isActive ?? true) !== false;

const getFirstDocData = (snapshot) => {
  if (!snapshot || snapshot.empty) {
    return null;
  }
  const firstActive = snapshot.docs.find((snapshotDoc) =>
    isActiveProfile(snapshotDoc.data() || {}),
  );
  if (!firstActive) {
    return null;
  }
  return { id: firstActive.id, ...(firstActive.data() || {}) };
};

export const getAuthUserProfile = async ({ uid, email }) => {
  if (uid) {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      const userData = userSnap.data() || {};
      if (isActiveProfile(userData)) {
        return { id: userSnap.id, ...userData };
      }
      return null;
    }
  }

  if (uid) {
    const studentByIdSnap = await getDoc(doc(db, "student_login_users", uid));
    if (studentByIdSnap.exists()) {
      const studentByIdData = studentByIdSnap.data() || {};
      if (isActiveProfile(studentByIdData)) {
        return {
          id: studentByIdSnap.id,
          role: studentByIdData.role || "student",
          ...studentByIdData,
        };
      }
    }
  }

  if (uid) {
    const studentByUidSnap = await getDocs(
      query(
        collection(db, "student_login_users"),
        where("uid", "==", uid),
        limit(1),
      ),
    );
    const studentByUid = getFirstDocData(studentByUidSnap);
    if (studentByUid) {
      return { role: studentByUid.role || "student", ...studentByUid };
    }
  }

  const rawEmail = String(email || "").trim();
  if (rawEmail) {
    const normalizedEmail = rawEmail.toLowerCase();
    const studentByLowerEmailSnap = await getDocs(
      query(
        collection(db, "student_login_users"),
        where("emailLower", "==", normalizedEmail),
        limit(1),
      ),
    );
    const studentByLowerEmail = getFirstDocData(studentByLowerEmailSnap);
    if (studentByLowerEmail) {
      return {
        role: studentByLowerEmail.role || "student",
        ...studentByLowerEmail,
      };
    }

    const studentByRawEmailSnap = await getDocs(
      query(
        collection(db, "student_login_users"),
        where("email", "==", rawEmail),
        limit(1),
      ),
    );
    const studentByRawEmail = getFirstDocData(studentByRawEmailSnap);
    if (studentByRawEmail) {
      return {
        role: studentByRawEmail.role || "student",
        ...studentByRawEmail,
      };
    }

    if (normalizedEmail !== rawEmail) {
      const studentByNormalizedEmailSnap = await getDocs(
        query(
          collection(db, "student_login_users"),
          where("email", "==", normalizedEmail),
          limit(1),
        ),
      );
      const studentByNormalizedEmail = getFirstDocData(
        studentByNormalizedEmailSnap,
      );
      if (studentByNormalizedEmail) {
        return {
          role: studentByNormalizedEmail.role || "student",
          ...studentByNormalizedEmail,
        };
      }
    }

    // Legacy fallback support: old student_users collection.
    const legacyStudentByEmail = await getDocs(
      query(
        collection(db, "student_users"),
        where("email", "==", normalizedEmail),
        limit(1),
      ),
    );
    const legacyStudent = getFirstDocData(legacyStudentByEmail);
    if (legacyStudent) {
      return { role: legacyStudent.role || "student", ...legacyStudent };
    }
  }

  return null;
};
