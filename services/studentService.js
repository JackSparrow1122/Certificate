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
const PROJECT_COUNT_FALLBACK_SCAN_LIMIT = 2000;
const DISABLE_AGGREGATION_COUNTS =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_DISABLE_AGGREGATION_COUNTS || "").trim() ===
    "true";
const STUDENTS_COUNT_CACHE_TTL_MS = 60 * 1000;
const STUDENTS_COUNT_QUOTA_BACKOFF_MS = 5 * 60 * 1000;
const STUDENTS_COUNT_RETRY_AFTER_KEY = "students_count_retry_after_v1";
const PROJECT_STUDENTS_COUNT_CACHE_TTL_MS = 60 * 1000;
const PROJECT_STUDENTS_COUNT_QUOTA_BACKOFF_MS = 5 * 60 * 1000;
let studentsCountCache = {
  value: null,
  fetchedAt: 0,
};
let studentsCountInFlight = null;
let studentsCountQuotaRetryAfter = 0;
let studentsCountLastBackoffLogAt = 0;
const projectStudentsCountCache = new Map();
const projectStudentsCountInFlight = new Map();
const projectStudentsCountRetryAfter = new Map();

const readStudentsCountRetryAfter = () => {
  if (studentsCountQuotaRetryAfter > 0) {
    return studentsCountQuotaRetryAfter;
  }
  try {
    const raw = sessionStorage.getItem(STUDENTS_COUNT_RETRY_AFTER_KEY);
    const parsed = Number(raw || 0);
    studentsCountQuotaRetryAfter = Number.isFinite(parsed) ? parsed : 0;
  } catch {
    studentsCountQuotaRetryAfter = 0;
  }
  return studentsCountQuotaRetryAfter;
};

const writeStudentsCountRetryAfter = (valueMs) => {
  studentsCountQuotaRetryAfter = Number(valueMs || 0);
  try {
    sessionStorage.setItem(
      STUDENTS_COUNT_RETRY_AFTER_KEY,
      String(studentsCountQuotaRetryAfter),
    );
  } catch {
    // no-op
  }
};

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
      currentYear:
        studentData.currentYear ?? studentData.currentSemester ?? "",
      email: studentData.email,
      phone: studentData.phone,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      OFFICIAL_DETAILS: {
        SN: String(studentData.id || ""),
        "FULL NAME OF STUDENT": studentData.name || "",
        "EMAIL_ID": studentData.email || "",
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
      const data = studentDoc.data() || {};
      if ((data?.isActive ?? true) === false) return;
      students.push({
        docId: studentDoc.id,
        ...data,
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
        const data = studentDoc.data() || {};
        if ((data?.isActive ?? true) === false) return;
        fallbackStudents.push({
          docId: studentDoc.id,
          ...data,
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
      const data = studentDoc.data() || {};
      if ((data?.isActive ?? true) === false) return;
      students.push({
        id: studentDoc.id,
        docId: studentDoc.id,
        projectCode: projectId,
        ...data,
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

  const now = Date.now();
  const retryAfter = readStudentsCountRetryAfter();
  if (retryAfter > now && Number.isFinite(studentsCountCache.value)) {
    return Number(studentsCountCache.value || 0);
  }

  if (retryAfter > now) {
    const shouldLog = now - studentsCountLastBackoffLogAt > 30 * 1000;
    if (shouldLog) {
      studentsCountLastBackoffLogAt = now;
    }
    return 0;
  }

  if (
    Number.isFinite(studentsCountCache.value) &&
    now - Number(studentsCountCache.fetchedAt || 0) < STUDENTS_COUNT_CACHE_TTL_MS
  ) {
    return Number(studentsCountCache.value || 0);
  }

  if (studentsCountInFlight) {
    return studentsCountInFlight;
  }

  studentsCountInFlight = (async () => {
    try {
      const countSnapshot = await getCountFromServer(
        collectionGroup(db, "students_list"),
      );
      const count = Number(countSnapshot?.data?.()?.count || 0);
      studentsCountCache = {
        value: count,
        fetchedAt: Date.now(),
      };
      return count;
    } catch (error) {
      const code = String(error?.code || "").toLowerCase();
      const message = String(error?.message || "");
      const isQuotaError =
        code.includes("resource-exhausted") ||
        code.includes("quota") ||
        /quota exceeded|too many requests/i.test(message);

      if (
        isQuotaError &&
        Number.isFinite(studentsCountCache.value) &&
        studentsCountCache.value >= 0
      ) {
        writeStudentsCountRetryAfter(
          Date.now() + STUDENTS_COUNT_QUOTA_BACKOFF_MS,
        );
        return Number(studentsCountCache.value || 0);
      }

      if (isQuotaError) {
        writeStudentsCountRetryAfter(
          Date.now() + STUDENTS_COUNT_QUOTA_BACKOFF_MS,
        );
        return 0;
      }

      console.error("Error getting all students count:", error);
      throw error;
    } finally {
      studentsCountInFlight = null;
    }
  })();

  return studentsCountInFlight;
};

export const getStudentsByProjectCount = async (projectId) => {
  if (isLocalDbMode()) {
    const rows = await localGetStudentsByProject(projectId);
    return Number(rows?.length || 0);
  }

  const projectCode = String(projectId || "").trim();
  const projectKey = codeToDocId(projectCode || "__unknown__");
  const now = Date.now();

  const cached = projectStudentsCountCache.get(projectKey);
  if (
    cached &&
    Number.isFinite(cached.value) &&
    now - Number(cached.fetchedAt || 0) < PROJECT_STUDENTS_COUNT_CACHE_TTL_MS
  ) {
    return Number(cached.value || 0);
  }

  const retryAfter = Number(projectStudentsCountRetryAfter.get(projectKey) || 0);
  if (retryAfter > now) {
    if (cached && Number.isFinite(cached.value)) {
      return Number(cached.value || 0);
    }
    return 0;
  }

  if (projectStudentsCountInFlight.has(projectKey)) {
    return projectStudentsCountInFlight.get(projectKey);
  }

  const run = (async () => {
    try {
      const projectDocId = codeToDocId(projectCode);
      const studentsListRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
      );
      let count = 0;
      if (DISABLE_AGGREGATION_COUNTS) {
        const fallbackSnapshot = await getDocs(
          query(studentsListRef, limit(PROJECT_COUNT_FALLBACK_SCAN_LIMIT)),
        );
        count = Number(fallbackSnapshot?.size || 0);
      } else {
        const countSnapshot = await getCountFromServer(studentsListRef);
        count = Number(countSnapshot?.data?.()?.count || 0);
      }

      projectStudentsCountCache.set(projectKey, {
        value: count,
        fetchedAt: Date.now(),
      });
      projectStudentsCountRetryAfter.delete(projectKey);
      return count;
    } catch (error) {
      const code = String(error?.code || "").toLowerCase();
      const message = String(error?.message || "");
      const isQuotaError =
        code.includes("resource-exhausted") ||
        code.includes("quota") ||
        /quota exceeded|too many requests|resource-exhausted/i.test(message);

      if (isQuotaError) {
        projectStudentsCountRetryAfter.set(
          projectKey,
          Date.now() + PROJECT_STUDENTS_COUNT_QUOTA_BACKOFF_MS,
        );
        if (cached && Number.isFinite(cached.value)) {
          return Number(cached.value || 0);
        }
        return 0;
      }

      console.error("Error getting students by project count:", error);
      throw error;
    } finally {
      projectStudentsCountInFlight.delete(projectKey);
    }
  })();

  projectStudentsCountInFlight.set(projectKey, run);
  return run;
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
