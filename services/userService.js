import { db, firebaseConfig } from "../src/firebase/config";
import { createUserWithEmailAndPassword, getAuth, signOut } from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

const USERS_COLLECTION = "users";
const STUDENT_USERS_COLLECTION = "student_users";
const SECONDARY_APP_NAME = "secondary-user-creation";

const getSecondaryAuth = () => {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  const secondaryApp =
    existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
};

export const formatMobilePassword = (mobileValue) => {
  const digitsOnly = String(mobileValue || "").replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }
  return digitsOnly;
};

export const createStudentAuthUser = async (studentData) => {
  const email = String(studentData?.email || "")
    .trim()
    .toLowerCase();
  const name = String(studentData?.name || "").trim();
  const mobilePassword = formatMobilePassword(studentData?.mobile);
  const projectCode = String(studentData?.projectCode || "").trim();
  const collegeCode =
    String(studentData?.collegeCode || "").trim() ||
    String(projectCode || "").split("/")[0] ||
    "";
  const studentId = String(studentData?.studentId || "").trim();

  if (!email) {
    throw new Error("Student email is required for auth creation");
  }

  if (!mobilePassword) {
    throw new Error("Valid mobile number is required for auth password creation");
  }

  if (mobilePassword.length < 6) {
    throw new Error("Mobile number must have at least 6 digits for auth password");
  }

  const secondaryAuth = getSecondaryAuth();

  try {
    const existingStudentUsersQuery = query(
      collection(db, STUDENT_USERS_COLLECTION),
      where("email", "==", email),
    );
    const existingStudentUsersSnapshot = await getDocs(existingStudentUsersQuery);

    if (!existingStudentUsersSnapshot.empty) {
      // Keep one entry for the email and remove any duplicate docs.
      const existingDocs = existingStudentUsersSnapshot.docs;
      const docToKeep = existingDocs[0];
      const existingData = docToKeep.data() || {};
      const resolvedUid = String(existingData.uid || docToKeep.id).trim();

      if (existingDocs.length > 1) {
        await Promise.all(
          existingDocs
            .slice(1)
            .map((duplicateDoc) => deleteDoc(duplicateDoc.ref)),
        );
      }

      await setDoc(
        doc(db, STUDENT_USERS_COLLECTION, docToKeep.id),
        {
          uid: resolvedUid,
          email,
          name,
          role: "student",
          projectCode,
          collegeCode,
          studentId,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      return {
        uid: resolvedUid,
        email,
        skippedExisting: true,
      };
    }

    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      mobilePassword,
    );

    const uid = userCredential.user.uid;

    await setDoc(
      doc(db, STUDENT_USERS_COLLECTION, uid),
      {
        uid,
        email,
        name,
        role: "student",
        projectCode,
        collegeCode,
        studentId,
        createdAt: new Date(),
      },
      { merge: true },
    );

    return { uid, email };
  } catch (error) {
    console.error("Error creating student auth user:", error);
    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => null);
  }
};

// Create a college admin user in both Firebase Auth and Firestore
export const createCollegeAdmin = async (adminData, collegeCode) => {
  try {
    const secondaryAuth = getSecondaryAuth();

    // 1. Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      adminData.email,
      adminData.password,
    );

    const uid = userCredential.user.uid;

    // 2. Add user to Firestore with collegeAdmin role
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      uid: uid,
      name: adminData.name,
      email: adminData.email,
      role: "collegeAdmin",
      collegeCode: collegeCode,
      createdAt: new Date(),
    });

    await signOut(secondaryAuth);
    console.log("College admin created:", uid);
    return uid;
  } catch (error) {
    console.error("Error creating college admin:", error);
    throw error;
  }
};

// Create a super admin user in both Firebase Auth and Firestore
export const createSuperAdmin = async (adminData) => {
  try {
    const secondaryAuth = getSecondaryAuth();

    // 1. Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      adminData.email,
      adminData.password,
    );

    const uid = userCredential.user.uid;

    // 2. Add user to Firestore with superAdmin role
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      uid: uid,
      name: adminData.name,
      email: adminData.email,
      role: "superAdmin",
      createdAt: new Date(),
    });

    await signOut(secondaryAuth);
    console.log("Super admin created:", uid);
    return uid;
  } catch (error) {
    console.error("Error creating super admin:", error);
    throw error;
  }
};

// Get user by email
export const getUserByEmail = async (email) => {
  try {
    // Note: Firestore doesn't have a direct "where email" query in basic setup
    // This is a limitation - you might want to add an index or use a different approach
    console.log("Getting user by email:", email);
    return null;
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw error;
  }
};

// Get user by UID
export const getUserByUID = async (uid) => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        uid: docSnap.id,
        ...docSnap.data(),
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting user by UID:", error);
    throw error;
  }
};

// Get user by collegeCode
export const getUserByCollegeCode = async (collegeCode) => {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("collegeCode", "==", collegeCode),
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      return {
        uid: userDoc.id,
        ...userDoc.data(),
      };
    }
    console.log("No user found for college code:", collegeCode);
    return null;
  } catch (error) {
    console.error("Error getting user by college code:", error);
    throw error;
  }
};

// Get all admins (superAdmin and collegeAdmin)
export const getAllAdmins = async () => {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "in", ["superAdmin", "collegeAdmin"]),
    );
    const querySnapshot = await getDocs(q);
    const adminsList = [];
    querySnapshot.forEach((doc) => {
      adminsList.push({
        uid: doc.id,
        ...doc.data(),
      });
    });
    return adminsList;
  } catch (error) {
    console.error("Error getting all admins:", error);
    throw error;
  }
};

// Update an admin user in Firestore
export const updateAdmin = async (uid, updateData) => {
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(docRef, updateData);
    console.log("Admin updated:", uid);
    return true;
  } catch (error) {
    console.error("Error updating admin:", error);
    throw error;
  }
};

// Delete a college admin user from Firestore
export const deleteCollegeAdmin = async (uid) => {
  try {
    // Delete from Firestore
    await deleteDoc(doc(db, USERS_COLLECTION, uid));
    console.log("College admin deleted from Firestore:", uid);
    return true;
  } catch (error) {
    console.error("Error deleting college admin:", error);
    throw error;
  }
};
