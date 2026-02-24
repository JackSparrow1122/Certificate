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
  addDoc,
  writeBatch,
  increment,
} from "firebase/firestore";

const STUDENTS_COLLECTION = "students";
const CERTIFICATES_COLLECTION = "certificates";
const CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION = "certificateProjectEnrollments";

// Add a student to Firestore
export const addStudent = async (studentData) => {
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
      .map((certificateDoc) => (certificateDoc.exists() ? certificateDoc.data().name : ""))
      .filter(Boolean);

    const docRef = await addDoc(collection(db, STUDENTS_COLLECTION), {
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
      progress: studentData.progress || "0%",
      exams: studentData.exams || "0 / 0",
      tenthPercentage: studentData.tenthPercentage,
      twelfthPercentage: studentData.twelfthPercentage,
      admissionYear: studentData.admissionYear,
      currentSemester: studentData.currentSemester,
      email: studentData.email,
      phone: studentData.phone,
      createdAt: new Date(),
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

    console.log("Student added with ID:", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding student:", error);
    throw error;
  }
};

// Get all students
export const getAllStudents = async () => {
  try {
    const querySnapshot = await getDocs(collection(db, STUDENTS_COLLECTION));
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
  try {
    const q = query(
      collection(db, STUDENTS_COLLECTION),
      where("projectId", "==", projectId)
    );
    const querySnapshot = await getDocs(q);
    const students = [];
    querySnapshot.forEach((studentDoc) => {
      students.push({
        docId: studentDoc.id,
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
  try {
    const studentRef = doc(db, STUDENTS_COLLECTION, studentDocId);
    const studentSnap = await getDoc(studentRef);
    if (!studentSnap.exists()) {
      return null;
    }
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
export const updateStudent = async (id, updateData) => {
  try {
    const docRef = doc(db, STUDENTS_COLLECTION, id);
    await updateDoc(docRef, updateData);
    console.log("Student updated:", id);
    return true;
  } catch (error) {
    console.error("Error updating student:", error);
    throw error;
  }
};

// Delete student
export const deleteStudent = async (id) => {
  try {
    await deleteDoc(doc(db, STUDENTS_COLLECTION, id));
    console.log("Student deleted:", id);
    return true;
  } catch (error) {
    console.error("Error deleting student:", error);
    throw error;
  }
};
