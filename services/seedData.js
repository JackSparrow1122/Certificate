// This file helps seed your local colleges data into Firestore
// Run this once to populate your database

import { colleges } from "../src/data/colleges";
import { projectCodes } from "../src/data/projectCodes";
// Embedded student seed data (was src/data/students.js) — used only for seeding
const students = [
  { id: "STU001", name: "Aarav Sharma", gender: "Male", dob: "2003-05-12", projectId: "ICEM-CSE-2023", certificate: "AWS Cloud", progress: "70%", exams: "2 / 3", tenthPercentage: 88, twelfthPercentage: 85, admissionYear: 2021, currentYear: 6, email: "aarav@icem.edu", phone: "+91 9876543210" },
  { id: "STU002", name: "Priya Verma", gender: "Female", dob: "2003-08-21", projectId: "ICEM-CSE-2023", certificate: "React Developer", progress: "100%", exams: "4 / 4", tenthPercentage: 92, twelfthPercentage: 90, admissionYear: 2021, currentYear: 6, email: "priya@icem.edu", phone: "+91 9876501234" },
  { id: "STU003", name: "Rohit Patil", gender: "Male", dob: "2002-11-02", projectId: "ICEM-CSE-2023", certificate: "Java Backend", progress: "55%", exams: "1 / 3", tenthPercentage: 81, twelfthPercentage: 78, admissionYear: 2021, currentYear: 6, email: "rohit@icem.edu", phone: "+91 9811122233" },
  { id: "STU004", name: "Nikhil Pawar", gender: "Male", dob: "2003-01-19", projectId: "ICEM-CSE-2023", certificate: "Spring Boot", progress: "65%", exams: "2 / 3", tenthPercentage: 84, twelfthPercentage: 80, admissionYear: 2021, currentYear: 6, email: "nikhil@icem.edu", phone: "+91 9888777666" },
  { id: "STU005", name: "Riya Kulkarni", gender: "Female", dob: "2003-09-08", projectId: "ICEM-CSE-2023", certificate: "DSA with Java", progress: "40%", exams: "1 / 4", tenthPercentage: 86, twelfthPercentage: 83, admissionYear: 2021, currentYear: 6, email: "riya@icem.edu", phone: "+91 9777888999" },
  { id: "STU006", name: "Rahul Singh", gender: "Male", dob: "2004-03-11", projectId: "ICEM-CSE-2024", certificate: "DSA Advanced", progress: "35%", exams: "1 / 4", tenthPercentage: 79, twelfthPercentage: 75, admissionYear: 2022, currentYear: 4, email: "rahul@icem.edu", phone: "+91 9444555666" },
  { id: "STU007", name: "Ananya Gupta", gender: "Female", dob: "2004-07-27", projectId: "ICEM-CSE-2024", certificate: "Full Stack Web", progress: "75%", exams: "3 / 4", tenthPercentage: 91, twelfthPercentage: 89, admissionYear: 2022, currentYear: 4, email: "ananya@icem.edu", phone: "+91 9555666777" },
  { id: "STU008", name: "Kriti Malhotra", gender: "Female", dob: "2004-12-15", projectId: "ICEM-CSE-2024", certificate: "Node.js Backend", progress: "85%", exams: "3 / 4", tenthPercentage: 90, twelfthPercentage: 88, admissionYear: 2022, currentYear: 4, email: "kriti@icem.edu", phone: "+91 9888999000" },
  { id: "STU009", name: "Yash Kulkarni", gender: "Male", dob: "2004-05-03", projectId: "ICEM-CSE-2024", certificate: "System Design", progress: "40%", exams: "1 / 3", tenthPercentage: 82, twelfthPercentage: 79, admissionYear: 2022, currentYear: 4, email: "yash@icem.edu", phone: "+91 9000099999" },
  { id: "STU010", name: "Sakshi Jain", gender: "Female", dob: "2004-10-22", projectId: "ICEM-CSE-2024", certificate: "React Advanced", progress: "60%", exams: "2 / 3", tenthPercentage: 89, twelfthPercentage: 86, admissionYear: 2022, currentYear: 4, email: "sakshi@icem.edu", phone: "+91 9888001122" },
  { id: "STU011", name: "Sneha Kulkarni", gender: "Female", dob: "2004-02-18", projectId: "ICEM-IT-2024", certificate: "Python Data Science", progress: "45%", exams: "1 / 3", tenthPercentage: 86, twelfthPercentage: 82, admissionYear: 2022, currentYear: 4, email: "sneha@icem.edu", phone: "+91 9898989898" },
  { id: "STU012", name: "Aditya Joshi", gender: "Male", dob: "2004-06-30", projectId: "ICEM-IT-2024", certificate: "Machine Learning", progress: "80%", exams: "3 / 4", tenthPercentage: 89, twelfthPercentage: 87, admissionYear: 2022, currentYear: 4, email: "aditya@icem.edu", phone: "+91 9000011111" },
  { id: "STU013", name: "Neha Deshmukh", gender: "Female", dob: "2004-01-14", projectId: "ICEM-IT-2024", certificate: "SQL & Databases", progress: "100%", exams: "2 / 2", tenthPercentage: 91, twelfthPercentage: 88, admissionYear: 2022, currentYear: 4, email: "neha@icem.edu", phone: "+91 9111222333" },
  { id: "STU014", name: "Sahil More", gender: "Male", dob: "2004-09-09", projectId: "ICEM-IT-2024", certificate: "Cloud Fundamentals", progress: "60%", exams: "2 / 3", tenthPercentage: 83, twelfthPercentage: 80, admissionYear: 2022, currentYear: 4, email: "sahil@icem.edu", phone: "+91 9777666555" },
  { id: "STU015", name: "Komal Patil", gender: "Female", dob: "2004-04-26", projectId: "ICEM-IT-2024", certificate: "Linux Admin", progress: "50%", exams: "1 / 2", tenthPercentage: 85, twelfthPercentage: 81, admissionYear: 2022, currentYear: 4, email: "komal@icem.edu", phone: "+91 9888111222" },
  { id: "STU016", name: "Kunal Mehta", gender: "Male", dob: "2003-01-09", projectId: "ICEM-AIML-2023", certificate: "AI Foundations", progress: "60%", exams: "2 / 3", tenthPercentage: 90, twelfthPercentage: 88, admissionYear: 2021, currentYear: 6, email: "kunal@icem.edu", phone: "+91 9222333444" },
  { id: "STU017", name: "Seema Heidharr", gender: "Female", dob: "2003-09-14", projectId: "ICEM-AIML-2023", certificate: "Deep Learning", progress: "90%", exams: "3 / 3", tenthPercentage: 93, twelfthPercentage: 91, admissionYear: 2021, currentYear: 6, email: "seema@icem.edu", phone: "+91 9333444555" },
  { id: "STU018", name: "Amit Kale", gender: "Male", dob: "2003-06-05", projectId: "ICEM-AIML-2023", certificate: "Neural Networks", progress: "50%", exams: "1 / 3", tenthPercentage: 87, twelfthPercentage: 84, admissionYear: 2021, currentYear: 6, email: "amit@icem.edu", phone: "+91 9666555444" },
  { id: "STU019", name: "Pallavi Shinde", gender: "Female", dob: "2003-02-20", projectId: "ICEM-AIML-2023", certificate: "NLP Basics", progress: "65%", exams: "2 / 3", tenthPercentage: 89, twelfthPercentage: 86, admissionYear: 2021, currentYear: 6, email: "pallavi@icem.edu", phone: "+91 9777444333" },
  { id: "STU020", name: "Ritesh Kulkarni", gender: "Male", dob: "2003-11-11", projectId: "ICEM-AIML-2023", certificate: "Computer Vision", progress: "75%", exams: "2 / 3", tenthPercentage: 88, twelfthPercentage: 85, admissionYear: 2021, currentYear: 6, email: "ritesh@icem.edu", phone: "+91 9000012345" },
  { id: "STU021", name: "Mehul Shah", gender: "Male", dob: "2003-07-07", projectId: "ICEM-CSE-2023", certificate: "Git & GitHub", progress: "85%", exams: "2 / 2", tenthPercentage: 91, twelfthPercentage: 88, admissionYear: 2021, currentYear: 6, email: "mehul@icem.edu", phone: "+91 9888770011" },
  { id: "STU022", name: "Tanvi Desai", gender: "Female", dob: "2004-01-30", projectId: "ICEM-IT-2024", certificate: "Networking Basics", progress: "55%", exams: "1 / 3", tenthPercentage: 84, twelfthPercentage: 81, admissionYear: 2022, currentYear: 4, email: "tanvi@icem.edu", phone: "+91 9777001122" },
  { id: "STU023", name: "Harsh Mehta", gender: "Male", dob: "2003-04-16", projectId: "ICEM-AIML-2023", certificate: "Data Preprocessing", progress: "70%", exams: "2 / 3", tenthPercentage: 86, twelfthPercentage: 83, admissionYear: 2021, currentYear: 6, email: "harsh@icem.edu", phone: "+91 9888003344" },
  { id: "STU024", name: "Isha Kapoor", gender: "Female", dob: "2004-08-05", projectId: "ICEM-CSE-2024", certificate: "TypeScript", progress: "90%", exams: "3 / 3", tenthPercentage: 93, twelfthPercentage: 90, admissionYear: 2022, currentYear: 4, email: "isha@icem.edu", phone: "+91 9999005566" },
  { id: "STU025", name: "Karan Malhotra", gender: "Male", dob: "2004-12-02", projectId: "ICEM-IT-2024", certificate: "Docker Basics", progress: "65%", exams: "2 / 3", tenthPercentage: 87, twelfthPercentage: 84, admissionYear: 2022, currentYear: 4, email: "karan@icem.edu", phone: "+91 9000091122" },
  { id: "STU026", name: "Simran Kaur", gender: "Female", dob: "2003-10-19", projectId: "ICEM-CSE-2023", certificate: "Cyber Security", progress: "50%", exams: "1 / 3", tenthPercentage: 85, twelfthPercentage: 82, admissionYear: 2021, currentYear: 6, email: "simran@icem.edu", phone: "+91 9888332211" },
  { id: "STU027", name: "Vikas Yadav", gender: "Male", dob: "2003-06-23", projectId: "ICEM-AIML-2023", certificate: "Statistics for ML", progress: "55%", exams: "1 / 3", tenthPercentage: 83, twelfthPercentage: 80, admissionYear: 2021, currentYear: 6, email: "vikas@icem.edu", phone: "+91 9777882211" },
  { id: "STU028", name: "Poonam Joshi", gender: "Female", dob: "2004-03-14", projectId: "ICEM-CSE-2024", certificate: "REST APIs", progress: "68%", exams: "2 / 3", tenthPercentage: 88, twelfthPercentage: 85, admissionYear: 2022, currentYear: 4, email: "poonam@icem.edu", phone: "+91 9000077788" },
  { id: "STU029", name: "Abhishek Rao", gender: "Male", dob: "2004-09-28", projectId: "ICEM-IT-2024", certificate: "Operating Systems", progress: "72%", exams: "2 / 3", tenthPercentage: 86, twelfthPercentage: 83, admissionYear: 2022, currentYear: 4, email: "abhishek@icem.edu", phone: "+91 9888223344" },
  { id: "STU030", name: "Nandini Iyer", gender: "Female", dob: "2003-02-08", projectId: "ICEM-AIML-2023", certificate: "Model Deployment", progress: "95%", exams: "3 / 3", tenthPercentage: 94, twelfthPercentage: 92, admissionYear: 2021, currentYear: 6, email: "nandini@icem.edu", phone: "+91 9777558899" },
];
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
        currentYear: student.currentYear,
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
