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
const SEMESTER_ODD_COLLECTION = "sem_odd";
const SEMESTER_EVEN_COLLECTION = "sem_even";
const SEMESTER_METADATA_DOC_ID = "metadata";
const BATCH_CHUNK_SIZE = 400;

export const normalizeExamCode = (code) =>
  String(code || "")
    .trim()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();

const toSemesterNumber = (value) => {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const semesterTypeFromNumber = (semesterNumber) => {
  const parsed = toSemesterNumber(semesterNumber);
  if (!parsed) return "";
  return parsed % 2 === 0 ? "even" : "odd";
};

const getEnrollmentCollectionName = (semesterNumber) => {
  const type = semesterTypeFromNumber(semesterNumber);
  return type === "even" ? SEMESTER_EVEN_COLLECTION : SEMESTER_ODD_COLLECTION;
};

const resolveStudentSemesterNumber = ({ studentData, fallbackSemester }) => {
  const direct = toSemesterNumber(fallbackSemester);
  if (direct) return direct;

  const fromStudent =
    toSemesterNumber(studentData?.currentSemester) ||
    toSemesterNumber(studentData?.semesterNumber);
  if (fromStudent) return fromStudent;

  if (
    String(studentData?.semesterType || "")
      .trim()
      .toLowerCase() === "even"
  ) {
    return 2;
  }

  return 1;
};

const isValidEnrollmentDoc = (snapshotDoc) => {
  if (!snapshotDoc) return false;
  if (String(snapshotDoc.id || "") === SEMESTER_METADATA_DOC_ID) return false;
  const data = snapshotDoc.data() || {};
  return Boolean(String(data.certificateId || "").trim());
};

const loadProjectEnrollmentDocs = async ({ projectDocId, certificateId }) => {
  const targetCollections = [SEMESTER_ODD_COLLECTION, SEMESTER_EVEN_COLLECTION];
  const snapshots = await Promise.all(
    targetCollections.map((collectionName) => {
      const baseRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        collectionName,
      );
      if (certificateId) {
        return getDocs(
          query(baseRef, where("certificateId", "==", certificateId)),
        );
      }
      return getDocs(baseRef);
    }),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.filter((snapshotDoc) => isValidEnrollmentDoc(snapshotDoc)),
  );
};

const loadEnrollmentDocsByFieldAcrossProjects = async ({ field, value }) => {
  const targetCollections = [SEMESTER_ODD_COLLECTION, SEMESTER_EVEN_COLLECTION];
  const snapshots = await Promise.all(
    targetCollections.map((collectionName) =>
      getDocs(
        query(collectionGroup(db, collectionName), where(field, "==", value)),
      ),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.filter((snapshotDoc) => isValidEnrollmentDoc(snapshotDoc)),
  );
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
// Enrollment counts — from sem_odd / sem_even collectionGroups
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
          collectionGroup(db, SEMESTER_ODD_COLLECTION),
          where("certificateId", "==", certificateId),
        );
        const evenQuery = query(
          collectionGroup(db, SEMESTER_EVEN_COLLECTION),
          where("certificateId", "==", certificateId),
        );
        const [oddSnapshot, evenSnapshot] = await Promise.all([
          getCountFromServer(countQuery),
          getCountFromServer(evenQuery),
        ]);
        const total =
          Number(oddSnapshot?.data?.()?.count || 0) +
          Number(evenSnapshot?.data?.()?.count || 0);
        return [certificateId, total];
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

    // Find all sem_odd/sem_even enrollment docs for this certificate
    const enrollmentsSnapshotDocs =
      await loadEnrollmentDocsByFieldAcrossProjects({
        field: "certificateId",
        value: certificateId,
      });

    enrollmentsSnapshotDocs.forEach((enrollmentDoc) => {
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
// Path: students/{projectDocId}/sem_odd|sem_even/{studentId}_{certificateId}
// ---------------------------------------------------------------------------

export const enrollStudentsIntoCertificate = async ({
  certificateId,
  certificateName,
  examCode,
  projectCode,
  semesterNumber,
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
    const normalizedSemester = toSemesterNumber(semesterNumber);

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
      const studentSemesterNumber = resolveStudentSemesterNumber({
        studentData,
        fallbackSemester: normalizedSemester,
      });
      const studentSemesterType = semesterTypeFromNumber(studentSemesterNumber);
      const targetCollection = getEnrollmentCollectionName(
        studentSemesterNumber,
      );

      const enrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        targetCollection,
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
          semesterNumber: studentSemesterNumber,
          semesterType: studentSemesterType,
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
// Uses collectionGroup index on sem_odd / sem_even projectCode fields
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Get distinct project codes that have at least one enrollment for a cert
// Single collectionGroup query — replaces N+1 pattern in DeclareResultModal
// ---------------------------------------------------------------------------

export const getEnrolledProjectCodesForCertificate = async (certificateId) => {
  if (isLocalDbMode()) return [];
  try {
    const certificateIdFilter = String(certificateId || "").trim();
    const snapshots = await Promise.all([
      getDocs(
        query(
          collectionGroup(db, SEMESTER_ODD_COLLECTION),
          where("certificateId", "==", certificateIdFilter),
        ),
      ),
      getDocs(
        query(
          collectionGroup(db, SEMESTER_EVEN_COLLECTION),
          where("certificateId", "==", certificateIdFilter),
        ),
      ),
    ]);
    const codes = new Set();
    snapshots.forEach((snapshot) => {
      snapshot.forEach((d) => {
        if (!isValidEnrollmentDoc(d)) return;
        if (d.data().isDeleted === true) return;
        const pc = String(d.data().projectCode || "").trim();
        if (pc) codes.add(pc);
      });
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
    const enrollmentDocs = await loadProjectEnrollmentDocs({ projectDocId });

    if (enrollmentDocs.length === 0) return [];

    // Aggregate by certificateId
    const certMap = new Map();
    enrollmentDocs.forEach((enrollmentDoc) => {
      const data = enrollmentDoc.data();
      if (data.isDeleted) return;
      const certId = data.certificateId;
      if (!certId) return;

      const semesterType = String(
        data.semesterType || semesterTypeFromNumber(data.semesterNumber),
      )
        .trim()
        .toLowerCase();

      if (!certMap.has(certId)) {
        certMap.set(certId, {
          certificateId: certId,
          certificateName: data.certificateName || "",
          examCode: data.examCode || "",
          enrolledCount: 0,
          oddEnrolledCount: 0,
          evenEnrolledCount: 0,
        });
      }

      const aggregate = certMap.get(certId);
      aggregate.enrolledCount += 1;
      if (semesterType === "odd") aggregate.oddEnrolledCount += 1;
      if (semesterType === "even") aggregate.evenEnrolledCount += 1;
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
        oddEnrolledCount: entry.oddEnrolledCount,
        evenEnrolledCount: entry.evenEnrolledCount,
      };
    });
  } catch (error) {
    console.error("Error getting certificates for project code:", error);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Get students enrolled in a specific certificate under a project code
// Query sem_odd and sem_even under students/{projectDocId}
// ---------------------------------------------------------------------------

export const getStudentsByCertificateInProject = async (
  certificateId,
  projectCode,
) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);

    // Direct collection query — no collectionGroup needed
    const enrollmentsSnapshotDocs = await loadProjectEnrollmentDocs({
      projectDocId,
      certificateId,
    });

    if (enrollmentsSnapshotDocs.length === 0) return [];

    // Fetch each student doc by studentId stored in the enrollment
    const studentFetches = enrollmentsSnapshotDocs
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
          enrollmentSemesterNumber: enrollmentData.semesterNumber ?? null,
          enrollmentSemesterType: enrollmentData.semesterType || "",
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
      collectionGroup(db, SEMESTER_ODD_COLLECTION),
      where("uid", "==", uid),
    );
    const evenQuery = query(
      collectionGroup(db, SEMESTER_EVEN_COLLECTION),
      where("uid", "==", uid),
    );
    const [oddSnapshot, evenSnapshot] = await Promise.all([
      getDocs(enrollmentsQuery),
      getDocs(evenQuery),
    ]);
    const docs = [...oddSnapshot.docs, ...evenSnapshot.docs].filter(
      (snapshotDoc) => isValidEnrollmentDoc(snapshotDoc),
    );

    if (docs.length === 0) return [];

    const enrollments = [];
    docs.forEach((enrollmentDoc) => {
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

    const enrollmentsSnapshotDocs = await loadProjectEnrollmentDocs({
      projectDocId,
      certificateId,
    });

    const emailSet = studentEmails
      ? new Set(studentEmails.map((e) => String(e).trim().toLowerCase()))
      : null;

    const ops = [];
    let unenrolledCount = 0;

    enrollmentsSnapshotDocs.forEach((enrollmentDoc) => {
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

      const enrollmentsSnapshotDocs = await loadProjectEnrollmentDocs({
        projectDocId,
        certificateId,
      });

      enrollmentsSnapshotDocs.forEach((enrollmentDoc) => {
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
    const docs = await loadProjectEnrollmentDocs({ projectDocId });
    const map = new Map();

    docs.forEach((enrollDoc) => {
      const d = enrollDoc.data();
      if (d.isDeleted === true) return;
      const studentId = String(d.studentId || "").trim();
      if (!studentId) return;

      if (!map.has(studentId)) map.set(studentId, []);
      map.get(studentId).push({
        certificateId: d.certificateId || "",
        certificateName: d.certificateName || "",
        examCode: d.examCode || "",
        semesterNumber: d.semesterNumber ?? null,
        semesterType: d.semesterType || "",
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
        collectionGroup(db, SEMESTER_ODD_COLLECTION),
        where("email", "==", normalized),
      ),
      query(
        collectionGroup(db, SEMESTER_EVEN_COLLECTION),
        where("email", "==", normalized),
      ),
    ];

    const rawEmail = String(email || "").trim();
    if (rawEmail && rawEmail !== normalized) {
      queries.push(
        query(
          collectionGroup(db, SEMESTER_ODD_COLLECTION),
          where("email", "==", rawEmail),
        ),
        query(
          collectionGroup(db, SEMESTER_EVEN_COLLECTION),
          where("email", "==", rawEmail),
        ),
      );
    }

    const snapshots = await Promise.all(queries.map((q) => getDocs(q)));
    const rows = [];
    snapshots.forEach((snapshot) => {
      snapshot.forEach((docSnap) => {
        if (!isValidEnrollmentDoc(docSnap)) return;
        const d = docSnap.data() || {};
        if (d.isDeleted === true) return;
        rows.push({
          certificateId: d.certificateId || "",
          certificateName: d.certificateName || "",
          examCode: d.examCode || "",
          semesterNumber: d.semesterNumber ?? null,
          semesterType: d.semesterType || "",
          status: d.status || "enrolled",
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
    const snapshots = await Promise.all([
      getDocs(
        query(
          collectionGroup(db, SEMESTER_ODD_COLLECTION),
          where("studentId", "==", normalized),
        ),
      ),
      getDocs(
        query(
          collectionGroup(db, SEMESTER_EVEN_COLLECTION),
          where("studentId", "==", normalized),
        ),
      ),
    ]);
    const rows = [];
    snapshots.forEach((snapshot) => {
      snapshot.forEach((docSnap) => {
        if (!isValidEnrollmentDoc(docSnap)) return;
        const d = docSnap.data() || {};
        if (d.isDeleted === true) return;
        rows.push({
          certificateId: d.certificateId || "",
          certificateName: d.certificateName || "",
          examCode: d.examCode || "",
          semesterNumber: d.semesterNumber ?? null,
          semesterType: d.semesterType || "",
          status: d.status || "enrolled",
          projectCode: d.projectCode || "",
          platform: d.platform || d.domain || "",
          organizationName: d.organizationName || d.domain || "",
          organizationLogoUrl: d.organizationLogoUrl || "",
          level: d.level || "",
          email: d.email || "",
          studentId: d.studentId || normalized,
        });
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
 * sem_odd + sem_even subcollections rather than full student docs.
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
    const docs = await loadProjectEnrollmentDocs({ projectDocId });
    const statsMap = new Map();

    docs.forEach((enrollDoc) => {
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
