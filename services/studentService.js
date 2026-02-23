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
} from "firebase/firestore";

const STUDENTS_COLLECTION = "students";

// Add a student to Firestore
export const addStudent = async (studentData) => {
  try {
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
      certificateIds: studentData.certificateIds || [],
      certificate: studentData.certificate || "",
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
    querySnapshot.forEach((doc) => {
      students.push({
        id: doc.id,
        ...doc.data(),
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
    querySnapshot.forEach((doc) => {
      students.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    return students;
  } catch (error) {
    console.error("Error getting students by project:", error);
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
