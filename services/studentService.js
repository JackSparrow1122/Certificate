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
  setDoc,
  writeBatch,
  increment,
  collectionGroup,
  documentId,
} from "firebase/firestore";
import { codeToDocId, docIdToCode } from "../src/utils/projectCodeUtils";
import { isLocalDbMode } from "./dbModeService";
import {
  localAddStudent,
  localDeleteStudent,
  localGetAllProjectCodesFromStudents,
  localGetAllStudents,
  localGetStudentByDocId,
  localGetStudentByEmail,
  localGetStudentById,
  localGetStudentByProjectAndId,
  localGetStudentForAuthUser,
  localGetStudentsByProject,
  localUpdateStudent,
} from "./localDbService";

const STUDENTS_COLLECTION = "students";
const CERTIFICATES_COLLECTION = "certificates";
const CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION =
  "certificateProjectEnrollments";

// Add a student to Firestore
export const addStudent = async (studentData) => {
  if (isLocalDbMode()) {
    return localAddStudent(studentData);
  }
  try {
    const enrollmentMappingsQuery = query(
      collection(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION),
      where("projectCode", "==", studentData.projectId),
    );
    const enrollmentMappingsSnapshot = await getDocs(enrollmentMappingsQuery);

    const certificateIds = [
      ...new Set(
        enrollmentMappingsSnapshot.docs
          .map((enrollmentDoc) => enrollmentDoc.data().certificateId)
          .filter(Boolean),
      ),
    ];

    const certificateDocs = await Promise.all(
      certificateIds.map((certificateId) =>
        getDoc(doc(db, CERTIFICATES_COLLECTION, certificateId)),
      ),
    );

    const certificateNames = certificateDocs
      .map((certificateDoc) =>
        certificateDoc.exists() ? certificateDoc.data().name : "",
      )
      .filter(Boolean);

    const certificateResults = certificateIds.reduce(
      (acc, certificateId, index) => {
        const certificateName = certificateNames[index] || "";
        if (!certificateName) {
          return acc;
        }

        acc[certificateId] = {
          certificateId,
          certificateName,
          status: "enrolled",
          updatedAt: new Date(),
        };
        return acc;
      },
      {},
    );

    const projectDocId = codeToDocId(studentData.projectId);
    const projectRef = doc(db, STUDENTS_COLLECTION, projectDocId);
    await setDoc(
      projectRef,
      {
        projectCode: studentData.projectId,
        collegeCode: studentData.collegeCode || "",
        isActive: true,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    const studentRef = doc(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
      String(studentData.id),
    );

    await setDoc(studentRef, {
      id: studentData.id,
      name: studentData.name,
      gender: studentData.gender,
      dob: studentData.dob,
      projectId: studentData.projectId,
      courseYear: studentData.courseYear || "",
      collegeCode: studentData.collegeCode || "",
      course: studentData.course || "",
      semesterLabel: studentData.semesterLabel || "",
      trainingType: studentData.trainingType || "",
      currentSession: studentData.currentSession || "",
      certificateIds,
      enrolledCertificates: certificateNames.filter(Boolean),
      certificate: certificateNames[0] || studentData.certificate || "",
      certificateStatus: certificateIds.length > 0 ? "enrolled" : "",
      certificateResults,
      progress: studentData.progress || "0%",
      exams: studentData.exams || "0 / 0",
      tenthPercentage: studentData.tenthPercentage,
      twelfthPercentage: studentData.twelfthPercentage,
      admissionYear: studentData.admissionYear,
      currentSemester: studentData.currentSemester,
      email: studentData.email,
      phone: studentData.phone,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      OFFICIAL_DETAILS: {
        SN: String(studentData.id || ""),
        "FULL NAME OF STUDENT": studentData.name || "",
        "EMAIL ID": studentData.email || "",
        "MOBILE NO.": studentData.phone || "",
        "BIRTH DATE": studentData.dob || "",
        GENDER: studentData.gender || "",
      },
      TENTH_DETAILS: {
        "10th OVERALL MARKS %": studentData.tenthPercentage,
      },
      TWELFTH_DETAILS: {
        "12th OVERALL MARKS %": studentData.twelfthPercentage,
      },
    });

    if (certificateIds.length > 0) {
      const batch = writeBatch(db);
      certificateIds.forEach((certificateId) => {
        batch.update(doc(db, CERTIFICATES_COLLECTION, certificateId), {
          enrolledCount: increment(1),
        });
      });
      await batch.commit();
    }

    console.log("Student added with ID:", studentData.id);
    return String(studentData.id);
  } catch (error) {
    console.error("Error adding student:", error);
    throw error;
  }
};

// Get all students
export const getAllStudents = async () => {
  if (isLocalDbMode()) {
    return localGetAllStudents();
  }
  try {
    // Use collectionGroup to query all students_list subcollections
    const allStudentsQuery = collectionGroup(db, "students_list");
    const querySnapshot = await getDocs(allStudentsQuery);
    const students = [];
    querySnapshot.forEach((studentDoc) => {
      students.push({
        docId: studentDoc.id,
        ...studentDoc.data(),
      });
    });
    return students;
  } catch (error) {
    console.error("Error getting students:", error);
    throw error;
  }
};

// Get students by project ID
export const getStudentsByProject = async (projectId) => {
  if (isLocalDbMode()) {
    return localGetStudentsByProject(projectId);
  }
  try {
    const projectDocId = codeToDocId(projectId);
    const studentsList = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const querySnapshot = await getDocs(studentsList);
    const students = [];
    querySnapshot.forEach((studentDoc) => {
      students.push({
        id: studentDoc.id,
        docId: studentDoc.id,
        projectCode: projectId,
        ...studentDoc.data(),
      });
    });
    return students;
  } catch (error) {
    console.error("Error getting students by project:", error);
    throw error;
  }
};

export const getStudentByDocId = async (studentDocId) => {
  if (isLocalDbMode()) {
    return localGetStudentByDocId(studentDocId);
  }
  try {
    if (!studentDocId) {
      return null;
    }

    const q = query(
      collectionGroup(db, "students_list"),
      where(documentId(), "==", String(studentDocId)),
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    const studentSnap = querySnapshot.docs[0];
    return {
      docId: studentSnap.id,
      ...studentSnap.data(),
    };
  } catch (error) {
    console.error("Error getting student by document ID:", error);
    throw error;
  }
};

// Update student
export const updateStudent = async (projectCode, id, updateData) => {
  if (isLocalDbMode()) {
    return localUpdateStudent(projectCode, id, updateData);
  }
  try {
    const projectDocId = codeToDocId(projectCode);
    const docRef = doc(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
      id,
    );
    await updateDoc(docRef, updateData);
    console.log("Student updated:", id);
    return true;
  } catch (error) {
    console.error("Error updating student:", error);
    throw error;
  }
};

// Delete student
export const deleteStudent = async (projectCode, id) => {
  if (isLocalDbMode()) {
    return localDeleteStudent(projectCode, id);
  }
  try {
    const projectDocId = codeToDocId(projectCode);
    await deleteDoc(
      doc(db, STUDENTS_COLLECTION, projectDocId, "students_list", id),
    );
    console.log("Student deleted:", id);
    return true;
  } catch (error) {
    console.error("Error deleting student:", error);
    throw error;
  }
};

// Get all unique project codes from students collection
export const getAllProjectCodesFromStudents = async () => {
  if (isLocalDbMode()) {
    return localGetAllProjectCodesFromStudents();
  }
  try {
    // Primary source: top-level students collection document IDs
    const studentsProjectsSnapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION),
    );

    const projectCodesSet = new Set();

    studentsProjectsSnapshot.forEach((projectDoc) => {
      const projectDocId = String(projectDoc.id || "").trim();
      if (!projectDocId) return;
      const projectCode = docIdToCode(projectDocId);
      if (projectCode) {
        projectCodesSet.add(projectCode);
      }
    });

    // Fallback: if no top-level docs found, infer from students_list collection group
    if (projectCodesSet.size === 0) {
      const allStudentsQuery = collectionGroup(db, "students_list");
      const querySnapshot = await getDocs(allStudentsQuery);
      querySnapshot.forEach((studentDoc) => {
        const pathSegments = studentDoc.ref.path.split("/");
        if (pathSegments.length >= 2) {
          const projectDocId = pathSegments[1];
          const projectCode = docIdToCode(projectDocId);
          if (projectCode) {
            projectCodesSet.add(projectCode);
          }
        }
      });
    }

    const projectCodes = Array.from(projectCodesSet)
      .map((code) => ({
        code,
        docId: codeToDocId(code),
      }))
      .sort((a, b) => a.code.localeCompare(b.code));

    return projectCodes;
  } catch (error) {
    console.error("Error getting project codes from students:", error);
    throw error;
  }
};

// Get a single student by their email (search across all students_list subcollections)
export const getStudentByEmail = async (email) => {
  if (isLocalDbMode()) {
    return localGetStudentByEmail(email);
  }
  try {
    if (!email) return null;

    const normalized = String(email).trim().toLowerCase();

    // Query all students_list documents and perform a case-insensitive match in JS.
    // This avoids relying on the stored email casing.
    const allQuery = collectionGroup(db, "students_list");
    const querySnapshot = await getDocs(allQuery);
    if (querySnapshot.empty) return null;

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data() || {};
      const candidate = String(data.email || "")
        .trim()
        .toLowerCase();
      if (candidate && candidate === normalized) {
        return {
          docId: docSnap.id,
          ...data,
        };
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting student by email:", error);
    throw error;
  }
};

// Get a single student by their roll/id (search across all students_list subcollections)
export const getStudentById = async (studentId) => {
  if (isLocalDbMode()) {
    return localGetStudentById(studentId);
  }
  try {
    if (!studentId) return null;
    const q = query(
      collectionGroup(db, "students_list"),
      where("id", "==", String(studentId)),
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return null;
    const docSnap = querySnapshot.docs[0];
    return {
      docId: docSnap.id,
      ...docSnap.data(),
    };
  } catch (error) {
    console.error("Error getting student by id:", error);
    throw error;
  }
};

// Get a single student by project code + roll/id
export const getStudentByProjectAndId = async (projectCode, studentId) => {
  if (isLocalDbMode()) {
    return localGetStudentByProjectAndId(projectCode, studentId);
  }
  try {
    if (!projectCode || !studentId) return null;
    const projectDocId = codeToDocId(String(projectCode));
    const studentRef = doc(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
      String(studentId),
    );
    const studentSnap = await getDoc(studentRef);
    if (!studentSnap.exists()) return null;
    return {
      docId: studentSnap.id,
      ...studentSnap.data(),
    };
  } catch (error) {
    console.error("Error getting student by project and id:", error);
    throw error;
  }
};

// Resolve logged-in student's full record using the same auth profile identity.
export const getStudentForAuthUser = async ({ profile, user } = {}) => {
  if (isLocalDbMode()) {
    return localGetStudentForAuthUser({ profile, user });
  }
  try {
    const profileProjectCode = String(
      profile?.projectCode || profile?.projectId || "",
    ).trim();
    const profileStudentId = String(
      profile?.studentId || profile?.id || "",
    ).trim();
    const profileEmail = String(profile?.email || user?.email || "").trim();

    if (profileProjectCode && profileStudentId) {
      const byProjectAndId = await getStudentByProjectAndId(
        profileProjectCode,
        profileStudentId,
      );
      if (byProjectAndId) return byProjectAndId;
    }

    if (profileStudentId) {
      const byId = await getStudentById(profileStudentId);
      if (byId) return byId;
    }

    if (profileEmail) {
      const byEmail = await getStudentByEmail(profileEmail);
      if (byEmail) return byEmail;
    }

    return null;
  } catch (error) {
    console.error("Error resolving student for auth user:", error);
    throw error;
  }
};
