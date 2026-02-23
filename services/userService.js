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
const SECONDARY_APP_NAME = "secondary-user-creation";

const getSecondaryAuth = () => {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  const secondaryApp =
    existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
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
    const usersRef = collection(db, USERS_COLLECTION);
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
