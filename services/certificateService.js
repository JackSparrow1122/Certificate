import { db } from "../src/firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";

const CERTIFICATES_COLLECTION = "certificates";
const STUDENTS_COLLECTION = "students";

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

export const createCertificateAndEnrollStudents = async (certificateData) => {
  try {
    const certificateRef = await addDoc(collection(db, CERTIFICATES_COLLECTION), {
      domain: certificateData.domain,
      name: certificateData.name,
      platform: certificateData.platform,
      examCode: certificateData.examCode,
      level: certificateData.level,
      projectCode: certificateData.projectCode,
      enrolledCount: 0,
      createdAt: new Date(),
    });

    const studentsQuery = query(
      collection(db, STUDENTS_COLLECTION),
      where("projectId", "==", certificateData.projectCode),
    );
    const studentsSnapshot = await getDocs(studentsQuery);

    if (!studentsSnapshot.empty) {
      const batch = writeBatch(db);
      studentsSnapshot.forEach((studentDoc) => {
        batch.update(doc(db, STUDENTS_COLLECTION, studentDoc.id), {
          certificate: certificateData.name,
          certificateIds: arrayUnion(certificateRef.id),
          certificateStatus: "enrolled",
          enrolledCertificates: arrayUnion(certificateData.name),
          updatedAt: new Date(),
        });
      });
      await batch.commit();
    }

    await updateDoc(doc(db, CERTIFICATES_COLLECTION, certificateRef.id), {
      enrolledCount: studentsSnapshot.size,
    });

    return {
      id: certificateRef.id,
      enrolledCount: studentsSnapshot.size,
    };
  } catch (error) {
    console.error("Error creating certificate and enrolling students:", error);
    throw error;
  }
};
