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

const hasExistingExamCodeEnrollment = (studentData, examCode) => {
  const normalizedExamCode = String(examCode || "")
    .trim()
    .toUpperCase();
  if (!normalizedExamCode) return false;

  const enrollments = studentData?.certificateEnrollments;
  if (!enrollments || typeof enrollments !== "object") return false;

  return Object.values(enrollments).some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const status = String(entry.status || "")
      .trim()
      .toLowerCase();
    if (status === "unenrolled") return false;
    const existingExamCode = String(entry.examCode || "")
      .trim()
      .toUpperCase();
    return existingExamCode === normalizedExamCode;
  });
};

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
// Enrollment counts — single collectionGroup query aggregated client-side
//
// OPTIMISATION: was N parallel collectionGroup queries (one per certificateId).
// Now: one query filtered by projectCode (uses the deployed projectCode index),
// then we tally counts in memory. Reads drop from N×|enrollments| to 1×|enrollments|.
// When no projectCodes are supplied we still need to fan-out per-cert, but that
// path is only hit from the superadmin global view and is clearly documented.
// ---------------------------------------------------------------------------

export const getCertificateEnrollmentCounts = async (
  certificateIds,
  { projectCodes = [] } = {},
) => {
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

  const projectCodeSet = new Set(
    (projectCodes || [])
      .map((code) => String(code || "").trim())
      .filter(Boolean),
  );

  // Zero-initialise every requested certificate so callers always get an entry.
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  const idSet = new Set(ids);

  try {
    if (projectCodeSet.size > 0) {
      // --- FAST PATH: one query per projectCode (uses deployed index) ---
      // This replaces N-per-cert queries with P-per-project queries where
      // typically P === 1, saving the bulk of reads for college-admin views.
      const snapshots = await Promise.all(
        [...projectCodeSet].map((projectCode) => {
          const projectDocId = codeToDocId(projectCode);
          return getDocs(
            collection(
              db,
              STUDENTS_COLLECTION,
              projectDocId,
              CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
            ),
          );
        }),
      );

      snapshots.forEach((snapshot) => {
        snapshot.forEach((enrollmentDoc) => {
          const data = enrollmentDoc.data() || {};
          if (data?.isDeleted === true) return;
          if (
            String(data?.status || "")
              .trim()
              .toLowerCase() === "unenrolled"
          ) return;
          const certId = String(data?.certificateId || "").trim();
          if (!certId || !idSet.has(certId)) return;
          counts[certId] = (counts[certId] || 0) + 1;
        });
      });

      return counts;
    }

    // --- SLOW PATH (superadmin / no projectCode filter) ---
    // Fall back to one collectionGroup query per cert.  This path is
    // intentionally retained but only reached when no project filter exists.
    const countEntries = await Promise.all(
      ids.map(async (certificateId) => {
        const enrollmentsQuery = query(
          collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
          where("certificateId", "==", certificateId),
        );
        const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
        let count = 0;
        enrollmentsSnapshot.forEach((enrollmentDoc) => {
          const data = enrollmentDoc.data() || {};
          if (data?.isDeleted === true) return;
          if (
            String(data?.status || "")
              .trim()
              .toLowerCase() === "unenrolled"
          ) return;
          count += 1;
        });
        return [certificateId, count];
      }),
    );

    return Object.fromEntries(countEntries);
  } catch (error) {
    console.error("Error getting enrollment counts:", error);
    throw error;
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
// Primary path: students/{projectDocId}/certificate_enrollments/{studentId}_{certificateId}
// Legacy path: students/{projectDocId}/students_list/{studentId}/certificate_enrollments/{certificateId}
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

    const orderedStudentDocs = [...studentsSnapshot.docs].sort((a, b) => {
      const aData = a.data() || {};
      const bData = b.data() || {};
      const aId = String(aData?.id || a.id || "").trim();
      const bId = String(bData?.id || b.id || "").trim();
      return aId.localeCompare(bId, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    for (const studentDoc of orderedStudentDocs) {
      const studentData = studentDoc.data();
      const studentEmail = String(
        studentData.OFFICIAL_DETAILS?.["EMAIL_ID"] ||
          studentData.OFFICIAL_DETAILS?.["EMAIL_ID."] ||
          studentData.email ||
          "",
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

      const normalizedExamCode = String(examCode || "")
        .trim()
        .toUpperCase();
      const hasDuplicateExamCode = hasExistingExamCodeEnrollment(
        studentData,
        normalizedExamCode,
      );
      const existingMirrorEntry =
        studentData?.certificateEnrollments?.[
          String(certificateId || "").trim()
        ];
      const hasExistingCertificateEnrollment = existingMirrorEntry
        ? String(existingMirrorEntry.status || "")
            .trim()
            .toLowerCase() !== "unenrolled"
        : false;

      if (hasDuplicateExamCode || hasExistingCertificateEnrollment) {
        alreadyEnrolledCount += 1;
        continue;
      }

      const normalizedCertificateId = String(certificateId || "").trim();
      const flatEnrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        `${String(studentDoc.id || "").trim()}_${normalizedCertificateId}`,
      );
      const legacyEnrollmentRef = doc(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
        studentDoc.id,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        normalizedCertificateId,
      );

      if (!existingMirrorEntry) {
        const [existingFlatEnrollment, existingLegacyEnrollment] =
          await Promise.all([
            getDoc(flatEnrollmentRef),
            getDoc(legacyEnrollmentRef),
          ]);
        if (
          (existingFlatEnrollment.exists() &&
            existingFlatEnrollment.data()?.status !== "unenrolled") ||
          (existingLegacyEnrollment.exists() &&
            existingLegacyEnrollment.data()?.status !== "unenrolled")
        ) {
          alreadyEnrolledCount += 1;
          continue;
        }
      }

      ops.push({
        type: "set",
        ref: flatEnrollmentRef,
        data: {
          certificateId: normalizedCertificateId,
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

      // Keep legacy nested doc for backward compatibility during migration.
      ops.push({
        type: "set",
        ref: legacyEnrollmentRef,
        data: {
          certificateId: normalizedCertificateId,
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
    const flatEnrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const certMap = new Map();

    const buildMapFromSnapshot = (snapshot) => {
      snapshot.forEach((enrollmentDoc) => {
        const data = enrollmentDoc.data() || {};
        if (data.isDeleted) return;
        if (
          String(data.status || "")
            .trim()
            .toLowerCase() === "unenrolled"
        ) {
          return;
        }
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
    };

    const flatSnapshot = await getDocs(flatEnrollmentsRef);
    if (!flatSnapshot.empty) {
      buildMapFromSnapshot(flatSnapshot);
    } else {
      const studentsRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
      );
      const studentsSnapshot = await getDocs(studentsRef);
      if (!studentsSnapshot.empty) {
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
        nestedSnapshots.forEach((snapshot) => buildMapFromSnapshot(snapshot));
      }
    }

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
    const normalizedCertificateId = String(certificateId || "").trim();
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);

    const flatQuery = query(
      collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
      ),
      where("certificateId", "==", normalizedCertificateId),
    );
    const flatSnapshot = await getDocs(flatQuery);
    const activeFlatEnrollments = flatSnapshot.docs
      .map((snap) => ({ ...snap.data() }))
      .filter(
        (row) =>
          row.isDeleted !== true &&
          String(row.status || "")
            .trim()
            .toLowerCase() !== "unenrolled",
      );

    if (activeFlatEnrollments.length > 0) {
      const uniqueStudentIds = [
        ...new Set(
          activeFlatEnrollments
            .map((row) => String(row.studentId || "").trim())
            .filter(Boolean),
        ),
      ];
      const studentSnaps = await Promise.all(
        uniqueStudentIds.map((studentId) =>
          getDoc(
            doc(
              db,
              STUDENTS_COLLECTION,
              projectDocId,
              "students_list",
              studentId,
            ),
          ),
        ),
      );

      const studentsById = new Map();
      studentSnaps.forEach((snap) => {
        if (!snap.exists()) return;
        studentsById.set(String(snap.id || "").trim(), snap.data() || {});
      });

      return activeFlatEnrollments
        .map((enrollmentData) => {
          const studentId = String(enrollmentData.studentId || "").trim();
          const studentData = studentsById.get(studentId);
          if (!studentData) return null;
          return {
            id: studentId,
            docId: studentId,
            projectCode: normalizedProjectCode,
            ...studentData,
            enrollmentStatus: enrollmentData.status || "enrolled",
            enrolledAt: enrollmentData.enrolledAt,
            assignedSemesterNumber:
              parseSemesterNumber(enrollmentData.assignedSemesterNumber) ||
              null,
            assignedSemesterParity:
              enrollmentData.assignedSemesterParity || "",
            _enrollments: [
              {
                certificateId: normalizedCertificateId,
                status: enrollmentData.status || "enrolled",
                assignedSemesterNumber:
                  parseSemesterNumber(enrollmentData.assignedSemesterNumber) ||
                  null,
                assignedSemesterParity:
                  enrollmentData.assignedSemesterParity || "",
              },
            ],
          };
        })
        .filter(Boolean);
    }

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
          normalizedCertificateId,
        );
        const enrollmentSnap = await getDoc(enrollmentRef);
        if (!enrollmentSnap.exists()) return null;
        const enrollmentData = enrollmentSnap.data() || {};
        if (
          enrollmentData.isDeleted ||
          String(enrollmentData.status || "")
            .trim()
            .toLowerCase() === "unenrolled"
        ) {
          return null;
        }

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
//
// OPTIMISATION: removed the N+1 pattern (fetch all students → getDoc per
// student for their enrollment).  Now queries the flat certificate_enrollments
// subcollection directly with a certificateId filter — one read instead of
// 1 + N reads.  The student-doc mirror is still updated so the Dashboard
// mirror field stays consistent.
// ---------------------------------------------------------------------------

export const unenrollStudentsFromCertificate = async ({
  certificateId,
  projectCode,
  studentEmails,
}) => {
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    const projectDocId = codeToDocId(normalizedProjectCode);
    const normalizedCertificateId = String(certificateId || "").trim();

    const emailSet = studentEmails
      ? new Set(studentEmails.map((e) => String(e).trim().toLowerCase()))
      : null;

    // Single targeted query on the flat subcollection — no student fan-out.
    const flatQuery = query(
      collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
      ),
      where("certificateId", "==", normalizedCertificateId),
    );
    const flatSnapshot = await getDocs(flatQuery);

    const ops = [];
    let unenrolledCount = 0;

    flatSnapshot.forEach((enrollmentDoc) => {
      const data = enrollmentDoc.data() || {};
      if (data.isDeleted || data.status === "unenrolled") return;

      const enrollmentEmail = String(data.email || "").trim().toLowerCase();
      if (emailSet && !emailSet.has(enrollmentEmail)) return;

      // Update the flat enrollment doc.
      ops.push({
        type: "update",
        ref: enrollmentDoc.ref,
        data: { status: "unenrolled", updatedAt: new Date() },
      });

      // Keep the student-doc mirror in sync.
      const studentId = String(data.studentId || "").trim();
      if (studentId) {
        const studentRef = doc(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentId,
        );
        ops.push({
          type: "update",
          ref: studentRef,
          data: {
            [`certificateEnrollments.${normalizedCertificateId}.status`]:
              "unenrolled",
            [`certificateEnrollments.${normalizedCertificateId}.updatedAt`]:
              new Date(),
          },
        });
      }

      unenrolledCount += 1;
    });

    if (unenrolledCount > 0) {
      ops.push({
        type: "update",
        ref: doc(db, CERTIFICATES_COLLECTION, normalizedCertificateId),
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
//
// OPTIMISATION: removed the classic N+1 pattern (fetch all students in a
// project → per-student getDoc for enrollment).  Now queries the flat
// certificate_enrollments subcollection once per projectCode, filtered by
// certificateId.  Reads drop from 1+N (students) + N (enrollments) per
// project to 1 per project.
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

      // Single query — fetch only enrollment docs for this cert in this project.
      const flatQuery = query(
        collection(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        ),
        where("certificateId", "==", normalizedCertificateId),
      );
      const flatSnapshot = await getDocs(flatQuery);

      flatSnapshot.forEach((enrollmentDoc) => {
        const enrollmentData = enrollmentDoc.data() || {};
        if (enrollmentData.isDeleted === true) return;

        const studentEmail = String(enrollmentData.email || "")
          .trim()
          .toLowerCase();

        const status =
          studentEmail && emailStatusMap.has(studentEmail)
            ? emailStatusMap.get(studentEmail) || defaultStatus
            : defaultStatus;

        // Update the flat enrollment doc.
        ops.push({
          type: "update",
          ref: enrollmentDoc.ref,
          data: {
            status,
            resultDeclaredAt: new Date(),
            updatedAt: new Date(),
          },
        });

        // Keep the student-doc mirror in sync.
        const studentId = String(enrollmentData.studentId || "").trim();
        if (studentId) {
          const studentRef = doc(
            db,
            STUDENTS_COLLECTION,
            projectDocId,
            "students_list",
            studentId,
          );
          ops.push({
            type: "update",
            ref: studentRef,
            data: {
              [`certificateEnrollments.${normalizedCertificateId}.status`]:
                status,
              [`certificateEnrollments.${normalizedCertificateId}.resultDeclaredAt`]:
                new Date(),
              [`certificateEnrollments.${normalizedCertificateId}.updatedAt`]:
                new Date(),
            },
          });
        }

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
    const flatEnrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const flatSnapshot = await getDocs(flatEnrollmentsRef);
    const map = new Map();

    const appendEnrollment = (studentId, d) => {
      const normalizedStudentId = String(studentId || "").trim();
      if (!normalizedStudentId) return;

      const enrollments = map.get(normalizedStudentId) || [];
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
      map.set(normalizedStudentId, enrollments);
    };

    if (!flatSnapshot.empty) {
      flatSnapshot.forEach((docSnap) => {
        const d = docSnap.data() || {};
        if (
          d.isDeleted === true ||
          String(d.status || "")
            .trim()
            .toLowerCase() === "unenrolled"
        ) {
          return;
        }
        appendEnrollment(d.studentId, d);
      });
      return map;
    }

    const studentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const snapshot = await getDocs(studentsRef);

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
      nested.forEach((enrollDoc) => {
        const d = enrollDoc.data() || {};
        if (
          d.isDeleted === true ||
          String(d.status || "")
            .trim()
            .toLowerCase() === "unenrolled"
        ) {
          return;
        }
        appendEnrollment(studentId, d);
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
//
// OPTIMISATION: removed the redundant parallel query by studentId.
// Email is the canonical identifier stored on every enrollment doc, so a
// single collectionGroup query on `email` is sufficient.  The case-variant
// second query is retained only when the raw email differs from its lowercase
// form (i.e. it contains uppercase characters).
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

    // Only fire the second query when the stored email might differ in case.
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
    const seen = new Set();
    const rows = [];

    snapshots.forEach((snapshot) => {
      snapshot.forEach((docSnap) => {
        if (seen.has(docSnap.id)) return; // deduplicate across case-variant queries
        seen.add(docSnap.id);

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
// NOTE: kept for callers that only have a studentId and no email.
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

    const buildStatsMap = (snapshot) => {
      const statsMap = new Map();

      snapshot.forEach((enrollDoc) => {
        const d = enrollDoc.data() || {};
        if (d.isDeleted === true) return;
        if (
          String(d.status || "")
            .trim()
            .toLowerCase() === "unenrolled"
        ) {
          return;
        }

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
    };

    // Fast path: direct per-project subcollection query (no collectionGroup index dependency).
    const projectDocId = codeToDocId(normalizedProjectCode);
    const flatEnrollmentsRef = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
    );
    const flatSnapshot = await getDocs(flatEnrollmentsRef);
    if (!flatSnapshot.empty) {
      return buildStatsMap(flatSnapshot);
    }

    // Try collection group query first (requires index)
    try {
      const enrollmentsQuery = query(
        collectionGroup(db, CERTIFICATE_ENROLLMENTS_SUBCOLLECTION),
        where("projectCode", "==", normalizedProjectCode),
      );
      const snapshot = await getDocs(enrollmentsQuery);
      return buildStatsMap(snapshot);
    } catch (indexError) {
      // Fallback: query students directly and aggregate enrollment data
      console.log(
        "Collection group query unavailable, using fallback method for project:",
        normalizedProjectCode,
      );
      const projectDocId = codeToDocId(normalizedProjectCode);
      const studentsRef = collection(
        db,
        STUDENTS_COLLECTION,
        projectDocId,
        "students_list",
      );

      const studentsSnapshot = await getDocs(studentsRef);
      const statsMap = new Map();

      for (const studentDoc of studentsSnapshot.docs) {
        // Query certificate enrollments for this student
        const enrollmentsRef = collection(
          db,
          STUDENTS_COLLECTION,
          projectDocId,
          "students_list",
          studentDoc.id,
          CERTIFICATE_ENROLLMENTS_SUBCOLLECTION,
        );
        const enrollmentsSnapshot = await getDocs(enrollmentsRef);

        const nestedStats = buildStatsMap(enrollmentsSnapshot);
        nestedStats.forEach((value, key) => {
          const current = statsMap.get(key) || {
            id: key,
            name: value.name || "",
            examCode: value.examCode || "",
            enrolledCount: 0,
            passedCount: 0,
            failedCount: 0,
          };
          current.enrolledCount += Number(value.enrolledCount || 0);
          current.passedCount += Number(value.passedCount || 0);
          current.failedCount += Number(value.failedCount || 0);
          statsMap.set(key, current);
        });
      }

      return statsMap;
    }
  } catch (error) {
    console.error("Error getting certificate enrollment stats:", error);
    // Return empty map on error to allow dashboard to continue
    return new Map();
  }
};