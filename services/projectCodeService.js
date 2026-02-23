import { db } from "../src/firebase/config";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  setDoc,
  addDoc,
} from "firebase/firestore";

const PROJECT_CODES_COLLECTION = "projectCodes";

// Add a project code to Firestore
export const addProjectCode = async (projectData) => {
  try {
    const docRef = await addDoc(collection(db, PROJECT_CODES_COLLECTION), {
      code: projectData.code,
      collegeId: projectData.collegeId,
      college: projectData.college,
      course: projectData.course,
      year: projectData.year,
      type: projectData.type,
      academicYear: projectData.academicYear,
      matched: projectData.matched || false,
      createdAt: new Date(),
    });
    console.log("Project code added with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding project code:", error);
    throw error;
  }
};

// Get all project codes
export const getAllProjectCodes = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, PROJECT_CODES_COLLECTION));
    const projectCodes = [];
    querySnapshot.forEach((doc) => {
      projectCodes.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    return projectCodes;
  } catch (error) {
    console.error("Error getting project codes:", error);
    throw error;
  }
};

// Get project codes by college ID
export const getProjectCodesByCollege = async (collegeId) => {
  try {
    const q = query(
      collection(db, PROJECT_CODES_COLLECTION),
      where("collegeId", "==", collegeId)
    );
    const querySnapshot = await getDocs(q);
    const projectCodes = [];
    querySnapshot.forEach((doc) => {
      projectCodes.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    return projectCodes;
  } catch (error) {
    console.error("Error getting project codes by college:", error);
    throw error;
  }
};

// Get project code by ID
export const getProjectCodeById = async (id) => {
  try {
    const docRef = doc(db, PROJECT_CODES_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      };
    } else {
      console.log("No project code found with ID:", id);
      return null;
    }
  } catch (error) {
    console.error("Error getting project code:", error);
    throw error;
  }
};

// Update project code
export const updateProjectCode = async (id, updateData) => {
  try {
    const docRef = doc(db, PROJECT_CODES_COLLECTION, id);
    await updateDoc(docRef, updateData);
    console.log("Project code updated:", id);
    return true;
  } catch (error) {
    console.error("Error updating project code:", error);
    throw error;
  }
};

// Delete project code
export const deleteProjectCode = async (id) => {
  try {
    await deleteDoc(doc(db, PROJECT_CODES_COLLECTION, id));
    console.log("Project code deleted:", id);
    return true;
  } catch (error) {
    console.error("Error deleting project code:", error);
    throw error;
  }
};