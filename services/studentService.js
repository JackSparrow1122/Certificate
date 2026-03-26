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
  collectionGroup,
  documentId,
  limit,
  FieldPath,
  orderBy,
  startAfter,
  getCountFromServer,
} from "firebase/firestore";
import { codeToDocId, docIdToCode } from "../src/utils/projectCodeUtils";
import {
  buildSemesterDictionary,
  getSemesterOptionsFromProjectCode,
  getSemesterType,
} from "../src/utils/semesterUtils";
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
const DEFAULT_PROJECT_STUDENTS_LIMIT = 5000;
const DEFAULT_ALL_STUDENTS_LIMIT = 10000;
const DEFAULT_PROJECT_STUDENTS_PAGE_SIZE = 50;

// Add a student to Firestore
export const addStudent = async (studentData) => {
  if (isLocalDbMode()) {
    return localAddStudent(studentData);
  }
  try {
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

    const semesterOptions = getSemesterOptionsFromProjectCode(
      studentData.projectId,
    );
    const selectedSemester = Number.parseInt(
      String(
        studentData.currentSemester || studentData.currentYear || "",
      ).trim(),
      10,
    );
    const validSelectedSemester = Number.isFinite(selectedSemester)
      ? selectedSemester
      : semesterOptions[0] || null;
    const semesterDictionary = buildSemesterDictionary(studentData.projectId);
    const numericSemesterMetadataWrites = semesterOptions.map((semester) =>
      setDoc(
        doc(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          `sem_${semester}`,
          "metadata",
        ),
        {
          projectCode: studentData.projectId,
          semesterDictionary,
          semesterNumber: semester,
          semesterType: getSemesterType(semester),
          availableSemesters: [semester],
          selectedSemester: validSelectedSemester === semester ? semester : null,
          updatedAt: new Date(),
        },
        { merge: true },
      ),
    );

    await Promise.all([...numericSemesterMetadataWrites]);

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
      projectCode: studentData.projectId,
      courseYear: studentData.courseYear || "",
      collegeCode: studentData.collegeCode || "",
      course: studentData.course || "",
      semesterLabel: studentData.semesterLabel || "",
      trainingType: studentData.trainingType || "",
      currentSession: studentData.currentSession || "",
      uid: studentData.uid || "",
      progress: studentData.progress || "0%",
      exams: studentData.exams || "0 / 0",
      tenthPercentage: studentData.tenthPercentage,
      twelfthPercentage: studentData.twelfthPercentage,
      admissionYear: studentData.admissionYear,
      currentYear: studentData.currentYear ?? studentData.currentSemester ?? "",
      currentSemester:
        studentData.currentSemester ?? studentData.currentYear ?? "",
      semesterType:
        studentData.semesterType ||
        getSemesterType(studentData.currentSemester ?? studentData.currentYear),
      email: studentData.email,
      phone: studentData.phone,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      OFFICIAL_DETAILS: {
        SN: String(studentData.id || ""),
        "FULL NAME OF STUDENT": studentData.name || "",
        EMAIL_ID: studentData.email || "",
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

    console.log("Student added with ID:", studentData.id);
    return String(studentData.id);
  } catch (error) {
    console.error("Error adding student:", error);
    throw error;
  }
};

// Get all students
export const getAllStudents = async ({
  maxDocs = DEFAULT_ALL_STUDENTS_LIMIT,
} = {}) => {
  if (isLocalDbMode()) {
    return localGetAllStudents();
  }
  try {
    const allStudentsQuery = query(
      collectionGroup(db, "students_list"),
      limit(maxDocs),
    );
    const querySnapshot = await getDocs(allStudentsQuery);
    const students = [];
    querySnapshot.forEach((studentDoc) => {
      students.push({
        docId: studentDoc.id,
        ...studentDoc.data(),
      });
    });

    if (students.length > 0) {
      return students;
    }

    const projectsSnapshot = await getDocs(collection(db, STUDENTS_COLLECTION));
    if (projectsSnapshot.empty) {
      return [];
    }

    const projectDocs = projectsSnapshot.docs.slice(
      0,
      Math.max(1, Math.ceil(maxDocs / 20)),
    );
    const studentsByProjectSnapshots = await Promise.all(
      projectDocs.map((projectDoc) =>
        getDocs(
          query(
            collection(db, STUDENTS_COLLECTION, projectDoc.id, "students_list"),
            limit(
              Math.max(
                1,
                Math.floor(maxDocs / Math.max(projectDocs.length, 1)),
              ),
            ),
          ),
        ),
      ),
    );

    const fallbackStudents = [];
    studentsByProjectSnapshots.forEach((projectStudentsSnapshot) => {
      projectStudentsSnapshot.forEach((studentDoc) => {
        fallbackStudents.push({
          docId: studentDoc.id,
          ...studentDoc.data(),
        });
      });
    });

    return fallbackStudents;
  } catch (error) {
    console.error("Error getting students:", error);
    throw error;
  }
};

// Get students by project ID
export const getStudentsByProject = async (
  projectId,
  { maxDocs = DEFAULT_PROJECT_STUDENTS_LIMIT } = {},
) => {
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
    const querySnapshot = await getDocs(query(studentsList, limit(maxDocs)));
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

export const getStudentsByProjectPage = async (
  projectId,
  { pageSize = DEFAULT_PROJECT_STUDENTS_PAGE_SIZE, cursor = null } = {},
) => {
  const safePageSize = Math.max(1, Number(pageSize) || 1);
  const safeCursor = String(cursor || "").trim() || null;

  if (isLocalDbMode()) {
    const allRows = await localGetStudentsByProject(projectId);
    const sortedRows = [...(allRows || [])].sort((a, b) =>
      String(a?.docId || a?.id || "").localeCompare(
        String(b?.docId || b?.id || ""),
      ),
    );

    const startIndex = safeCursor
      ? sortedRows.findIndex(
          (row) => String(row?.docId || row?.id || "") === safeCursor,
        ) + 1
      : 0;

    const pageRows = sortedRows.slice(startIndex, startIndex + safePageSize);
    const hasMore = startIndex + safePageSize < sortedRows.length;
    const nextCursor = hasMore
      ? String(
          pageRows[pageRows.length - 1]?.docId ||
            pageRows[pageRows.length - 1]?.id ||
            "",
        )
      : null;

    return {
      students: pageRows,
      hasMore,
      nextCursor,
    };
  }

  try {
    const projectDocId = codeToDocId(projectId);
    const studentsListRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );

    const queryConstraints = [orderBy(documentId())];
    if (safeCursor) {
      queryConstraints.push(startAfter(safeCursor));
    }
    queryConstraints.push(limit(safePageSize + 1));

    const snapshot = await getDocs(query(studentsListRef, ...queryConstraints));
    const docs = snapshot.docs;
    const hasMore = docs.length > safePageSize;
    const pageDocs = hasMore ? docs.slice(0, safePageSize) : docs;

    const students = pageDocs.map((studentDoc) => ({
      id: studentDoc.id,
      docId: studentDoc.id,
      projectCode: projectId,
      ...studentDoc.data(),
    }));

    return {
      students,
      hasMore,
      nextCursor:
        hasMore && pageDocs.length > 0
          ? String(pageDocs[pageDocs.length - 1].id)
          : null,
    };
  } catch (error) {
    console.error("Error getting students by project page:", error);
    throw error;
  }
};

export const getAllStudentsCount = async () => {
  if (isLocalDbMode()) {
    const allRows = await localGetAllStudents();
    return Number(allRows?.length || 0);
  }

  try {
    const countSnapshot = await getCountFromServer(
      collectionGroup(db, "students_list"),
    );
    return Number(countSnapshot?.data?.()?.count || 0);
  } catch (error) {
    console.error("Error getting all students count:", error);
    throw error;
  }
};

export const getStudentsByProjectCount = async (projectId) => {
  if (isLocalDbMode()) {
    const rows = await localGetStudentsByProject(projectId);
    return Number(rows?.length || 0);
  }

  try {
    const projectDocId = codeToDocId(projectId);
    const studentsListRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const countSnapshot = await getCountFromServer(studentsListRef);
    return Number(countSnapshot?.data?.()?.count || 0);
  } catch (error) {
    console.error("Error getting students by project count:", error);
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

    const rawEmail = String(email).trim();
    if (!rawEmail) return null;

    const normalized = rawEmail.toLowerCase();

    // Run the two most common lookups in parallel
    const queries = [
      getDocs(
        query(
          collectionGroup(db, "students_list"),
          where("email", "==", rawEmail),
          limit(1),
        ),
      ),
      getDocs(
        query(
          collectionGroup(db, "students_list"),
          where(new FieldPath("OFFICIAL_DETAILS", "EMAIL_ID"), "==", rawEmail),
          limit(1),
        ),
      ),
    ];

    // Also try normalized variant if different
    if (normalized !== rawEmail) {
      queries.push(
        getDocs(
          query(
            collectionGroup(db, "students_list"),
            where("email", "==", normalized),
            limit(1),
          ),
        ),
      );
    }

    const results = await Promise.all(queries);

    for (const snapshot of results) {
      if (!snapshot.empty) {
        const docSnap = snapshot.docs[0];
        return {
          docId: docSnap.id,
          ...docSnap.data(),
        };
      }
    }

    // Fallback: try the legacy "EMAIL_ID." field path
    const byOfficialEmailDotQuery = query(
      collectionGroup(db, "students_list"),
      where(new FieldPath("OFFICIAL_DETAILS", "EMAIL_ID."), "==", rawEmail),
      limit(1),
    );
    const officialEmailDotSnapshot = await getDocs(byOfficialEmailDotQuery);
    if (!officialEmailDotSnapshot.empty) {
      const docSnap = officialEmailDotSnapshot.docs[0];
      return {
        docId: docSnap.id,
        ...docSnap.data(),
      };
    }

    return null;
  } catch (error) {
    console.error("Error getting student by email:", error);
    throw error;
  }
};

// Get all student matches by email across all project-year students_list docs.
export const getStudentMatchesByEmail = async (email) => {
  if (isLocalDbMode()) {
    const normalized = String(email || "")
      .trim()
      .toLowerCase();
    if (!normalized) return [];

    const rows = await localGetAllStudents();
    return (rows || [])
      .filter((student) => {
        const studentEmail = String(
          student?.email || student?.OFFICIAL_DETAILS?.EMAIL_ID || "",
        )
          .trim()
          .toLowerCase();
        return studentEmail === normalized;
      })
      .map((student) => ({
        studentId: String(student?.id || student?.docId || "").trim(),
        projectCode: String(student?.projectCode || student?.projectId || ""),
        email: String(
          student?.email || student?.OFFICIAL_DETAILS?.EMAIL_ID || normalized,
        )
          .trim()
          .toLowerCase(),
        uid: String(student?.uid || "").trim(),
      }))
      .filter((item) => item.studentId && item.projectCode);
  }

  try {
    const rawEmail = String(email || "").trim();
    if (!rawEmail) return [];
    const normalized = rawEmail.toLowerCase();

    const lookupQueries = [
      query(
        collectionGroup(db, "students_list"),
        where("email", "==", rawEmail),
      ),
      query(
        collectionGroup(db, "students_list"),
        where(new FieldPath("OFFICIAL_DETAILS", "EMAIL_ID"), "==", rawEmail),
      ),
      query(
        collectionGroup(db, "students_list"),
        where(new FieldPath("OFFICIAL_DETAILS", "EMAIL_ID."), "==", rawEmail),
      ),
    ];

    if (normalized !== rawEmail) {
      lookupQueries.push(
        query(
          collectionGroup(db, "students_list"),
          where("email", "==", normalized),
        ),
        query(
          collectionGroup(db, "students_list"),
          where(
            new FieldPath("OFFICIAL_DETAILS", "EMAIL_ID"),
            "==",
            normalized,
          ),
        ),
      );
    }

    const snapshots = await Promise.all(lookupQueries.map((q) => getDocs(q)));
    const byKey = new Map();

    snapshots.forEach((snapshot) => {
      snapshot.forEach((studentDoc) => {
        const data = studentDoc.data() || {};
        if ((data?.isActive ?? true) === false) return;

        const projectCode = String(
          data.projectCode || data.projectId || "",
        ).trim();
        const studentId = String(
          data.id || data.OFFICIAL_DETAILS?.SN || studentDoc.id || "",
        ).trim();
        if (!projectCode || !studentId) return;

        const key = `${projectCode}::${studentId}`;
        if (byKey.has(key)) return;

        const resolvedEmail = String(
          data.email || data.OFFICIAL_DETAILS?.EMAIL_ID || normalized,
        )
          .trim()
          .toLowerCase();

        byKey.set(key, {
          studentId,
          projectCode,
          email: resolvedEmail,
          uid: String(data.uid || "").trim(),
        });
      });
    });

    return Array.from(byKey.values());
  } catch (error) {
    console.error("Error getting student matches by email:", error);
    return [];
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
      profile?.studentId || profile?.student_id || profile?.rollNo || "",
    ).trim();
    const profileEmail = String(profile?.email || user?.email || "").trim();

    if (profileProjectCode && profileStudentId) {
      const byProjectAndId = await getStudentByProjectAndId(
        profileProjectCode,
        profileStudentId,
      );
      if (byProjectAndId) return byProjectAndId;
    }

    if (profileEmail) {
      const byEmail = await getStudentByEmail(profileEmail);
      if (byEmail) return byEmail;
    }

    if (profileStudentId) {
      const byId = await getStudentById(profileStudentId);
      if (byId) return byId;
    }

    return null;
  } catch (error) {
    console.error("Error resolving student for auth user:", error);
    throw error;
  }
};
