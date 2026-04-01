import { db } from "../src/firebase/config";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  where,
  writeBatch,
  setDoc,
  addDoc,
  arrayUnion,
} from "firebase/firestore";
import { codeToDocId } from "../src/utils/projectCodeUtils";
import { isLocalDbMode } from "./dbModeService";
import {
  localAddProjectCode,
  localGetAllProjectCodes,
  localGetProjectCodeById,
  localGetProjectCodesByCollege,
  localSoftDeleteProjectCode,
  localUpdateProjectCode,
} from "./localDbService";

const PROJECT_CODES_COLLECTION = "projectCodes";
const STUDENTS_COLLECTION = "students";
const BATCH_CHUNK_SIZE = 400;

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const setStudentsProjectActiveStatus = async (projectCode, isActive) => {
  if (!projectCode) {
    return;
  }
  const projectDocId = codeToDocId(projectCode);
  const projectRef = doc(db, STUDENTS_COLLECTION, projectDocId);

  await setDoc(
    projectRef,
    {
      projectCode,
      isActive,
      updatedAt: new Date(),
    },
    { merge: true },
  );

  const studentsSnapshot = await getDocs(
    collection(db, STUDENTS_COLLECTION, projectDocId, "students_list"),
  );

  if (!studentsSnapshot.empty) {
    const studentDocs = studentsSnapshot.docs;
    for (let i = 0; i < studentDocs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = studentDocs.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((studentDoc) => {
        batch.set(
          studentDoc.ref,
          {
            isActive,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
      await batch.commit();
    }
  }

  const studentUsersSnapshot = await getDocs(
    query(
      collection(db, "student_users"),
      where("projectCode", "==", projectCode),
    ),
  );
  if (!studentUsersSnapshot.empty) {
    const userDocs = studentUsersSnapshot.docs;
    for (let i = 0; i < userDocs.length; i += BATCH_CHUNK_SIZE) {
      const chunk = userDocs.slice(i, i + BATCH_CHUNK_SIZE);
      const usersBatch = writeBatch(db);
      chunk.forEach((studentUserDoc) => {
        usersBatch.set(
          studentUserDoc.ref,
          {
            isActive,
            deletedAt: isActive ? null : new Date(),
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
      await usersBatch.commit();
    }
  }
};

// Add a project code to Firestore
export const addProjectCode = async (projectData) => {
  if (isLocalDbMode()) {
    return localAddProjectCode(projectData);
  }
  try {
    const normalizedCode = String(projectData.code || "")
      .trim()
      .toUpperCase();
    const normalizedCollegeId = String(projectData.collegeId || "").trim();

    const existingCodesSnapshot = await getDocs(
      query(
        collection(db, PROJECT_CODES_COLLECTION),
        where("collegeId", "==", normalizedCollegeId),
      ),
    );

    const matchingExistingDoc = existingCodesSnapshot.docs.find((projectDoc) => {
      const projectDocData = projectDoc.data() || {};
      const existingCode = String(projectDocData.code || "")
        .trim()
        .toUpperCase();
      return existingCode === normalizedCode;
    });

    if (matchingExistingDoc) {
      const existingData = matchingExistingDoc.data() || {};
      const existingIsActive = existingData.isActive !== false;

      if (existingIsActive) {
        const duplicateError = new Error("Project code already exists");
        duplicateError.code = "project-code/already-exists";
        throw duplicateError;
      }

      await updateDoc(matchingExistingDoc.ref, {
        code: normalizedCode,
        collegeId: normalizedCollegeId,
        college: projectData.college,
        course: projectData.course,
        year: projectData.year,
        type: projectData.type,
        academicYear: projectData.academicYear,
        matched: projectData.matched || false,
        isActive: true,
        deletedAt: null,
        updatedAt: new Date(),
      });

      try {
        const collegeDocId =
          projectData.collegeId || projectData.collegeCode || projectData.college;
        if (collegeDocId) {
          const collegeRef = doc(db, "college", String(collegeDocId));
          await updateDoc(collegeRef, {
            project_codes: arrayUnion(normalizedCode),
          });
        }
      } catch (err) {
        console.error(
          "Failed to update college document with restored project code:",
          err,
        );
      }

      await setStudentsProjectActiveStatus(normalizedCode, true);
      return matchingExistingDoc.id;
    }

    // Create a fresh document only when this code does not already exist.
    const docRef = await addDoc(collection(db, PROJECT_CODES_COLLECTION), {
      code: normalizedCode,
      collegeId: normalizedCollegeId,
      college: projectData.college,
      course: projectData.course,
      year: projectData.year,
      type: projectData.type,
      academicYear: projectData.academicYear,
      matched: projectData.matched || false,
      isActive: true,
      createdAt: new Date(),
    });
    console.log("Project code added with ID:", docRef.id);

    // Also add this project code to the corresponding college document
    try {
      const collegeDocId =
        projectData.collegeId || projectData.collegeCode || projectData.college;
      if (collegeDocId) {
        const collegeRef = doc(db, "college", String(collegeDocId));
        await updateDoc(collegeRef, {
          project_codes: arrayUnion(normalizedCode),
        });
      }
    } catch (err) {
      // Non-fatal: log and continue
      console.error(
        "Failed to update college document with project code:",
        err,
      );
    }
    await setStudentsProjectActiveStatus(normalizedCode, true);
    return docRef.id;
  } catch (error) {
    console.error("Error adding project code:", error);
    throw error;
  }
};

// Get all project codes
export const getAllProjectCodes = async () => {
  if (isLocalDbMode()) {
    return localGetAllProjectCodes();
  }
  try {
    const querySnapshot = await getDocs(
      collection(db, PROJECT_CODES_COLLECTION),
    );
    const projectCodes = [];
    querySnapshot.forEach((doc) => {
      projectCodes.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    return projectCodes.filter((projectCode) => projectCode.isActive !== false);
  } catch (error) {
    console.error("Error getting project codes:", error);
    throw error;
  }
};

// Get project codes by college ID or collegeCode/college alias; fallback to code prefix matching.
export const getProjectCodesByCollege = async (collegeId) => {
  if (isLocalDbMode()) {
    return localGetProjectCodesByCollege(collegeId);
  }

  const normalizeValue = (value) =>
    String(value || "").trim().toUpperCase();

  const normalizedCollegeId = normalizeValue(collegeId);
  if (!normalizedCollegeId) return [];

  try {
    const fetchActive = (snapshot) => {
      const list = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      return list.filter((projectCode) => projectCode.isActive !== false);
    };

    // Try explicit collegeId field first
    const byCollegeIdSnapshot = await getDocs(
      query(
        collection(db, PROJECT_CODES_COLLECTION),
        where("collegeId", "==", collegeId),
      ),
    );
    let projectCodes = fetchActive(byCollegeIdSnapshot);
    if (projectCodes.length > 0) return projectCodes;

    // Try collegeCode field (legacy path)
    const byCollegeCodeSnapshot = await getDocs(
      query(
        collection(db, PROJECT_CODES_COLLECTION),
        where("collegeCode", "==", collegeId),
      ),
    );
    projectCodes = fetchActive(byCollegeCodeSnapshot);
    if (projectCodes.length > 0) return projectCodes;

    // Try college field
    const byCollegeSnapshot = await getDocs(
      query(
        collection(db, PROJECT_CODES_COLLECTION),
        where("college", "==", collegeId),
      ),
    );
    projectCodes = fetchActive(byCollegeSnapshot);
    if (projectCodes.length > 0) return projectCodes;

    // Fallback: code prefix match (`ABC/...` or `ABC-...`) or normalized college fields
    const allSnapshot = await getDocs(collection(db, PROJECT_CODES_COLLECTION));
    projectCodes = [];
    allSnapshot.forEach((doc) => {
      const data = doc.data() || {};
      const code = String(data.code || "").trim();
      const dataCollegeId = normalizeValue(data.collegeId);
      const dataCollegeCode = normalizeValue(data.collegeCode);
      const dataCollegeLegacy = normalizeValue(data.college);
      const normalizedCode = normalizeValue(code).replace(/\\\\/g, "-");
      const prefixMatch =
        normalizedCode.startsWith(`${normalizedCollegeId}/`.toUpperCase()) ||
        normalizedCode.startsWith(`${normalizedCollegeId}-`.toUpperCase());

      if (
        data.isActive !== false &&
        (dataCollegeId === normalizedCollegeId ||
          dataCollegeCode === normalizedCollegeId ||
          dataCollegeLegacy === normalizedCollegeId ||
          prefixMatch)
      ) {
        projectCodes.push({ id: doc.id, ...data });
      }
    });

    return projectCodes;
  } catch (error) {
    console.error("Error getting project codes by college:", error);
    throw error;
  }
};

// Get project code by ID
export const getProjectCodeById = async (id) => {
  if (isLocalDbMode()) {
    return localGetProjectCodeById(id);
  }
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
  if (isLocalDbMode()) {
    return localUpdateProjectCode(id, updateData);
  }
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

// Soft delete project code
export const softDeleteProjectCode = async (id, projectCode) => {
  if (isLocalDbMode()) {
    return localSoftDeleteProjectCode(id, projectCode);
  }
  try {
    await updateDoc(doc(db, PROJECT_CODES_COLLECTION, id), {
      isActive: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    });
    await setStudentsProjectActiveStatus(projectCode, false);
    console.log("Project code soft-deleted:", id);
    return true;
  } catch (error) {
    console.error("Error soft deleting project code:", error);
    throw error;
  }
};

// Re-run matching for all active project codes against current colleges in DB.
export const rerunProjectCodeMatching = async () => {
  try {
    const [projectCodesSnapshot, collegesSnapshot] = await Promise.all([
      getDocs(collection(db, PROJECT_CODES_COLLECTION)),
      getDocs(collection(db, "college")),
    ]);

    const collegesMap = new Map();
    collegesSnapshot.forEach((collegeDoc) => {
      const data = collegeDoc.data() || {};
      const code = normalizeCode(data.college_code || collegeDoc.id);
      if (code) collegesMap.set(code, data);
    });

    const activeProjectDocs = projectCodesSnapshot.docs.filter(
      (projectDoc) => (projectDoc.data() || {}).isActive !== false,
    );

    let updatedCount = 0;
    let matchedCount = 0;
    let unmatchedCount = 0;

    for (let index = 0; index < activeProjectDocs.length; index += 400) {
      const chunk = activeProjectDocs.slice(index, index + 400);
      const batch = writeBatch(db);
      let chunkHasUpdates = false;

      chunk.forEach((projectDoc) => {
        const projectData = projectDoc.data() || {};
        const codePrefix = normalizeCode(
          String(projectData.code || "").split("/")[0],
        );
        const lookupCode = normalizeCode(projectData.collegeId || codePrefix);
        const mappedCollege = collegesMap.get(lookupCode);

        const nextMatched = Boolean(mappedCollege);
        const nextCollegeName =
          mappedCollege?.college_name ||
          String(projectData.college || lookupCode || "").trim();

        if (nextMatched) matchedCount += 1;
        else unmatchedCount += 1;

        if (
          Boolean(projectData.matched) !== nextMatched ||
          String(projectData.college || "").trim() !== nextCollegeName
        ) {
          batch.update(projectDoc.ref, {
            matched: nextMatched,
            college: nextCollegeName,
            updatedAt: new Date(),
          });
          updatedCount += 1;
          chunkHasUpdates = true;
        }
      });

      if (chunkHasUpdates) {
        await batch.commit();
      }
    }

    return {
      total: activeProjectDocs.length,
      updated: updatedCount,
      matched: matchedCount,
      unmatched: unmatchedCount,
    };
  } catch (error) {
    console.error("Error rerunning project code matching:", error);
    throw error;
  }
};
