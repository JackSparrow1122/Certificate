import { db } from "../src/firebase/config";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  setDoc,
  limit,
  query,
  where,
} from "firebase/firestore";
import { isLocalDbMode } from "./dbModeService";
import {
  localCreateOrganization,
  localGetAllOrganizations,
  localUpdateOrganization,
} from "./localDbService";

const ORGANIZATIONS_COLLECTION = "organizations";

const normalizeOrganizationName = (name) =>
  String(name || "")
    .trim()
    .toLowerCase();

export const getAllOrganizations = async () => {
  if (isLocalDbMode()) {
    return localGetAllOrganizations();
  }

  try {
    const snapshot = await getDocs(collection(db, ORGANIZATIONS_COLLECTION));
    const organizations = snapshot.docs.map((organizationDoc) => ({
      id: organizationDoc.id,
      ...organizationDoc.data(),
    }));

    return organizations.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
  } catch (error) {
    console.error("Error fetching organizations:", error);
    throw error;
  }
};

export const createOrganization = async ({ name, logoUrl = "" }) => {
  const normalizedName = normalizeOrganizationName(name);
  if (!normalizedName) {
    throw new Error("Organisation name is required.");
  }

  if (isLocalDbMode()) {
    return localCreateOrganization({ name, logoUrl });
  }

  try {
    const existingQuery = query(
      collection(db, ORGANIZATIONS_COLLECTION),
      where("normalizedName", "==", normalizedName),
      limit(1),
    );
    const existingSnapshot = await getDocs(existingQuery);

    if (!existingSnapshot.empty) {
      throw new Error("Organisation already exists.");
    }

    const organizationRef = await addDoc(
      collection(db, ORGANIZATIONS_COLLECTION),
      {
        name: String(name || "").trim(),
        logoUrl: String(logoUrl || "").trim(),
        normalizedName,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );

    return {
      id: organizationRef.id,
      name: String(name || "").trim(),
      logoUrl: String(logoUrl || "").trim(),
      normalizedName,
    };
  } catch (error) {
    console.error("Error creating organization:", error);
    throw error;
  }
};

export const updateOrganization = async (
  organizationId,
  { name, logoUrl = "" },
) => {
  const normalizedName = normalizeOrganizationName(name);
  if (!normalizedName) {
    throw new Error("Organisation name is required.");
  }

  if (isLocalDbMode()) {
    return localUpdateOrganization(organizationId, { name, logoUrl });
  }

  try {
    const existingQuery = query(
      collection(db, ORGANIZATIONS_COLLECTION),
      where("normalizedName", "==", normalizedName),
      limit(1),
    );
    const existingSnapshot = await getDocs(existingQuery);

    const duplicateDoc = existingSnapshot.docs.find(
      (docSnap) => docSnap.id !== organizationId,
    );

    if (duplicateDoc) {
      throw new Error("Organisation already exists.");
    }

    const organizationRef = doc(db, ORGANIZATIONS_COLLECTION, organizationId);
    await setDoc(
      organizationRef,
      {
        name: String(name || "").trim(),
        logoUrl: String(logoUrl || "").trim(),
        normalizedName,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return {
      id: organizationId,
      name: String(name || "").trim(),
      logoUrl: String(logoUrl || "").trim(),
      normalizedName,
    };
  } catch (error) {
    console.error("Error updating organization:", error);
    throw error;
  }
};
