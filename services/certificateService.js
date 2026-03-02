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
// Path: students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}
// ---------------------------------------------------------------------------

export const enrollStudentsIntoCertificate = async ({
  certificateId,
  certificateName,
  examCode,
  projectCode,
  studentEmails, // array of email strings
}) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);
    const collegeCode = normalizedProjectCode.split("/")[0] || "";

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

      // Check if already enrolled — doc lives directly under project doc
      const enrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        `${studentDoc.id}_${certificateId}`,
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
          isDeleted: false,
          enrolledAt: new Date(),
          updatedAt: new Date(),
        },
        options: { merge: true },
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
    const enrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsRef);

    if (enrollmentsSnapshot.empty) return [];

    // Aggregate by certificateId
    const certMap = new Map();
    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      const data = enrollmentDoc.data();
      if (data.isDeleted) return;
      const certId = data.certificateId;
      if (!certId) return;
      if (!certMap.has(certId)) {
        certMap.set(certId, {
          certificateId: certId,
          certificateName: data.certificateName || "",
          examCode: data.examCode || "",
          enrolledCount: 0,
        });
      }
      certMap.get(certId).enrolledCount += 1;
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

    // Direct collection query — no collectionGroup needed
    const enrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const enrollmentsQuery = query(
      enrollmentsRef,
      where("certificateId", "==", certificateId),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

    if (enrollmentsSnapshot.empty) return [];

    // Fetch each student doc by studentId stored in the enrollment
    const studentFetches = enrollmentsSnapshot.docs
      .filter((d) => !d.data()?.isDeleted)
      .map(async (enrollmentDoc) => {
        const enrollmentData = enrollmentDoc.data();
        const studentId = enrollmentData.studentId;
        if (!studentId) return null;

        const studentRef = doc(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentId,
        );
        const studentSnap = await getDoc(studentRef);
        if (!studentSnap.exists()) return null;
        return {
          id: studentSnap.id,
          docId: studentSnap.id,
          projectCode: normalizedProjectCode,
          ...studentSnap.data(),
          enrollmentStatus: enrollmentData.status || "enrolled",
          enrolledAt: enrollmentData.enrolledAt,
        };
      });

    const results = await Promise.all(studentFetches);
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

    // Query enrollments directly by certificateId
    const enrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const enrollmentsQuery = query(
      enrollmentsRef,
      where("certificateId", "==", certificateId),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

    const emailSet = studentEmails
      ? new Set(studentEmails.map((e) => String(e).trim().toLowerCase()))
      : null;

    const ops = [];
    let unenrolledCount = 0;

    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      const data = enrollmentDoc.data();
      if (data.isDeleted || data.status === "unenrolled") return;

      const enrollmentEmail = String(data.email || "")
        .trim()
        .toLowerCase();
      if (emailSet && !emailSet.has(enrollmentEmail)) return;

      ops.push({
        type: "update",
        ref: enrollmentDoc.ref,
        data: {
          status: "unenrolled",
          updatedAt: new Date(),
        },
      });
      unenrolledCount += 1;
    });

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

    for (const projectCode of projectCodes) {
      const normalizedProjectCode = String(projectCode).trim();
      const projectDocId = codeToDocId(normalizedProjectCode);

      // Direct collection query — no collectionGroup needed
      const enrollmentsRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
      );
      const enrollmentsQuery = query(
        enrollmentsRef,
        where("certificateId", "==", certificateId),
      );
      const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

      enrollmentsSnapshot.forEach((enrollmentDoc) => {
        const enrollmentData = enrollmentDoc.data();
        if (enrollmentData.isDeleted === true) return;

        const studentEmail = String(enrollmentData.email || "")
          .trim()
          .toLowerCase();

        // Determine status: use emailStatusMap if email present, else defaultStatus
        let status = defaultStatus;
        if (studentEmail && emailStatusMap.has(studentEmail)) {
          status = emailStatusMap.get(studentEmail) || defaultStatus;
        }

        ops.push({
          type: "update",
          ref: enrollmentDoc.ref,
          data: {
            status,
            resultDeclaredAt: new Date(),
            updatedAt: new Date(),
          },
        });

        status === "passed" ? passedCount++ : failedCount++;
      });
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
    const enrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const snapshot = await getDocs(enrollmentsRef);
    const map = new Map();

    snapshot.forEach((enrollDoc) => {
      const d = enrollDoc.data();
      if (d.isDeleted === true) return;
      const studentId = String(d.studentId || "").trim();
      if (!studentId) return;

      if (!map.has(studentId)) map.set(studentId, []);
      map.get(studentId).push({
        certificateId: d.certificateId || "",
        certificateName: d.certificateName || "",
        examCode: d.examCode || "",
        status: d.status || "enrolled",
        isDeleted: false,
      });
    });

    return map;
  } catch (error) {
    console.error("Error getting student enrollments by project:", error);
    return new Map();
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
    const projectDocId = codeToDocId(normalizedProjectCode);
    const enrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const snapshot = await getDocs(enrollmentsRef);
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
      if (status === "passed") current.passedCount += 1;
      if (status === "failed") current.failedCount += 1;

      statsMap.set(certId, current);
    });

    return statsMap;
  } catch (error) {
    console.error("Error getting certificate enrollment stats:", error);
    throw error;
  }
};
