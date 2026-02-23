// This file helps seed your local colleges data into Firestore
// Run this once to populate your database

import { colleges } from "../src/data/colleges";
import { projectCodes } from "../src/data/projectCodes";
import { students } from "../src/data/students";
import { seedColleges } from "./collegeService";
import { addProjectCode, getAllProjectCodes } from "./projectCodeService";
import { addStudent } from "./studentService";

export const seedCollegesData = async () => {
  try {
    console.log("Starting to seed colleges data...");

    // Seed colleges - document ID will be college code (college.id)
    await seedColleges(colleges);
    console.log("Successfully seeded all colleges!");
    return true;
  } catch (error) {
    console.error("Failed to seed colleges:", error);
    return false;
  }
};

export const seedProjectCodesData = async () => {
  try {
    console.log("Starting to seed project codes data...");

    for (const projectCode of projectCodes) {
      await addProjectCode({
        code: projectCode.code,
        collegeId: projectCode.collegeCode,
        college: projectCode.college,
        course: projectCode.course,
        year: projectCode.year,
        type: projectCode.type,
        academicYear: projectCode.academicYear,
        matched: projectCode.matched,
      });
    }

    console.log("Successfully seeded all project codes!");
    return true;
  } catch (error) {
    console.error("Failed to seed project codes:", error);
    return false;
  }
};

export const seedStudentsData = async () => {
  try {
    console.log("Starting to seed students data...");

    // Get the seeded project codes to assign students to them
    const projectCodesData = await getAllProjectCodes();

    if (projectCodesData.length === 0) {
      console.log("No project codes found. Please seed project codes first.");
      return false;
    }

    // Assign students to project codes in a round-robin fashion
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const projectCode = projectCodesData[i % projectCodesData.length];

      await addStudent({
        id: student.id,
        name: student.name,
        gender: student.gender,
        dob: student.dob,
        projectId: projectCode.code, // Use the actual project code
        certificate: student.certificate,
        progress: student.progress,
        exams: student.exams,
        tenthPercentage: student.tenthPercentage,
        twelfthPercentage: student.twelfthPercentage,
        admissionYear: student.admissionYear,
        currentSemester: student.currentSemester,
        email: student.email,
        phone: student.phone,
      });
    }

    console.log("Successfully seeded all students!");
    return true;
  } catch (error) {
    console.error("Failed to seed students:", error);
    return false;
  }
};

export const seedAllData = async () => {
  try {
    console.log("Starting to seed all data...");
    await seedCollegesData();
    await seedProjectCodesData();
    await seedStudentsData();
    console.log("Successfully seeded all data!");
    return true;
  } catch (error) {
    console.error("Failed to seed all data:", error);
    return false;
  }
};

// Usage: Call this function once from your component or a dedicated admin page
// Example:
// import { seedAllData } from "../services/seedData";
//
// const handleSeedData = async () => {
//   const success = await seedAllData();
//   if (success) {
//     alert("All data seeded successfully!");
//   }
// };
