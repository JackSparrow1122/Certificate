import { db } from "../src/firebase/config";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  increment,
} from "firebase/firestore";
import { codeToDocId } from "../src/utils/projectCodeUtils";
import { isLocalDbMode } from "./dbModeService";
import {
  localCreateCertificateAndEnrollStudents,
  localGetAllCertificates,
  localGetCertificateEnrollmentCounts,
  localGetCertificatesByIds,
  localSoftDeleteCertificate,
  localUpdateCertificate,
} from "./localDbService";

const CERTIFICATES_COLLECTION = "certificates";
const STUDENTS_COLLECTION = "students";
const CERTIFICATE_ENROLLMENTS_SUBCOLLECTION = "certificate_enrollments";
const BATCH_CHUNK_SIZE = 400;

const parseSemesterNumber = (value) => {
  const match = String(value || "")
    .trim()
    .match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildStudentEnrollmentMirror = ({
  certificateId,
  certificateName,
  examCode,
  status,
  projectCode,
  email,
}) => ({
  certificateId,
  certificateName: certificateName || "",
  examCode: examCode || "",
  status: status || "enrolled",
  projectCode: projectCode || "",
  email: email || "",
  updatedAt: new Date(),
});

const getSemesterParity = (semesterNumber) => {
  if (!Number.isFinite(semesterNumber) || semesterNumber <= 0) return "";
  return semesterNumber % 2 === 0 ? "even" : "odd";
};

const getSemesterFromProjectCode = (projectCode) => {
  const parts = String(projectCode || "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  return parseSemesterNumber(parts[2]);
};

/**
 * Commit an array of write operations in chunks of BATCH_CHUNK_SIZE to stay
 * under Firestore's 500-operation-per-batch hard limit.
 * Each `op` is { type: 'update'|'set'|'delete', ref, data?, options? }.
 */
async function commitInChunks(ops) {
  for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
    const chunk = ops.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === "delete") {
        batch.delete(op.ref);
      } else if (op.type === "set") {
        batch.set(op.ref, op.data, op.options || {});
      } else {
        batch.update(op.ref, op.data);
      }
    }
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Certificate CRUD
// ---------------------------------------------------------------------------

export const getAllCertificates = async ({ includeInactive = false } = {}) => {
  if (isLocalDbMode()) {
    return localGetAllCertificates();
  }
  try {
    const snapshot = await getDocs(collection(db, CERTIFICATES_COLLECTION));
    const certificates = [];

    snapshot.forEach((certificateDoc) => {
      certificates.push({
        id: certificateDoc.id,
        ...certificateDoc.data(),
      });
    });

    return certificates
      .filter((certificate) =>
        includeInactive ? true : (certificate?.isActive ?? true) !== false,
      )
      .sort((a, b) => {
        const aTime = a.createdAt?.toDate?.()?.getTime?.() || 0;
        const bTime = b.createdAt?.toDate?.()?.getTime?.() || 0;
        return bTime - aTime;
      });
  } catch (error) {
    console.error("Error getting certificates:", error);
    throw error;
  }
};

export const getCertificatesByIds = async (certificateIds) => {
  if (isLocalDbMode()) {
    return localGetCertificatesByIds(certificateIds);
  }
  try {
    if (!Array.isArray(certificateIds) || certificateIds.length === 0) {
      return [];
    }

    const certificateDocs = await Promise.all(
      certificateIds.map((certificateId) =>
        getDoc(doc(db, CERTIFICATES_COLLECTION, certificateId)),
      ),
    );

    return certificateDocs
      .filter((certificateDoc) => certificateDoc.exists())
      .map((certificateDoc) => ({
        id: certificateDoc.id,
        ...certificateDoc.data(),
      }));
  } catch (error) {
    console.error("Error getting certificates by IDs:", error);
    throw error;
  }
};

export const createCertificateAndEnrollStudents = async (certificateData) => {
  if (isLocalDbMode()) {
    return localCreateCertificateAndEnrollStudents(certificateData);
  }
  try {
    const certificateRef = await addDoc(
      collection(db, CERTIFICATES_COLLECTION),
      {
        domain: certificateData.domain,
        name: certificateData.name,
        platform: certificateData.platform,
        examCode: certificateData.examCode,
        level: certificateData.level,
        enrolledCount: 0,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
      },
    );

    return {
      id: certificateRef.id,
      enrolledCount: 0,
    };
  } catch (error) {
    console.error("Error creating certificate:", error);
    throw error;
  }
};

export const updateCertificate = async (certificateId, updateData) => {
  if (isLocalDbMode()) {
    return localUpdateCertificate(certificateId, updateData);
  }

  try {
    const certificateRef = doc(db, CERTIFICATES_COLLECTION, certificateId);
    await setDoc(
      certificateRef,
      {
        ...(updateData?.domain !== undefined
          ? { domain: updateData.domain }
          : {}),
        ...(updateData?.name !== undefined ? { name: updateData.name } : {}),
        ...(updateData?.platform !== undefined
          ? { platform: updateData.platform }
          : {}),
        ...(updateData?.examCode !== undefined
          ? { examCode: updateData.examCode }
          : {}),
        ...(updateData?.level !== undefined ? { level: updateData.level } : {}),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { id: certificateId, ...updateData };
  } catch (error) {
    console.error("Error updating certificate:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Enrollment counts — from certificate_enrollments collectionGroup
// ---------------------------------------------------------------------------

export const getCertificateEnrollmentCounts = async (certificateIds) => {
  const ids = Array.isArray(certificateIds)
    ? [
        ...new Set(
          certificateIds.map((id) => String(id || "").trim()).filter(Boolean),
        ),
      ]
    : [];

  if (isLocalDbMode()) {
    return localGetCertificateEnrollmentCounts(ids);
  }

  if (ids.length === 0) return {};

  try {
    const countEntries = await Promise.all(
      ids.map(async (certificateId) => {
        const countQuery = query(
          collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
          where("certificateId", "==", certificateId),
        );
        const countSnapshot = await getCountFromServer(countQuery);
        return [certificateId, Number(countSnapshot?.data?.()?.count || 0)];
      }),
    );

    return Object.fromEntries(countEntries);
  } catch (error) {
    console.error("Error getting enrollment counts:", error);
    return Object.fromEntries(ids.map((id) => [id, 0]));
  }
};

// ---------------------------------------------------------------------------
// Soft-delete certificate
// ---------------------------------------------------------------------------

export const softDeleteCertificate = async ({ certificateId }) => {
  if (isLocalDbMode()) {
    return localSoftDeleteCertificate(certificateId);
  }

  try {
    const certificateRef = doc(db, CERTIFICATES_COLLECTION, certificateId);
    const certificateSnapshot = await getDoc(certificateRef);
    if (!certificateSnapshot.exists()) {
      throw new Error("Certificate not found.");
    }

    const ops = [];
    let affectedStudents = 0;

    // Find all certificate_enrollments docs for this certificate
    const enrollmentsQuery = query(
      collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
      where("certificateId", "==", certificateId),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      affectedStudents += 1;
      ops.push({
        type: "update",
        ref: enrollmentDoc.ref,
        data: {
          isDeleted: true,
          updatedAt: new Date(),
        },
      });
    });

    // Mark certificate as inactive
    ops.push({
      type: "set",
      ref: certificateRef,
      data: {
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
      options: { merge: true },
    });

    await commitInChunks(ops);

    return {
      deleted: true,
      affectedStudents,
      certificateId,
    };
  } catch (error) {
    console.error("Error soft deleting certificate:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Enroll selected students into a certificate (via email list)
// Primary path: students/{projectDocId}/students_list/{studentId}/certificate_enrollments/{certificateId}
// Secondary mirror: students/{projectDocId}/students_list/{studentId}.certificateEnrollments.{certificateId}
// ---------------------------------------------------------------------------

export const enrollStudentsIntoCertificate = async ({
  certificateId,
  certificateName,
  examCode,
  projectCode,
  studentEmails, // array of email strings
  assignedSemesterNumber,
}) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);
    const collegeCode = normalizedProjectCode.split("/")[0] || "";
    const resolvedSemesterNumber =
      parseSemesterNumber(assignedSemesterNumber) ||
      getSemesterFromProjectCode(normalizedProjectCode);
    const semesterParity = getSemesterParity(resolvedSemesterNumber);

    // Fetch all students in this project
    const studentsList = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsList);

    if (studentsSnapshot.empty) {
      return { enrolledCount: 0, matchedCount: 0, alreadyEnrolledCount: 0 };
    }

    // Normalize email set for matching
    const emailSet = new Set(
      (studentEmails || []).map((e) => String(e).trim().toLowerCase()),
    );

    const ops = [];
    let enrolledCount = 0;
    let alreadyEnrolledCount = 0;
    let matchedCount = 0;

    for (const studentDoc of studentsSnapshot.docs) {
      const studentData = studentDoc.data();
      const studentEmail = String(
        studentData.OFFICIAL_DETAILS?.["EMAIL_ID"] || studentData.email || "",
      )
        .trim()
        .toLowerCase();

      if (!studentEmail || !emailSet.has(studentEmail)) continue;
      matchedCount += 1;

      const studentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
        studentDoc.id,
      );

      // Check if already enrolled on the primary nested path.
      const enrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
        studentDoc.id,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        String(certificateId || "").trim(),
      );
      const existingEnrollment = await getDoc(enrollmentRef);
      if (
        existingEnrollment.exists() &&
        existingEnrollment.data()?.status !== "unenrolled"
      ) {
        alreadyEnrolledCount += 1;
        continue;
      }

      ops.push({
        type: "set",
        ref: enrollmentRef,
        data: {
          certificateId,
          certificateName: certificateName || "",
          examCode: examCode || "",
          email: studentEmail,
          studentId: studentDoc.id,
          projectCode: normalizedProjectCode,
          collegeCode,
          uid: studentData.uid || "",
          status: "enrolled",
          assignedSemesterNumber: resolvedSemesterNumber || null,
          assignedSemesterParity: semesterParity || "",
          isDeleted: false,
          enrolledAt: new Date(),
          updatedAt: new Date(),
        },
        options: { merge: true },
      });

      // Mirror enrollment data on student doc for direct student dashboard reads.
      ops.push({
        type: "update",
        ref: studentRef,
        data: {
          [`certificateEnrollments.${certificateId}`]:
            buildStudentEnrollmentMirror({
              certificateId,
              certificateName,
              examCode,
              status: "enrolled",
              projectCode: normalizedProjectCode,
              email: studentEmail,
            }),
        },
      });
      enrolledCount += 1;
    }

    if (enrolledCount > 0) {
      ops.push({
        type: "update",
        ref: doc(db, CERTIFICATES_COLLECTION, certificateId),
        data: { enrolledCount: increment(enrolledCount) },
      });
      await commitInChunks(ops);
    }

    return { enrolledCount, matchedCount, alreadyEnrolledCount };
  } catch (error) {
    console.error("Error enrolling students into certificate:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Get unique certificates enrolled for a given project code
// Uses collectionGroup index on certificate_enrollments.projectCode (deployed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Get distinct project codes that have at least one enrollment for a cert
// Single collectionGroup query — replaces N+1 pattern in DeclareResultModal
// ---------------------------------------------------------------------------

export const getEnrolledProjectCodesForCertificate = async (certificateId) => {
  if (isLocalDbMode()) return [];
  try {
    const q = query(
      collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
      where("certificateId", "==", String(certificateId || "").trim()),
    );
    const snapshot = await getDocs(q);
    const codes = new Set();
    snapshot.forEach((d) => {
      if (d.data().isDeleted === true) return;
      const pc = String(d.data().projectCode || "").trim();
      if (pc) codes.add(pc);
    });
    return Array.from(codes).sort();
  } catch (error) {
    console.error(
      "Error getting enrolled project codes for certificate:",
      error,
    );
    throw error;
  }
};

export const getCertificatesForProjectCode = async (projectCode) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    if (!normalizedProjectCode) return [];

    const projectDocId = codeToDocId(normalizedProjectCode);
    const studentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsRef);
    if (studentsSnapshot.empty) return [];

    // Aggregate by certificateId
    const certMap = new Map();
    const nestedSnapshots = await Promise.all(
      studentsSnapshot.docs.map((studentDoc) =>
        getDocs(
          collection(
            db,
            STUDENTS_COLLECTION,
            projectDocId,
            "students_list",
            studentDoc.id,
            CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
          ),
        ),
      ),
    );

    nestedSnapshots.forEach((enrollmentsSnapshot) => {
      enrollmentsSnapshot.forEach((enrollmentDoc) => {
        const data = enrollmentDoc.data();
        if (data.isDeleted) return;
        const certId = data.certificateId;
        if (!certId) return;
        const semesterNumber = parseSemesterNumber(data.assignedSemesterNumber);
        if (!certMap.has(certId)) {
          certMap.set(certId, {
            certificateId: certId,
            certificateName: data.certificateName || "",
            examCode: data.examCode || "",
            enrolledCount: 0,
            semesterNumbers: new Set(),
            semesterEnrollmentCounts: {},
          });
        }
        const entry = certMap.get(certId);
        entry.enrolledCount += 1;
        if (semesterNumber) {
          entry.semesterNumbers.add(semesterNumber);
          entry.semesterEnrollmentCounts[semesterNumber] =
            (entry.semesterEnrollmentCounts[semesterNumber] || 0) + 1;
        }
      });
    });

    if (certMap.size === 0) return [];

    // Enrich with full certificate docs
    const certIds = Array.from(certMap.keys());
    const certificateDocs = await getCertificatesByIds(certIds);
    const certDataMap = new Map(certificateDocs.map((c) => [c.id, c]));

    return Array.from(certMap.values()).map((entry) => {
      const fullCert = certDataMap.get(entry.certificateId) || {};
      return {
        ...fullCert,
        id: entry.certificateId,
        name: fullCert.name || entry.certificateName || "Certificate",
        examCode: fullCert.examCode || entry.examCode || "",
        enrolledInProject: entry.enrolledCount,
        semesterNumbers: Array.from(entry.semesterNumbers || []).sort(
          (a, b) => Number(a) - Number(b),
        ),
        semesterEnrollmentCounts: entry.semesterEnrollmentCounts || {},
      };
    });
  } catch (error) {
    console.error("Error getting certificates for project code:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Get students enrolled in a specific certificate under a project code
// Direct collection query on students/{projectDocId}/certificate_enrollments
// ---------------------------------------------------------------------------

export const getStudentsByCertificateInProject = async (
  certificateId,
  projectCode,
) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);

    const studentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsRef);
    if (studentsSnapshot.empty) return [];

    const results = await Promise.all(
      studentsSnapshot.docs.map(async (studentSnap) => {
        const enrollmentRef = doc(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentSnap.id,
          CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
          String(certificateId || "").trim(),
        );
        const enrollmentSnap = await getDoc(enrollmentRef);
        if (!enrollmentSnap.exists()) return null;
        const enrollmentData = enrollmentSnap.data() || {};
        if (enrollmentData.isDeleted) return null;

        return {
          id: studentSnap.id,
          docId: studentSnap.id,
          projectCode: normalizedProjectCode,
          ...studentSnap.data(),
          enrollmentStatus: enrollmentData.status || "enrolled",
          enrolledAt: enrollmentData.enrolledAt,
          assignedSemesterNumber:
            parseSemesterNumber(enrollmentData.assignedSemesterNumber) || null,
          assignedSemesterParity: enrollmentData.assignedSemesterParity || "",
          _enrollments: [
            {
              certificateId: String(certificateId || "").trim(),
              status: enrollmentData.status || "enrolled",
              assignedSemesterNumber:
                parseSemesterNumber(enrollmentData.assignedSemesterNumber) ||
                null,
              assignedSemesterParity:
                enrollmentData.assignedSemesterParity || "",
            },
          ],
        };
      }),
    );
    return results.filter(Boolean);
  } catch (error) {
    console.error("Error getting students by certificate in project:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Get all certificate enrollments for a student across years (via UID)
// ---------------------------------------------------------------------------

export const getStudentCertificateHistory = async (uid) => {
  try {
    if (!uid) return [];

    const enrollmentsQuery = query(
      collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
      where("uid", "==", uid),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

    if (enrollmentsSnapshot.empty) return [];

    const enrollments = [];
    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      enrollments.push({
        id: enrollmentDoc.id,
        ...enrollmentDoc.data(),
      });
    });

    return enrollments;
  } catch (error) {
    console.error("Error getting student certificate history:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Unenroll students from a certificate
// ---------------------------------------------------------------------------

export const unenrollStudentsFromCertificate = async ({
  certificateId,
  projectCode,
  studentEmails,
}) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);

    const studentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsRef);

    const emailSet = studentEmails
      ? new Set(studentEmails.map((e) => String(e).trim().toLowerCase()))
      : null;

    const ops = [];
    let unenrolledCount = 0;

    for (const studentDoc of studentsSnapshot.docs) {
      const studentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
        studentDoc.id,
      );
      const enrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
        studentDoc.id,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        String(certificateId || "").trim(),
      );
      const enrollmentSnap = await getDoc(enrollmentRef);
      if (!enrollmentSnap.exists()) continue;

      const data = enrollmentSnap.data() || {};
      if (data.isDeleted || data.status === "unenrolled") continue;

      const enrollmentEmail = String(data.email || "")
        .trim()
        .toLowerCase();
      if (emailSet && !emailSet.has(enrollmentEmail)) continue;

      ops.push({
        type: "update",
        ref: enrollmentRef,
        data: {
          status: "unenrolled",
          updatedAt: new Date(),
        },
      });
      ops.push({
        type: "update",
        ref: studentRef,
        data: {
          [`certificateEnrollments.${certificateId}.status`]: "unenrolled",
          [`certificateEnrollments.${certificateId}.updatedAt`]: new Date(),
        },
      });
      unenrolledCount += 1;
    }

    if (unenrolledCount > 0) {
      ops.push({
        type: "update",
        ref: doc(db, CERTIFICATES_COLLECTION, certificateId),
        data: { enrolledCount: increment(-unenrolledCount) },
      });
      await commitInChunks(ops);
    }

    return { unenrolledCount };
  } catch (error) {
    console.error("Error unenrolling students from certificate:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Declare results — update status on certificate_enrollments docs
// ---------------------------------------------------------------------------

export const declareResultsForCertificate = async ({
  certificateId,
  certificateName,
  projectCodes,
  emailStatusMap, // Map<email, "passed"|"failed">
  defaultStatus = "failed",
}) => {
  try {
    let passedCount = 0;
    let failedCount = 0;
    const ops = [];
    const normalizedCertificateId = String(certificateId || "").trim();

    for (const projectCode of projectCodes) {
      const normalizedProjectCode = String(projectCode).trim();
      const projectDocId = codeToDocId(normalizedProjectCode);

      const studentsRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
      );
      const studentsSnapshot = await getDocs(studentsRef);

      for (const studentDoc of studentsSnapshot.docs) {
        const studentRef = doc(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentDoc.id,
        );
        const enrollmentsRef = collection(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentDoc.id,
          CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        );

        // Primary lookup by doc ID (common path), with query fallback by field.
        const enrollmentByIdRef = doc(enrollmentsRef, normalizedCertificateId);
        const enrollmentByIdSnap = await getDoc(enrollmentByIdRef);

        let enrollmentDocs = [];
        if (enrollmentByIdSnap.exists()) {
          enrollmentDocs = [enrollmentByIdSnap];
        } else {
          const enrollmentQuery = query(
            enrollmentsRef,
            where("certificateId", "==", normalizedCertificateId),
          );
          const enrollmentQuerySnap = await getDocs(enrollmentQuery);
          enrollmentDocs = enrollmentQuerySnap.docs;
        }

        if (!enrollmentDocs.length) continue;

        const firstEnrollmentData = enrollmentDocs[0]?.data?.() || {};
        if (firstEnrollmentData.isDeleted === true) continue;

        const studentEmail = String(firstEnrollmentData.email || "")
          .trim()
          .toLowerCase();

        let status = defaultStatus;
        if (studentEmail && emailStatusMap.has(studentEmail)) {
          status = emailStatusMap.get(studentEmail) || defaultStatus;
        }

        enrollmentDocs.forEach((enrollmentDocSnap) => {
          const enrollmentData = enrollmentDocSnap.data() || {};
          if (enrollmentData.isDeleted === true) return;
          ops.push({
            type: "update",
            ref: enrollmentDocSnap.ref,
            data: {
              status,
              resultDeclaredAt: new Date(),
              updatedAt: new Date(),
            },
          });
        });

        ops.push({
          type: "update",
          ref: studentRef,
          data: {
            [`certificateEnrollments.${certificateId}.status`]: status,
            [`certificateEnrollments.${certificateId}.resultDeclaredAt`]:
              new Date(),
            [`certificateEnrollments.${certificateId}.updatedAt`]: new Date(),
          },
        });

        status === "passed" ? passedCount++ : failedCount++;
      }
    }

    await commitInChunks(ops);

    return { passedCount, failedCount };
  } catch (error) {
    console.error("Error declaring results:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Get all certificate enrollments for a project, grouped by studentId
// Returns Map<studentId, [{certificateId, certificateName, examCode, status, ...}]>
// ---------------------------------------------------------------------------

export const getStudentEnrollmentsByProject = async (projectCode) => {
  if (isLocalDbMode()) return new Map();
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    if (!normalizedProjectCode) return new Map();
    const projectDocId = codeToDocId(normalizedProjectCode);
    const studentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const snapshot = await getDocs(studentsRef);
    const map = new Map();

    const nestedSnapshots = await Promise.all(
      snapshot.docs.map((studentDoc) =>
        getDocs(
          collection(
            db,
            STUDENTS_COLLECTION,
            projectDocId,
            "students_list",
            studentDoc.id,
            CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
          ),
        ).then((nested) => ({ studentId: studentDoc.id, nested })),
      ),
    );

    nestedSnapshots.forEach(({ studentId, nested }) => {
      const normalizedStudentId = String(studentId || "").trim();
      if (!normalizedStudentId) return;

      const enrollments = [];
      nested.forEach((enrollDoc) => {
        const d = enrollDoc.data() || {};
        if (d.isDeleted === true) return;
        enrollments.push({
          certificateId: d.certificateId || "",
          certificateName: d.certificateName || "",
          examCode: d.examCode || "",
          status: d.status || "enrolled",
          assignedSemesterNumber: parseSemesterNumber(d.assignedSemesterNumber),
          assignedSemesterParity:
            String(d.assignedSemesterParity || "")
              .trim()
              .toLowerCase() ||
            getSemesterParity(parseSemesterNumber(d.assignedSemesterNumber)),
          isDeleted: false,
        });
      });

      map.set(normalizedStudentId, enrollments);
    });

    return map;
  } catch (error) {
    console.error("Error getting student enrollments by project:", error);
    return new Map();
  }
};

// ---------------------------------------------------------------------------
// Get all certificate enrollments for a student by email (across projects)
// Returns array of { certificateId, certificateName, examCode, status, projectCode }
// ---------------------------------------------------------------------------

export const getEnrollmentsByStudentEmail = async (email) => {
  if (isLocalDbMode()) return [];
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  try {
    const queries = [
      query(
        collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
        where("email", "==", normalized),
      ),
    ];

    const rawEmail = String(email || "").trim();
    if (rawEmail && rawEmail !== normalized) {
      queries.push(
        query(
          collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
          where("email", "==", rawEmail),
        ),
      );
    }

    const snapshots = await Promise.all(queries.map((q) => getDocs(q)));
    const rows = [];
    snapshots.forEach((snapshot) => {
      snapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (d.isDeleted === true) return;
        rows.push({
          certificateId: d.certificateId || "",
          certificateName: d.certificateName || "",
          examCode: d.examCode || "",
          status: d.status || "enrolled",
          assignedSemesterNumber: parseSemesterNumber(d.assignedSemesterNumber),
          assignedSemesterParity:
            String(d.assignedSemesterParity || "")
              .trim()
              .toLowerCase() ||
            getSemesterParity(parseSemesterNumber(d.assignedSemesterNumber)),
          projectCode: d.projectCode || "",
          platform: d.platform || d.domain || "",
          organizationName: d.organizationName || d.domain || "",
          organizationLogoUrl: d.organizationLogoUrl || "",
          level: d.level || "",
          email: d.email || normalized,
          studentId: d.studentId || "",
        });
      });
    });
    return rows;
  } catch (error) {
    console.error("Error getting enrollments by student email:", error);
    return [];
  }
};

// Get enrollments across projects by studentId (collectionGroup)
export const getEnrollmentsByStudentId = async (studentId) => {
  if (isLocalDbMode()) return [];
  const normalized = String(studentId || "").trim();
  if (!normalized) return [];
  try {
    const q = query(
      collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
      where("studentId", "==", normalized),
    );
    const snapshot = await getDocs(q);
    const rows = [];
    snapshot.forEach((docSnap) => {
      const d = docSnap.data() || {};
      if (d.isDeleted === true) return;
      rows.push({
        certificateId: d.certificateId || "",
        certificateName: d.certificateName || "",
        examCode: d.examCode || "",
        status: d.status || "enrolled",
        assignedSemesterNumber: parseSemesterNumber(d.assignedSemesterNumber),
        assignedSemesterParity:
          String(d.assignedSemesterParity || "")
            .trim()
            .toLowerCase() ||
          getSemesterParity(parseSemesterNumber(d.assignedSemesterNumber)),
        projectCode: d.projectCode || "",
        platform: d.platform || d.domain || "",
        organizationName: d.organizationName || d.domain || "",
        organizationLogoUrl: d.organizationLogoUrl || "",
        level: d.level || "",
        email: d.email || "",
        studentId: d.studentId || normalized,
      });
    });
    return rows;
  } catch (error) {
    console.error("Error getting enrollments by student id:", error);
    return [];
  }
};

/**
 * Returns per-certificate enrollment stats (enrolled / passed / failed counts)
 * for a given project code, sourced from the lightweight
 * certificate_enrollments subcollection rather than full student docs.
 *
 * Returns a Map: { [certificateId]: { id, name, examCode, enrolledCount, passedCount, failedCount } }
 */
export const getCertificateEnrollmentStatsByProject = async (projectCode) => {
  if (isLocalDbMode()) {
    return new Map();
  }
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    if (!normalizedProjectCode) return new Map();

    // Read from nested students/*/certificate_enrollments via collectionGroup.
    const enrollmentsQuery = query(
      collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
      where("projectCode", "==", normalizedProjectCode),
    );
    const snapshot = await getDocs(enrollmentsQuery);
    const statsMap = new Map();

    snapshot.forEach((enrollDoc) => {
      const d = enrollDoc.data();
      if (d.isDeleted === true) return;

      const certId = String(d.certificateId || "").trim();
      if (!certId) return;

      const current = statsMap.get(certId) || {
        id: certId,
        name: String(d.certificateName || "").trim(),
        examCode: String(d.examCode || "").trim(),
        enrolledCount: 0,
        passedCount: 0,
        failedCount: 0,
      };

      current.enrolledCount += 1;
      const status = String(d.status || "").toLowerCase();
      const isPass = ["passed", "completed", "certified", "pass"].includes(
        status,
      );
      const isFail = ["failed", "fail"].includes(status);
      if (isPass) current.passedCount += 1;
      if (isFail) current.failedCount += 1;

      statsMap.set(certId, current);
    });

    return statsMap;
  } catch (error) {
    console.error("Error getting certificate enrollment stats:", error);
    throw error;
  }
};
