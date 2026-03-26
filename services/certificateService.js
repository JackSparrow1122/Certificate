import { db } from "../src/firebase/config";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
  increment,
} from "firebase/firestore";
import { codeToDocId, docIdToCode } from "../src/utils/projectCodeUtils";
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
const MAX_NUMERIC_SEMESTER_COLLECTION = 12;
const NUMERIC_SEMESTER_COLLECTIONS = Array.from(
  { length: MAX_NUMERIC_SEMESTER_COLLECTION },
  (_, index) => `sem_${index + 1}`,
);
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
  const parsed = toSemesterNumber(semesterNumber);
  if (parsed) return `sem_${parsed}`;
  return "sem_1";
};

const getAllEnrollmentCollectionNames = () =>
  Array.from(
    new Set([
      SEMESTER_ODD_COLLECTION,
      SEMESTER_EVEN_COLLECTION,
      ...NUMERIC_SEMESTER_COLLECTIONS,
    ]),
  );

const dedupeEnrollmentDocsByPath = (docs) => {
  const byPath = new Map();
  (Array.isArray(docs) ? docs : []).forEach((snapshotDoc) => {
    const path = String(snapshotDoc?.ref?.path || "").trim();
    if (!path || byPath.has(path)) return;
    byPath.set(path, snapshotDoc);
  });
  return Array.from(byPath.values());
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
  if (String(data.certificateId || "").trim()) return true;
  if (Array.isArray(data.certificates) && data.certificates.length > 0) {
    return true;
  }
  if (
    data.certificates &&
    typeof data.certificates === "object" &&
    Object.keys(data.certificates).length > 0
  ) {
    return true;
  }
  return false;
};

const loadProjectEnrollmentDocs = async ({ projectDocId }) => {
  const targetCollections = getAllEnrollmentCollectionNames();
  const snapshots = await Promise.all(
    targetCollections.map((collectionName) => {
      const baseRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        collectionName,
      );
      return getDocs(baseRef);
    }),
  );

  return dedupeEnrollmentDocsByPath(
    snapshots.flatMap((snapshot) =>
      snapshot.docs.filter((snapshotDoc) => isValidEnrollmentDoc(snapshotDoc)),
    ),
  );
};

const extractEnrollmentEntriesFromDoc = (snapshotDoc) => {
  if (!isValidEnrollmentDoc(snapshotDoc)) return [];

  const data = snapshotDoc.data() || {};
  const pathParts = String(snapshotDoc.ref?.path || "")
    .split("/")
    .filter(Boolean);
  const projectDocId = pathParts.length >= 2 ? pathParts[1] : "";
  const collectionName = pathParts.length >= 3 ? pathParts[2] : "";
  const projectCode =
    String(data.projectCode || "").trim() ||
    (projectDocId ? docIdToCode(projectDocId) : "");

  if (String(data.certificateId || "").trim()) {
    return [
      {
        certificateId: String(data.certificateId || "").trim(),
        certificateName: data.certificateName || "",
        examCode: data.examCode || "",
        platform: data.platform || data.domain || "",
        domain: data.domain || "",
        organizationName: data.organizationName || data.domain || "",
        organizationLogoUrl: data.organizationLogoUrl || "",
        level: data.level || "",
        semesterNumber: data.semesterNumber ?? null,
        semesterType: data.semesterType || "",
        status: data.status || "enrolled",
        isDeleted: data.isDeleted === true,
        email: data.email || "",
        studentId: String(data.studentId || "").trim(),
        uid: String(data.uid || "").trim(),
        projectCode,
        collegeCode: data.collegeCode || "",
        _sourceMode: "legacy",
        _sourceDocRef: snapshotDoc.ref,
        _sourceCollectionName: collectionName,
      },
    ];
  }

  const certificateContainer = data.certificates;
  const certificateEntries = Array.isArray(certificateContainer)
    ? certificateContainer
    : certificateContainer && typeof certificateContainer === "object"
      ? Object.entries(certificateContainer).map(([certificateIdKey, row]) => ({
          certificateId: certificateIdKey,
          ...(row || {}),
        }))
      : [];

  return certificateEntries
    .map((row) => {
      const certificateId = String(
        row?.certificateId || row?.id || row?.certId || "",
      ).trim();
      if (!certificateId) return null;
      return {
        certificateId,
        certificateName: row?.certificateName || "",
        examCode: row?.examCode || "",
        platform:
          row?.platform || row?.domain || data.platform || data.domain || "",
        domain: row?.domain || data.domain || "",
        organizationName:
          row?.organizationName ||
          row?.domain ||
          data.organizationName ||
          data.domain ||
          "",
        organizationLogoUrl:
          row?.organizationLogoUrl || data.organizationLogoUrl || "",
        level: row?.level || data.level || "",
        semesterNumber: row?.semesterNumber ?? data.semesterNumber ?? null,
        semesterType: row?.semesterType || data.semesterType || "",
        status: row?.status || row?.resultStatus || "enrolled",
        isDeleted: row?.isDeleted === true || data.isDeleted === true,
        email: row?.email || data.email || "",
        studentId: String(row?.studentId || data.studentId || "").trim(),
        uid: String(row?.uid || data.uid || snapshotDoc.id || "").trim(),
        projectCode: String(row?.projectCode || "").trim() || projectCode,
        collegeCode: row?.collegeCode || data.collegeCode || "",
        _sourceMode: "uid",
        _sourceDocRef: snapshotDoc.ref,
        _sourceCollectionName: collectionName,
      };
    })
    .filter(Boolean);
};

const loadEnrollmentDocsByFieldAcrossProjects = async ({ field, value }) => {
  const targetCollections = getAllEnrollmentCollectionNames();
  const snapshots = await Promise.all(
    targetCollections.map((collectionName) =>
      getDocs(
        query(collectionGroup(db, collectionName), where(field, "==", value)),
      ),
    ),
  );

  return dedupeEnrollmentDocsByPath(
    snapshots.flatMap((snapshot) =>
      snapshot.docs.filter((snapshotDoc) => isValidEnrollmentDoc(snapshotDoc)),
    ),
  );
};

const loadAllEnrollmentDocsAcrossProjects = async () => {
  const targetCollections = getAllEnrollmentCollectionNames();
  const snapshots = await Promise.all(
    targetCollections.map((collectionName) =>
      getDocs(collectionGroup(db, collectionName)),
    ),
  );

  return dedupeEnrollmentDocsByPath(
    snapshots.flatMap((snapshot) =>
      snapshot.docs.filter((snapshotDoc) => isValidEnrollmentDoc(snapshotDoc)),
    ),
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
// Enrollment counts — from all supported semester collectionGroups
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
    const docs = await loadAllEnrollmentDocsAcrossProjects();
    const targetSet = new Set(ids);
    const countsByCert = new Map(ids.map((id) => [id, new Set()]));

    docs.forEach((snapshotDoc) => {
      const entries = extractEnrollmentEntriesFromDoc(snapshotDoc);
      entries.forEach((entry) => {
        if (entry.isDeleted) return;
        const certId = String(entry.certificateId || "").trim();
        if (!targetSet.has(certId)) return;
        const studentId = String(entry.studentId || entry.uid || "").trim();
        if (!studentId) return;
        const projectCode = String(entry.projectCode || "").trim();
        const semesterNumber = String(
          toSemesterNumber(entry.semesterNumber) || "",
        );
        countsByCert
          .get(certId)
          .add([certId, projectCode, studentId, semesterNumber].join("|"));
      });
    });

    return Object.fromEntries(
      ids.map((certificateId) => [
        certificateId,
        countsByCert.get(certificateId)?.size || 0,
      ]),
    );
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

    const allEnrollmentDocs = await loadAllEnrollmentDocsAcrossProjects();
    const touched = new Set();
    allEnrollmentDocs.forEach((enrollmentDoc) => {
      const entries = extractEnrollmentEntriesFromDoc(enrollmentDoc).filter(
        (entry) =>
          String(entry.certificateId || "").trim() ===
            String(certificateId || "").trim() && !entry.isDeleted,
      );
      entries.forEach((entry) => {
        const uniq = `${entry._sourceDocRef.path}|${entry.certificateId}`;
        if (touched.has(uniq)) return;
        touched.add(uniq);
        affectedStudents += 1;
        if (entry._sourceMode === "legacy") {
          ops.push({
            type: "update",
            ref: entry._sourceDocRef,
            data: {
              isDeleted: true,
              updatedAt: new Date(),
            },
          });
          return;
        }

        ops.push({
          type: "set",
          ref: entry._sourceDocRef,
          data: {
            updatedAt: new Date(),
            [`certificates.${entry.certificateId}.isDeleted`]: true,
            [`certificates.${entry.certificateId}.updatedAt`]: new Date(),
          },
          options: { merge: true },
        });
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
      const uidValue = String(studentData.uid || "").trim();

      if (!uidValue) continue;

      const uidEnrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        targetCollection,
        uidValue,
      );
      const existingUidEnrollment = await getDoc(uidEnrollmentRef);
      const existingUidCertificate =
        existingUidEnrollment.data()?.certificates?.[certificateId];
      if (
        existingUidCertificate &&
        existingUidCertificate.isDeleted !== true &&
        String(existingUidCertificate.status || "").toLowerCase() !==
          "unenrolled"
      ) {
        alreadyEnrolledCount += 1;
        continue;
      }

      ops.push({
        type: "set",
        ref: uidEnrollmentRef,
        data: {
          uid: uidValue,
          studentId: studentDoc.id,
          email: studentEmail,
          projectCode: normalizedProjectCode,
          collegeCode,
          semesterNumber: studentSemesterNumber,
          semesterType: studentSemesterType,
          updatedAt: new Date(),
          [`certificates.${certificateId}`]: {
            certificateId,
            certificateName: certificateName || "",
            examCode: examCode || "",
            semesterNumber: studentSemesterNumber,
            semesterType: studentSemesterType,
            email: studentEmail,
            studentId: studentDoc.id,
            uid: uidValue,
            projectCode: normalizedProjectCode,
            collegeCode,
            status: "enrolled",
            isDeleted: false,
            enrolledAt: existingUidCertificate?.enrolledAt || new Date(),
            updatedAt: new Date(),
          },
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
    const allDocs = await loadAllEnrollmentDocsAcrossProjects();
    const codes = new Set();
    allDocs.forEach((snapshotDoc) => {
      const entries = extractEnrollmentEntriesFromDoc(snapshotDoc);
      entries.forEach((entry) => {
        if (entry.isDeleted) return;
        if (String(entry.certificateId || "").trim() !== certificateIdFilter) {
          return;
        }
        const pc = String(entry.projectCode || "").trim();
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
      const entries = extractEnrollmentEntriesFromDoc(enrollmentDoc);
      entries.forEach((entry) => {
        if (entry.isDeleted) return;
        const certId = String(entry.certificateId || "").trim();
        if (!certId) return;

        const semesterType = String(
          entry.semesterType || semesterTypeFromNumber(entry.semesterNumber),
        )
          .trim()
          .toLowerCase();

        if (!certMap.has(certId)) {
          certMap.set(certId, {
            certificateId: certId,
            certificateName: entry.certificateName || "",
            examCode: entry.examCode || "",
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
    });

    if (enrollmentsSnapshotDocs.length === 0) return [];

    // Fetch each student doc by studentId stored in the enrollment
    const flattenedEntries = enrollmentsSnapshotDocs.flatMap((enrollmentDoc) =>
      extractEnrollmentEntriesFromDoc(enrollmentDoc),
    );
    const matchingEntries = flattenedEntries.filter(
      (entry) =>
        !entry.isDeleted &&
        String(entry.certificateId || "").trim() ===
          String(certificateId || "").trim(),
    );
    const dedupedEntries = Array.from(
      new Map(
        matchingEntries
          .filter((entry) => String(entry.studentId || "").trim())
          .map((entry) => [String(entry.studentId || "").trim(), entry]),
      ).values(),
    );

    const studentFetches = dedupedEntries.map(async (enrollmentData) => {
      const studentId = String(enrollmentData.studentId || "").trim();
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

    const docs = await loadEnrollmentDocsByFieldAcrossProjects({
      field: "uid",
      value: uid,
    });

    if (docs.length === 0) return [];

    return docs
      .flatMap((enrollmentDoc) =>
        extractEnrollmentEntriesFromDoc(enrollmentDoc),
      )
      .map((entry) => {
        const cleaned = { ...entry };
        delete cleaned._sourceDocRef;
        delete cleaned._sourceCollectionName;
        delete cleaned._sourceMode;
        return cleaned;
      });
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
    });

    const emailSet = studentEmails
      ? new Set(studentEmails.map((e) => String(e).trim().toLowerCase()))
      : null;

    const ops = [];
    let unenrolledCount = 0;

    const touched = new Set();
    enrollmentsSnapshotDocs.forEach((enrollmentDoc) => {
      const entries = extractEnrollmentEntriesFromDoc(enrollmentDoc).filter(
        (entry) =>
          String(entry.certificateId || "").trim() ===
          String(certificateId || "").trim(),
      );
      entries.forEach((entry) => {
        if (entry.isDeleted || entry.status === "unenrolled") return;

        const enrollmentEmail = String(entry.email || "")
          .trim()
          .toLowerCase();
        if (emailSet && !emailSet.has(enrollmentEmail)) return;

        const uniq = `${entry._sourceDocRef.path}|${entry.certificateId}`;
        if (touched.has(uniq)) return;
        touched.add(uniq);

        if (entry._sourceMode === "legacy") {
          ops.push({
            type: "update",
            ref: entry._sourceDocRef,
            data: {
              status: "unenrolled",
              updatedAt: new Date(),
            },
          });
        } else {
          ops.push({
            type: "set",
            ref: entry._sourceDocRef,
            data: {
              updatedAt: new Date(),
              [`certificates.${entry.certificateId}.status`]: "unenrolled",
              [`certificates.${entry.certificateId}.updatedAt`]: new Date(),
            },
            options: { merge: true },
          });
        }
        unenrolledCount += 1;
      });
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
      });
      const touched = new Set();
      enrollmentsSnapshotDocs.forEach((enrollmentDoc) => {
        const entries = extractEnrollmentEntriesFromDoc(enrollmentDoc).filter(
          (entry) =>
            String(entry.certificateId || "").trim() ===
            String(certificateId || "").trim(),
        );
        entries.forEach((enrollmentData) => {
          if (enrollmentData.isDeleted === true) return;

          const studentEmail = String(enrollmentData.email || "")
            .trim()
            .toLowerCase();

          // Determine status: use emailStatusMap if email present, else defaultStatus
          let status = defaultStatus;
          if (studentEmail && emailStatusMap.has(studentEmail)) {
            status = emailStatusMap.get(studentEmail) || defaultStatus;
          }

          const uniq = `${enrollmentData._sourceDocRef.path}|${enrollmentData.certificateId}`;
          if (touched.has(uniq)) return;
          touched.add(uniq);

          if (enrollmentData._sourceMode === "legacy") {
            ops.push({
              type: "update",
              ref: enrollmentData._sourceDocRef,
              data: {
                status,
                resultDeclaredAt: new Date(),
                updatedAt: new Date(),
              },
            });
          } else {
            ops.push({
              type: "set",
              ref: enrollmentData._sourceDocRef,
              data: {
                updatedAt: new Date(),
                [`certificates.${enrollmentData.certificateId}.status`]: status,
                [`certificates.${enrollmentData.certificateId}.resultDeclaredAt`]:
                  new Date(),
                [`certificates.${enrollmentData.certificateId}.updatedAt`]:
                  new Date(),
              },
              options: { merge: true },
            });
          }

          status === "passed" ? passedCount++ : failedCount++;
        });
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
      const entries = extractEnrollmentEntriesFromDoc(enrollDoc);
      entries.forEach((entry) => {
        if (entry.isDeleted === true) return;
        const studentId = String(entry.studentId || "").trim();
        if (!studentId) return;

        if (!map.has(studentId)) map.set(studentId, []);
        const rows = map.get(studentId);
        const row = {
          certificateId: entry.certificateId || "",
          certificateName: entry.certificateName || "",
          examCode: entry.examCode || "",
          semesterNumber: entry.semesterNumber ?? null,
          semesterType: entry.semesterType || "",
          status: entry.status || "enrolled",
          isDeleted: false,
        };
        const key = [
          String(row.certificateId || "").trim(),
          String(toSemesterNumber(row.semesterNumber) || ""),
          String(row.status || "")
            .trim()
            .toLowerCase(),
        ].join("|");
        if (
          rows.some(
            (existing) =>
              [
                String(existing.certificateId || "").trim(),
                String(toSemesterNumber(existing.semesterNumber) || ""),
                String(existing.status || "")
                  .trim()
                  .toLowerCase(),
              ].join("|") === key,
          )
        ) {
          return;
        }
        rows.push(row);
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
    const rawEmail = String(email || "").trim();
    const candidateEmails = Array.from(
      new Set([normalized, rawEmail].filter(Boolean)),
    );
    const snapshots = await Promise.all(
      candidateEmails.map((candidateEmail) =>
        loadEnrollmentDocsByFieldAcrossProjects({
          field: "email",
          value: candidateEmail,
        }),
      ),
    );
    const docs = dedupeEnrollmentDocsByPath(snapshots.flat());
    const rows = [];
    docs.forEach((docSnap) => {
      const entries = extractEnrollmentEntriesFromDoc(docSnap);
      entries.forEach((entry) => {
        if (entry.isDeleted === true) return;
        rows.push({
          certificateId: entry.certificateId || "",
          certificateName: entry.certificateName || "",
          examCode: entry.examCode || "",
          semesterNumber: entry.semesterNumber ?? null,
          semesterType: entry.semesterType || "",
          status: entry.status || "enrolled",
          projectCode: entry.projectCode || "",
          platform: entry.platform || entry.domain || "",
          organizationName: entry.organizationName || entry.domain || "",
          organizationLogoUrl: entry.organizationLogoUrl || "",
          level: entry.level || "",
          email: entry.email || normalized,
          studentId: entry.studentId || "",
        });
      });
    });
    return Array.from(
      new Map(
        rows.map((row) => [
          [
            String(row.certificateId || "").trim(),
            String(row.projectCode || "").trim(),
            String(row.studentId || "").trim(),
            String(toSemesterNumber(row.semesterNumber) || ""),
            String(row.status || "")
              .trim()
              .toLowerCase(),
          ].join("|"),
          row,
        ]),
      ).values(),
    );
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
    const docs = await loadEnrollmentDocsByFieldAcrossProjects({
      field: "studentId",
      value: normalized,
    });
    const rows = [];
    docs.forEach((docSnap) => {
      const entries = extractEnrollmentEntriesFromDoc(docSnap);
      entries.forEach((entry) => {
        if (entry.isDeleted === true) return;
        rows.push({
          certificateId: entry.certificateId || "",
          certificateName: entry.certificateName || "",
          examCode: entry.examCode || "",
          semesterNumber: entry.semesterNumber ?? null,
          semesterType: entry.semesterType || "",
          status: entry.status || "enrolled",
          projectCode: entry.projectCode || "",
          platform: entry.platform || entry.domain || "",
          organizationName: entry.organizationName || entry.domain || "",
          organizationLogoUrl: entry.organizationLogoUrl || "",
          level: entry.level || "",
          email: entry.email || "",
          studentId: entry.studentId || normalized,
        });
      });
    });
    return Array.from(
      new Map(
        rows.map((row) => [
          [
            String(row.certificateId || "").trim(),
            String(row.projectCode || "").trim(),
            String(row.studentId || "").trim(),
            String(toSemesterNumber(row.semesterNumber) || ""),
            String(row.status || "")
              .trim()
              .toLowerCase(),
          ].join("|"),
          row,
        ]),
      ).values(),
    );
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
      const entries = extractEnrollmentEntriesFromDoc(enrollDoc);
      entries.forEach((entry) => {
        if (entry.isDeleted === true) return;

        const certId = String(entry.certificateId || "").trim();
        if (!certId) return;

        const current = statsMap.get(certId) || {
          id: certId,
          name: String(entry.certificateName || "").trim(),
          examCode: String(entry.examCode || "").trim(),
          enrolledCount: 0,
          passedCount: 0,
          failedCount: 0,
        };

        current.enrolledCount += 1;
        const status = String(entry.status || "").toLowerCase();
        const isPass = ["passed", "completed", "certified", "pass"].includes(
          status,
        );
        const isFail = ["failed", "fail"].includes(status);
        if (isPass) current.passedCount += 1;
        if (isFail) current.failedCount += 1;

        statsMap.set(certId, current);
      });
    });

    return statsMap;
  } catch (error) {
    console.error("Error getting certificate enrollment stats:", error);
    throw error;
  }
};
