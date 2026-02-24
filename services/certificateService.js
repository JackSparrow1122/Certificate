import { db } from "../src/firebase/config";
import {
  addDoc,
  deleteDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  increment,
} from "firebase/firestore";

const CERTIFICATES_COLLECTION = "certificates";
const STUDENTS_COLLECTION = "students";
const CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION = "certificateProjectEnrollments";

export const getAllCertificates = async () => {
  try {
    const snapshot = await getDocs(collection(db, CERTIFICATES_COLLECTION));
    const certificates = [];

    snapshot.forEach((certificateDoc) => {
      certificates.push({
        id: certificateDoc.id,
        ...certificateDoc.data(),
      });
    });

    return certificates.sort((a, b) => {
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
  try {
    const certificateRef = await addDoc(collection(db, CERTIFICATES_COLLECTION), {
      domain: certificateData.domain,
      name: certificateData.name,
      platform: certificateData.platform,
      examCode: certificateData.examCode,
      level: certificateData.level,
      enrolledCount: 0,
      createdAt: new Date(),
    });

    return {
      id: certificateRef.id,
      enrolledCount: 0,
    };
  } catch (error) {
    console.error("Error creating certificate and enrolling students:", error);
    throw error;
  }
};

export const enrollProjectCodeIntoCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
}) => {
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

    const studentsQuery = query(
      collection(db, STUDENTS_COLLECTION),
      where("projectId", "==", projectCode),
    );
    const studentsSnapshot = await getDocs(studentsQuery);

    if (studentsSnapshot.empty) {
      return { newlyEnrolledCount: 0, matchedStudentsCount: 0 };
    }

    const batch = writeBatch(db);
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
      batch.update(doc(db, STUDENTS_COLLECTION, studentDoc.id), {
        certificate: certificateName,
        certificateIds: arrayUnion(certificateId),
        certificateStatus: "enrolled",
        enrolledCertificates: arrayUnion(certificateName),
        updatedAt: new Date(),
      });
    });

    if (newlyEnrolledCount > 0) {
      batch.update(doc(db, CERTIFICATES_COLLECTION, certificateId), {
        enrolledCount: increment(newlyEnrolledCount),
      });
      await batch.commit();
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
    console.error("Error getting assigned project codes for certificate:", error);
    throw error;
  }
};

export const unassignProjectCodeFromCertificate = async ({
  certificateId,
  certificateName,
  projectCode,
}) => {
  try {
    const enrollmentDocId = `${certificateId}__${encodeURIComponent(projectCode)}`;

    const studentsQuery = query(
      collection(db, STUDENTS_COLLECTION),
      where("projectId", "==", projectCode),
    );
    const studentsSnapshot = await getDocs(studentsQuery);

    if (studentsSnapshot.empty) {
      await deleteDoc(doc(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION, enrollmentDocId));
      return { unenrolledCount: 0 };
    }

    const batch = writeBatch(db);
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

      const updatedCertificateIds = certificateIds.filter((id) => id !== certificateId);
      const enrolledCertificates = Array.isArray(studentData.enrolledCertificates)
        ? studentData.enrolledCertificates
        : [];
      const updatedEnrolledCertificates = enrolledCertificates.filter(
        (name) => name !== certificateName,
      );

      const updatePayload = {
        certificateIds: updatedCertificateIds,
        enrolledCertificates: updatedEnrolledCertificates,
        updatedAt: new Date(),
      };

      if ((studentData.certificate || "") === certificateName) {
        updatePayload.certificate = updatedEnrolledCertificates[0] || "";
      }

      if (updatedCertificateIds.length === 0) {
        updatePayload.certificateStatus = "";
      }

      batch.update(doc(db, STUDENTS_COLLECTION, studentDoc.id), updatePayload);
    });

    if (unenrolledCount > 0) {
      batch.update(doc(db, CERTIFICATES_COLLECTION, certificateId), {
        enrolledCount: increment(-unenrolledCount),
      });
    }

    await batch.commit();
    await deleteDoc(doc(db, CERTIFICATE_PROJECT_ENROLLMENTS_COLLECTION, enrollmentDocId));

    return { unenrolledCount };
  } catch (error) {
    console.error("Error unassigning project code from certificate:", error);
    throw error;
  }
};
