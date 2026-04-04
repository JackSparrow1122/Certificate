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
  limit,
} from "firebase/firestore";
import { isLocalDbMode } from "./dbModeService";
import {
  localAddCollege,
  localCollegeExists,
  localDeleteCollege,
  localGetAllColleges,
  localGetCollegeByCode,
  localGetCollegeByName,
  localSeedColleges,
  localUpdateCollege,
} from "./localDbService";
import { softDeleteProjectCode } from "./projectCodeService";

const COLLEGES_COLLECTION = "college";

// Add a single college to Firestore with college_code as document ID
export const addCollege = async (collegeData) => {
  if (isLocalDbMode()) {
    return localAddCollege(collegeData);
  }
  try {
    const collegeCode = collegeData.college_code;
    const docRef = doc(db, COLLEGES_COLLECTION, collegeCode);
    await setDoc(docRef, {
      college_name: collegeData.college_name,
      college_code: collegeData.college_code,
      college_logo: collegeData.college_logo || "",
    });
    console.log("College added with code:", collegeCode);
    return collegeCode;
  } catch (error) {
    console.error("Error adding college:", error);
    throw error;
  }
};

// Seed multiple colleges to Firestore (batch add with college_code as document ID)
export const seedColleges = async (collegesData) => {
  if (isLocalDbMode()) {
    return localSeedColleges(collegesData);
  }
  try {
    const batch = writeBatch(db);

    collegesData.forEach((college) => {
      const collegeCode = college.id;
      const docRef = doc(db, COLLEGES_COLLECTION, collegeCode);
      batch.set(docRef, {
        college_name: college.name,
        college_code: college.id,
        college_logo: college.logo || "",
      });
    });

    await batch.commit();
    console.log("Successfully seeded", collegesData.length, "colleges");
    return true;
  } catch (error) {
    console.error("Error seeding colleges:", error);
    throw error;
  }
};

// Get all colleges
export const getAllColleges = async () => {
  if (isLocalDbMode()) {
    return localGetAllColleges();
  }
  try {
    const querySnapshot = await getDocs(collection(db, COLLEGES_COLLECTION));
    const colleges = [];
    querySnapshot.forEach((doc) => {
      colleges.push({
        collegeCode: doc.id,
        ...doc.data(),
      });
    });
    return colleges;
  } catch (error) {
    console.error("Error getting colleges:", error);
    throw error;
  }
};

// Get college by college_code (document ID)
export const getCollegeByCode = async (collegeCode) => {
  if (isLocalDbMode()) {
    return localGetCollegeByCode(collegeCode);
  }
  try {
    const docRef = doc(db, COLLEGES_COLLECTION, collegeCode);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return {
        collegeCode: docSnap.id,
        ...docSnap.data(),
      };
    } else {
      console.log("No college found with code:", collegeCode);
      return null;
    }
  } catch (error) {
    console.error("Error getting college:", error);
    throw error;
  }
};

// Update college
export const updateCollege = async (collegeCode, updateData) => {
  if (isLocalDbMode()) {
    return localUpdateCollege(collegeCode, updateData);
  }
  try {
    const docRef = doc(db, COLLEGES_COLLECTION, collegeCode);
    await updateDoc(docRef, {
      ...(updateData.college_name && { college_name: updateData.college_name }),
      ...(updateData.college_code && { college_code: updateData.college_code }),
      ...(updateData.college_logo && { college_logo: updateData.college_logo }),
    });
    console.log("College updated:", collegeCode);
    return true;
  } catch (error) {
    console.error("Error updating college:", error);
    throw error;
  }
};

// Delete college
export const deleteCollege = async (collegeCode) => {
  if (isLocalDbMode()) {
    return localDeleteCollege(collegeCode);
  }
  try {
    const normalizedCollegeCode = String(collegeCode || "").trim();

    const [byCollegeId, byCollegeCode] = await Promise.all([
      getDocs(
        query(
          collection(db, "projectCodes"),
          where("collegeId", "==", normalizedCollegeCode),
          limit(500),
        ),
      ),
      getDocs(
        query(
          collection(db, "projectCodes"),
          where("collegeCode", "==", normalizedCollegeCode),
          limit(500),
        ),
      ),
    ]);

    const projectMap = new Map();
    [byCollegeId, byCollegeCode].forEach((snapshot) => {
      snapshot.forEach((projectDoc) => {
        projectMap.set(projectDoc.id, {
          id: projectDoc.id,
          ...(projectDoc.data() || {}),
        });
      });
    });

    if (projectMap.size === 0) {
      const allProjects = await getDocs(collection(db, "projectCodes"));
      allProjects.forEach((projectDoc) => {
        const data = projectDoc.data() || {};
        const code = String(data?.code || "").trim().toUpperCase();
        if (code.startsWith(`${normalizedCollegeCode.toUpperCase()}/`)) {
          projectMap.set(projectDoc.id, {
            id: projectDoc.id,
            ...data,
          });
        }
      });
    }

    const projectRows = Array.from(projectMap.values());
    for (const projectRow of projectRows) {
      const projectCodeValue = String(projectRow?.code || "").trim();
      if (!projectCodeValue) continue;
      await softDeleteProjectCode(projectRow.id, projectCodeValue);
    }

    const studentLoginUsers = await getDocs(
      query(
        collection(db, "student_login_users"),
        where("collegeCode", "==", normalizedCollegeCode),
        limit(1000),
      ),
    );
    if (!studentLoginUsers.empty) {
      const docs = studentLoginUsers.docs;
      for (let index = 0; index < docs.length; index += 400) {
        const chunk = docs.slice(index, index + 400);
        const batch = writeBatch(db);
        chunk.forEach((studentLoginDoc) => batch.delete(studentLoginDoc.ref));
        await batch.commit();
      }
    }

    await deleteDoc(doc(db, COLLEGES_COLLECTION, collegeCode));
    console.log("College deleted:", collegeCode);
    return true;
  } catch (error) {
    console.error("Error deleting college:", error);
    throw error;
  }
};

// Check if college exists
export const collegeExists = async (collegeCode) => {
  if (isLocalDbMode()) {
    return localCollegeExists(collegeCode);
  }
  try {
    const docRef = doc(db, COLLEGES_COLLECTION, collegeCode);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error("Error checking if college exists:", error);
    throw error;
  }
};

// Get college by college name
export const getCollegeByName = async (collegeName) => {
  if (isLocalDbMode()) {
    return localGetCollegeByName(collegeName);
  }
  try {
    const q = query(
      collection(db, COLLEGES_COLLECTION),
      where("college_name", "==", collegeName),
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return {
        collegeCode: doc.id,
        ...doc.data(),
      };
    } else {
      console.log("No college found with name:", collegeName);
      return null;
    }
  } catch (error) {
    console.error("Error getting college by name:", error);
    throw error;
  }
};
