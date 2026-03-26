import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { codeToDocId } from "./projectCodeUtils";

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

const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getFirstActiveStudentDoc = (snapshots) => {
  for (const snapshot of snapshots) {
    if (!snapshot || snapshot.empty) continue;
    const activeDoc = snapshot.docs.find((snapshotDoc) =>
      isActiveProfile(snapshotDoc.data() || {}),
    );
    if (activeDoc) return activeDoc;
  }
  return null;
};

const findStudentFromStudentsList = async ({ uid, email }) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const lookups = [
    query(
      collectionGroup(db, "students_list"),
      where("email", "==", normalized),
      limit(1),
    ),
    query(
      collectionGroup(db, "students_list"),
      where("OFFICIAL_DETAILS.EMAIL_ID", "==", normalized),
      limit(1),
    ),
  ];

  const rawEmail = String(email || "").trim();
  if (rawEmail && rawEmail !== normalized) {
    lookups.push(
      query(
        collectionGroup(db, "students_list"),
        where("email", "==", rawEmail),
        limit(1),
      ),
      query(
        collectionGroup(db, "students_list"),
        where("OFFICIAL_DETAILS.EMAIL_ID", "==", rawEmail),
        limit(1),
      ),
      query(
        collectionGroup(db, "students_list"),
        where("OFFICIAL_DETAILS.EMAIL_ID.", "==", rawEmail),
        limit(1),
      ),
    );
  }

  const snapshots = await Promise.all(lookups.map((lookup) => getDocs(lookup)));
  const studentDoc = getFirstActiveStudentDoc(snapshots);
  if (!studentDoc) return null;

  const studentData = studentDoc.data() || {};
  const projectCode = String(
    studentData.projectCode || studentData.projectId || "",
  ).trim();
  const collegeCode =
    String(studentData.collegeCode || "").trim() ||
    String(projectCode || "").split("/")[0] ||
    "";

  const studentId = String(
    studentData.id || studentDoc.id || studentData.OFFICIAL_DETAILS?.SN || "",
  ).trim();

  const resolvedUid = String(studentData.uid || uid || "").trim();
  const resolvedEmail =
    normalizeEmail(
      studentData.email || studentData.OFFICIAL_DETAILS?.EMAIL_ID,
    ) || normalized;

  return {
    uid: resolvedUid,
    email: resolvedEmail,
    name: String(
      studentData.name ||
        studentData.OFFICIAL_DETAILS?.["FULL NAME OF STUDENT"] ||
        "",
    ).trim(),
    role: "student",
    projectCode,
    projectDocId: projectCode ? codeToDocId(projectCode) : "",
    studentId,
    collegeCode,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const getAuthUserProfile = async ({ uid, email }) => {
  if (!uid) {
    return null;
  }

  const userSnap = await getDoc(doc(db, "users", uid));
  if (userSnap.exists()) {
    const userData = userSnap.data() || {};
    if (isActiveProfile(userData)) {
      return { id: userSnap.id, ...userData };
    }
    return null;
  }

  const studentByIdSnap = await getDoc(doc(db, "student_users", uid));
  if (studentByIdSnap.exists()) {
    const studentByIdData = studentByIdSnap.data() || {};
    if (isActiveProfile(studentByIdData)) {
      return { id: studentByIdSnap.id, ...studentByIdData };
    }
  }

  const studentByUidSnap = await getDocs(
    query(collection(db, "student_users"), where("uid", "==", uid), limit(1)),
  );
  const studentByUid = getFirstDocData(studentByUidSnap);
  if (studentByUid) {
    return studentByUid;
  }

  const rawEmail = String(email || "").trim();
  if (rawEmail) {
    const studentByRawEmailSnap = await getDocs(
      query(
        collection(db, "student_users"),
        where("email", "==", rawEmail),
        limit(1),
      ),
    );
    const studentByRawEmail = getFirstDocData(studentByRawEmailSnap);
    if (studentByRawEmail) {
      return studentByRawEmail;
    }

    const normalizedEmail = rawEmail.toLowerCase();
    if (normalizedEmail !== rawEmail) {
      const studentByNormalizedEmailSnap = await getDocs(
        query(
          collection(db, "student_users"),
          where("email", "==", normalizedEmail),
          limit(1),
        ),
      );
      const studentByNormalizedEmail = getFirstDocData(
        studentByNormalizedEmailSnap,
      );
      if (studentByNormalizedEmail) {
        return studentByNormalizedEmail;
      }
    }
  }

  const fallbackStudentProfile = await findStudentFromStudentsList({
    uid,
    email,
  });
  if (fallbackStudentProfile?.uid) {
    try {
      await setDoc(
        doc(db, "student_users", fallbackStudentProfile.uid),
        {
          ...fallbackStudentProfile,
          studentPath:
            fallbackStudentProfile.projectDocId &&
            fallbackStudentProfile.studentId
              ? `students/${fallbackStudentProfile.projectDocId}/students_list/${fallbackStudentProfile.studentId}`
              : "",
        },
        { merge: true },
      );
    } catch (profileWriteError) {
      console.warn(
        "Unable to auto-create student_users profile:",
        profileWriteError,
      );
    }

    return {
      id: fallbackStudentProfile.uid,
      ...fallbackStudentProfile,
    };
  }

  return null;
};
