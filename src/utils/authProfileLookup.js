import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

const getFirstDocData = (snapshot) => {
  if (!snapshot || snapshot.empty) {
    return null;
  }
  const first = snapshot.docs[0];
  return { id: first.id, ...(first.data() || {}) };
};

export const getAuthUserProfile = async ({ uid, email }) => {
  if (!uid) {
    return null;
  }

  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    return { id: userSnap.id, ...(userSnap.data() || {}) };
  }

  const studentByIdSnap = await getDoc(doc(db, "student_users", uid));
  if (studentByIdSnap.exists()) {
    return { id: studentByIdSnap.id, ...(studentByIdSnap.data() || {}) };
  }

  const studentByUidSnap = await getDocs(
    query(collection(db, "student_users"), where("uid", "==", uid), limit(1)),
  );
  const studentByUid = getFirstDocData(studentByUidSnap);
  if (studentByUid) {
    return studentByUid;
  }

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (normalizedEmail) {
    const studentByEmailSnap = await getDocs(
      query(
        collection(db, "student_users"),
        where("email", "==", normalizedEmail),
        limit(1),
      ),
    );
    const studentByEmail = getFirstDocData(studentByEmailSnap);
    if (studentByEmail) {
      return studentByEmail;
    }
  }

  return null;
};
