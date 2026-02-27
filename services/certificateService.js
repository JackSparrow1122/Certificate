import { db } from "../src/firebase/config";
import {
  addDoc,
  deleteDoc,
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
  arrayUnion,
  increment,
} from "firebase/firestore";
import { codeToDocId } from "../src/utils/projectCodeUtils";
import { isLocalDbMode } from "./dbModeService";
import {
  localCreateCertificateAndEnrollStudents,
  localEnrollProjectCodeIntoCertificate,
  localGetAllCertificates,
  localGetCertificateEnrollmentCounts,
  localGetAssignedProjectCodesForCertificate,
  localGetCertificatesByIds,
  localGetCertificatesByProjectCode,
  localSoftDeleteCertificate,
  localUpdateCertificate,
  localUnassignProjectCodeFromCertificate,
} from "./localDbService";

const CERTIFICATES_COLLECTION = "certificates";
const STUDENTS_COLLECTION = "students";
const CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION =
  "certificateProjectEnrollments";
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
          collectionGroup(db, "students_list"),
          where("certificateIds", "array-contains", certificateId),
        );
        const countSnapshot = await getCountFromServer(countQuery);
        return [certificateId, Number(countSnapshot?.data?.()?.count || 0)];
      }),
    );

    return Object.fromEntries(countEntries);
  } catch (error) {
    console.warn(
      "Primary enrollment count query failed. Falling back to project-wise counts:",
      error,
    );

    try {
      const fallbackEntries = await Promise.all(
        ids.map(async (certificateId) => {
          const enrollmentsQuery = query(
            collection(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION),
            where("certificateId", "==", certificateId),
          );
          const enrollmentsSnapshot = await getDocs(enrollmentsQuery);

          if (enrollmentsSnapshot.empty) {
            return [certificateId, 0];
          }

          const projectCodes = [
            ...new Set(
              enrollmentsSnapshot.docs
                .map((docSnapshot) => docSnapshot.data()?.projectCode)
                .filter(Boolean),
            ),
          ];

          let total = 0;
          for (const projectCode of projectCodes) {
            const projectDocId = codeToDocId(projectCode);
            const studentsQuery = query(
              collection(
                db,
                STUDENTS_COLLECTION,
                projectDocId,
                "students_list",
              ),
              where("certificateIds", "array-contains", certificateId),
            );
            const countSnapshot = await getCountFromServer(studentsQuery);
            total += Number(countSnapshot?.data?.()?.count || 0);
          }

          return [certificateId, total];
        }),
      );

      return Object.fromEntries(fallbackEntries);
    } catch (fallbackError) {
      console.error(
        "Fallback enrollment count query also failed. Returning zero counts:",
        fallbackError,
      );
      return Object.fromEntries(ids.map((id) => [id, 0]));
    }
  }
};

export const getAllCertificates = async () => {
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
      .filter((certificate) => (certificate?.isActive ?? true) !== false)
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
    console.error("Error creating certificate and enrolling students:", error);
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

    const certificateData = certificateSnapshot.data() || {};
    const certificateName = String(certificateData?.name || "");

    const ops = [];
    let affectedStudents = 0;

    const projectDocsSnapshot = await getDocs(
      collection(db, STUDENTS_COLLECTION),
    );
    for (const projectDoc of projectDocsSnapshot.docs) {
      const studentsList = collection(
        db,
        STUDENTS_COLLECTION,
        projectDoc.id,
        "students_list",
      );
      const studentsSnapshot = await getDocs(studentsList);

      studentsSnapshot.forEach((studentDoc) => {
        const studentData = studentDoc.data();
        const certificateIds = Array.isArray(studentData.certificateIds)
          ? studentData.certificateIds
          : [];
        const hasCertificateId = certificateIds.includes(certificateId);

        const existingCertificateResults =
          studentData.certificateResults &&
          typeof studentData.certificateResults === "object"
            ? studentData.certificateResults
            : {};

        const existingEntry = existingCertificateResults[certificateId];

        const legacyMatch =
          studentData?.certificateResult?.certificateId === certificateId ||
          String(studentData?.certificate || "") === certificateName;

        if (!hasCertificateId && !existingEntry && !legacyMatch) {
          return;
        }

        affectedStudents += 1;

        const updatedEntry = {
          ...(existingEntry || {}),
          certificateId,
          certificateName:
            existingEntry?.certificateName ||
            certificateName ||
            studentData?.certificate ||
            "",
          status: existingEntry?.status || existingEntry?.result || "enrolled",
          isDeleted: true,
          updatedAt: new Date(),
        };

        const payload = {
          certificateResults: {
            ...existingCertificateResults,
            [certificateId]: updatedEntry,
          },
          updatedAt: new Date(),
        };

        if (studentData?.certificateResult?.certificateId === certificateId) {
          payload.certificateResult = {
            ...studentData.certificateResult,
            isDeleted: true,
            updatedAt: new Date(),
          };
        }

        ops.push({ type: "update", ref: studentDoc.ref, data: payload });
      });
    }

    const enrollmentQuery = query(
      collection(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION),
      where("certificateId", "==", certificateId),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentQuery);
    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      ops.push({ type: "delete", ref: enrollmentDoc.ref });
    });

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

export const enrollProjectCodeIntoCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
}) => {
  if (isLocalDbMode()) {
    return localEnrollProjectCodeIntoCertificate({
      certificateId,
      certificateName,
      projectCode,
    });
  }
  try {
    const enrollmentDocId = `${certificateId}__${encodeURIComponent(projectCode)}`;
    await setDoc(
      doc(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION, enrollmentDocId),
      {
        certificateId,
        certificateName,
        projectCode,
        createdAt: new Date(),
      },
      { merge: true },
    );

    const projectDocId = codeToDocId(projectCode);
    const studentsList = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsList);

    if (studentsSnapshot.empty) {
      return { newlyEnrolledCount: 0, matchedStudentsCount: 0 };
    }

    const ops = [];
    let newlyEnrolledCount = 0;

    studentsSnapshot.forEach((studentDoc) => {
      const studentData = studentDoc.data();
      const currentCertificateIds = Array.isArray(studentData.certificateIds)
        ? studentData.certificateIds
        : [];

      if (currentCertificateIds.includes(certificateId)) {
        return;
      }

      newlyEnrolledCount += 1;
      const existingCertificateResults =
        studentData.certificateResults &&
        typeof studentData.certificateResults === "object"
          ? studentData.certificateResults
          : {};

      ops.push({
        type: "update",
        ref: studentDoc.ref,
        data: {
          certificate: certificateName,
          certificateIds: arrayUnion(certificateId),
          certificateStatus: "enrolled",
          enrolledCertificates: arrayUnion(certificateName),
          certificateResults: {
            ...existingCertificateResults,
            [certificateId]: {
              certificateId,
              certificateName,
              status: "enrolled",
              isDeleted: false,
              updatedAt: new Date(),
            },
          },
          updatedAt: new Date(),
        },
      });
    });

    if (newlyEnrolledCount > 0) {
      ops.push({
        type: "update",
        ref: doc(db, CERTIFICATES_COLLECTION, certificateId),
        data: { enrolledCount: increment(newlyEnrolledCount) },
      });
      await commitInChunks(ops);
    }

    return {
      newlyEnrolledCount,
      matchedStudentsCount: studentsSnapshot.size,
    };
  } catch (error) {
    console.error("Error enrolling project code into certificate:", error);
    throw error;
  }
};

export const getAssignedProjectCodesForCertificate = async (certificateId) => {
  if (isLocalDbMode()) {
    return localGetAssignedProjectCodesForCertificate(certificateId);
  }
  try {
    const enrollmentsQuery = query(
      collection(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION),
      where("certificateId", "==", certificateId),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
    const projectCodes = [];

    enrollmentsSnapshot.forEach((enrollmentDoc) => {
      const data = enrollmentDoc.data();
      if (data.projectCode) {
        projectCodes.push(data.projectCode);
      }
    });

    return [...new Set(projectCodes)].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    console.error(
      "Error getting assigned project codes for certificate:",
      error,
    );
    throw error;
  }
};

export const getCertificatesByProjectCode = async (projectCode) => {
  if (isLocalDbMode()) {
    return localGetCertificatesByProjectCode(projectCode);
  }
  try {
    const normalizedProjectCode = String(projectCode || "").trim();
    if (!normalizedProjectCode) return [];

    const enrollmentsQuery = query(
      collection(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION),
      where("projectCode", "==", normalizedProjectCode),
    );
    const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
    if (enrollmentsSnapshot.empty) return [];

    const enrollmentRows = enrollmentsSnapshot.docs.map((enrollmentDoc) => ({
      certificateId: enrollmentDoc.data()?.certificateId || "",
      certificateName: enrollmentDoc.data()?.certificateName || "",
      projectCode: enrollmentDoc.data()?.projectCode || "",
    }));

    const certificateIds = [
      ...new Set(
        enrollmentRows.map((row) => row.certificateId).filter(Boolean),
      ),
    ];
    if (certificateIds.length === 0) return [];

    const certificates = await getCertificatesByIds(certificateIds);
    const nameFallbackById = new Map(
      enrollmentRows.map((row) => [row.certificateId, row.certificateName]),
    );

    return certificates
      .map((certificate) => ({
        ...certificate,
        name:
          certificate.name ||
          nameFallbackById.get(certificate.id) ||
          "Certificate",
      }))
      .filter((certificate) => (certificate?.isActive ?? true) !== false);
  } catch (error) {
    console.error("Error getting certificates by project code:", error);
    throw error;
  }
};

export const unassignProjectCodeFromCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
  preserveStudentCertificateData = false,
}) => {
  if (isLocalDbMode()) {
    return localUnassignProjectCodeFromCertificate({
      certificateId,
      certificateName,
      projectCode,
      preserveStudentCertificateData,
    });
  }
  try {
    const enrollmentDocId = `${certificateId}__${encodeURIComponent(projectCode)}`;

    const projectDocId = codeToDocId(projectCode);
    const studentsList = collection(
      db,
      STUDENTS_COLLECTION,
      projectDocId,
      "students_list",
    );
    const studentsSnapshot = await getDocs(studentsList);

    if (studentsSnapshot.empty) {
      await deleteDoc(
        doc(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION, enrollmentDocId),
      );
      return { unenrolledCount: 0 };
    }

    const ops = [];
    let unenrolledCount = 0;

    studentsSnapshot.forEach((studentDoc) => {
      const studentData = studentDoc.data();
      const certificateIds = Array.isArray(studentData.certificateIds)
        ? studentData.certificateIds
        : [];

      if (!certificateIds.includes(certificateId)) {
        return;
      }

      unenrolledCount += 1;

      if (preserveStudentCertificateData) {
        return;
      }

      const updatedCertificateIds = certificateIds.filter(
        (id) => id !== certificateId,
      );
      const enrolledCertificates = Array.isArray(
        studentData.enrolledCertificates,
      )
        ? studentData.enrolledCertificates
        : [];
      const updatedEnrolledCertificates = enrolledCertificates.filter(
        (name) => name !== certificateName,
      );

      const existingCertificateResults =
        studentData.certificateResults &&
        typeof studentData.certificateResults === "object"
          ? studentData.certificateResults
          : {};

      const updatedCertificateResults = { ...existingCertificateResults };
      delete updatedCertificateResults[certificateId];

      const updatePayload = {
        certificateIds: updatedCertificateIds,
        enrolledCertificates: updatedEnrolledCertificates,
        certificateResults: updatedCertificateResults,
        updatedAt: new Date(),
      };

      if ((studentData.certificate || "") === certificateName) {
        updatePayload.certificate = updatedEnrolledCertificates[0] || "";
      }

      if (updatedCertificateIds.length === 0) {
        updatePayload.certificateStatus = "";
      }

      if (
        studentData.certificateResult &&
        studentData.certificateResult.certificateId === certificateId
      ) {
        updatePayload.certificateResult = null;
      }

      ops.push({ type: "update", ref: studentDoc.ref, data: updatePayload });
    });

    if (unenrolledCount > 0) {
      ops.push({
        type: "update",
        ref: doc(db, CERTIFICATES_COLLECTION, certificateId),
        data: { enrolledCount: increment(-unenrolledCount) },
      });
    }

    await commitInChunks(ops);
    await deleteDoc(
      doc(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION, enrollmentDocId),
    );

    return { unenrolledCount };
  } catch (error) {
    console.error("Error unassigning project code from certificate:", error);
    throw error;
  }
};
