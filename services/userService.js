import { db, firebaseConfig } from "../src/firebase/config";
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { getApps, initializeApp } from "firebase/app";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  limit,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { isLocalDbMode } from "./dbModeService";
import {
  localCreateCollegeAdmin,
  localAuthenticateStudentUser,
  localChangeStudentLoginPassword,
  localCreateSuperAdmin,
  localDeleteCollegeAdmin,
  localGetAllAdmins,
  localGetStudentLoginUserByEmail,
  localUpsertStudentLoginUser,
  localGetUserByCollegeCode,
  localGetUserByEmail,
  localGetUserByUID,
  localUpdateAdmin,
} from "./localDbService";
import { codeToDocId } from "../src/utils/projectCodeUtils";

const USERS_COLLECTION = "users";
const STUDENT_LOGIN_USERS_COLLECTION = "student_login_users";
const SECONDARY_APP_NAME = "secondary-user-creation";
const ACTIVE_FILTER = (data) => (data?.isActive ?? true) !== false;
const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const getSecondaryAuth = () => {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  const secondaryApp =
    existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
  return getAuth(secondaryApp);
};

export const formatMobilePassword = (mobileValue) => {
  const digitsOnly = String(mobileValue || "").replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }
  return digitsOnly;
};

export const upsertStudentLoginUser = async (studentData) => {
  if (isLocalDbMode()) {
    return localUpsertStudentLoginUser(studentData);
  }
  const email = normalizeEmail(studentData?.email);
  const name = String(studentData?.name || "").trim();
  const mobilePassword = formatMobilePassword(studentData?.mobile);
  const projectCode = String(studentData?.projectCode || "").trim();
  const collegeCode =
    String(studentData?.collegeCode || "").trim() ||
    String(projectCode || "").split("/")[0] ||
    "";
  const studentId = String(studentData?.studentId || "").trim();

  if (!email) {
    throw new Error("Student email is required for student login");
  }

  if (!mobilePassword) {
    throw new Error(
      "Valid mobile number is required for student login password",
    );
  }

  if (mobilePassword.length < 6) {
    throw new Error(
      "Mobile number must have at least 6 digits for student login password",
    );
  }

  try {
    const existingStudentLoginsQuery = query(
      collection(db, STUDENT_LOGIN_USERS_COLLECTION),
      where("email", "==", email),
    );
    const existingStudentLoginsSnapshot = await getDocs(
      existingStudentLoginsQuery,
    );

    if (!existingStudentLoginsSnapshot.empty) {
      // Keep one entry for the email and remove any duplicate docs.
      const existingDocs = existingStudentLoginsSnapshot.docs;
      const docToKeep = existingDocs[0];

      if (existingDocs.length > 1) {
        await Promise.all(
          existingDocs
            .slice(1)
            .map((duplicateDoc) => deleteDoc(duplicateDoc.ref)),
        );
      }

      await setDoc(
        doc(db, STUDENT_LOGIN_USERS_COLLECTION, docToKeep.id),
        {
          id: docToKeep.id,
          email,
          emailLower: email,
          name,
          role: "student",
          projectCode,
          collegeCode,
          studentId,
          password: mobilePassword,
          isActive: true,
          deletedAt: null,
          updatedAt: new Date(),
        },
        { merge: true },
      );

      return {
        loginId: docToKeep.id,
        email,
        skippedExisting: true,
      };
    }

    const loginDocId = `${codeToDocId(projectCode || collegeCode || "student")}__${studentId || email}`;

    await setDoc(
      doc(db, STUDENT_LOGIN_USERS_COLLECTION, loginDocId),
      {
        id: loginDocId,
        email,
        emailLower: email,
        name,
        role: "student",
        projectCode,
        collegeCode,
        studentId,
        password: mobilePassword,
        isActive: true,
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );

    return { loginId: loginDocId, email };
  } catch (error) {
    console.error("Error creating student login user:", error);
    throw error;
  }
};

// Backward-compatible alias for older call sites.
export const createStudentAuthUser = upsertStudentLoginUser;

export const authenticateStudentUser = async ({ email, password } = {}) => {
  if (isLocalDbMode()) {
    return localAuthenticateStudentUser({ email, password });
  }

  const normalizedEmail = normalizeEmail(email);
  const rawPassword = String(password || "").trim();
  const mobilePassword = formatMobilePassword(password);

  if (!normalizedEmail || !rawPassword) {
    throw new Error("Email and password are required.");
  }

  const byLowerEmail = await getDocs(
    query(
      collection(db, STUDENT_LOGIN_USERS_COLLECTION),
      where("emailLower", "==", normalizedEmail),
      limit(1),
    ),
  );

  const candidates = [];
  byLowerEmail.forEach((item) => candidates.push(item));

  if (candidates.length === 0) {
    const byEmail = await getDocs(
      query(
        collection(db, STUDENT_LOGIN_USERS_COLLECTION),
        where("email", "==", normalizedEmail),
        limit(1),
      ),
    );
    byEmail.forEach((item) => candidates.push(item));
  }

  if (candidates.length === 0) {
    throw new Error("Invalid email or password.");
  }

  const docSnap = candidates[0];
  const data = docSnap.data() || {};

  if (!ACTIVE_FILTER(data)) {
    throw new Error("Student account is inactive.");
  }

  const storedPassword = String(data.password || "").trim();
  const passwordMatches =
    Boolean(storedPassword) &&
    (storedPassword === rawPassword ||
      (mobilePassword && storedPassword === mobilePassword));
  if (!passwordMatches) {
    throw new Error("Invalid email or password.");
  }

  return {
    id: docSnap.id,
    uid: docSnap.id,
    role: "student",
    ...data,
  };
};

export const getStudentLoginUserByEmail = async (email) => {
  if (isLocalDbMode()) {
    return localGetStudentLoginUserByEmail(email);
  }

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const byLowerEmail = await getDocs(
    query(
      collection(db, STUDENT_LOGIN_USERS_COLLECTION),
      where("emailLower", "==", normalizedEmail),
      limit(1),
    ),
  );
  if (!byLowerEmail.empty) {
    const docSnap = byLowerEmail.docs[0];
    return { id: docSnap.id, ...(docSnap.data() || {}) };
  }

  const byEmail = await getDocs(
    query(
      collection(db, STUDENT_LOGIN_USERS_COLLECTION),
      where("email", "==", normalizedEmail),
      limit(1),
    ),
  );
  if (byEmail.empty) {
    return null;
  }
  const docSnap = byEmail.docs[0];
  return { id: docSnap.id, ...(docSnap.data() || {}) };
};

export const changeStudentLoginPassword = async ({
  loginId,
  email,
  currentPassword,
  newPassword,
} = {}) => {
  if (isLocalDbMode()) {
    return localChangeStudentLoginPassword({
      loginId,
      email,
      currentPassword,
      newPassword,
    });
  }

  const rawCurrent = String(currentPassword || "").trim();
  const rawNew = String(newPassword || "").trim();

  if (!rawCurrent || !rawNew) {
    throw new Error("Current and new passwords are required.");
  }

  let targetDoc = null;
  if (loginId) {
    const byId = await getDoc(doc(db, STUDENT_LOGIN_USERS_COLLECTION, loginId));
    if (byId.exists()) targetDoc = byId;
  }

  if (!targetDoc) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      throw new Error("Student login record not found.");
    }
    const byEmail = await getDocs(
      query(
        collection(db, STUDENT_LOGIN_USERS_COLLECTION),
        where("emailLower", "==", normalizedEmail),
        limit(1),
      ),
    );
    if (!byEmail.empty) {
      targetDoc = byEmail.docs[0];
    }
  }

  if (!targetDoc) {
    throw new Error("Student login record not found.");
  }

  const data = targetDoc.data() || {};
  if (String(data.password || "").trim() !== rawCurrent) {
    const wrongPasswordError = new Error("Current password is incorrect.");
    wrongPasswordError.code = "student-auth/wrong-password";
    throw wrongPasswordError;
  }

  await setDoc(
    targetDoc.ref,
    {
      password: rawNew,
      passwordLastUpdatedAt: new Date(),
      passwordUpdatedBy: "student",
      updatedAt: new Date(),
    },
    { merge: true },
  );

  return true;
};

const findUsersByEmail = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return [];
  }

  const refsById = new Map();
  const normalizedSnap = await getDocs(
    query(collection(db, USERS_COLLECTION), where("email", "==", normalized)),
  );
  normalizedSnap.forEach((userDoc) => refsById.set(userDoc.id, userDoc));

  if (normalized !== String(email || "").trim()) {
    const rawSnap = await getDocs(
      query(
        collection(db, USERS_COLLECTION),
        where("email", "==", String(email || "").trim()),
      ),
    );
    rawSnap.forEach((userDoc) => refsById.set(userDoc.id, userDoc));
  }

  return Array.from(refsById.values());
};

const pickAdminDocToReactivate = (docs, targetRole) => {
  if (!docs.length) {
    return null;
  }

  const withRole = docs.filter(
    (userDoc) => String(userDoc.data()?.role || "") === String(targetRole),
  );
  const activeWithRole = withRole.find((userDoc) =>
    ACTIVE_FILTER(userDoc.data()),
  );
  if (activeWithRole) {
    return activeWithRole;
  }
  if (withRole.length > 0) {
    return withRole[0];
  }

  const activeAny = docs.find((userDoc) => ACTIVE_FILTER(userDoc.data()));
  if (activeAny) {
    return activeAny;
  }
  return docs[0];
};

const reactivateAdminByEmail = async ({
  secondaryAuth,
  name,
  email,
  role,
  collegeCode = "",
}) => {
  const existingDocs = await findUsersByEmail(email);
  if (!existingDocs.length) {
    return null;
  }

  const docToKeep = pickAdminDocToReactivate(existingDocs, role);
  const docData = docToKeep.data() || {};
  const resolvedUid = String(docData.uid || docToKeep.id).trim();
  const normalizedEmail = normalizeEmail(email);

  await setDoc(
    doc(db, USERS_COLLECTION, docToKeep.id),
    {
      uid: resolvedUid,
      name: String(name || "").trim(),
      email: normalizedEmail,
      role,
      collegeCode:
        role === "collegeAdmin" ? String(collegeCode || "").trim() : "",
      isActive: true,
      deletedAt: null,
      updatedAt: new Date(),
    },
    { merge: true },
  );

  if (existingDocs.length > 1) {
    const duplicateBatch = writeBatch(db);
    existingDocs
      .filter((userDoc) => userDoc.id !== docToKeep.id)
      .forEach((duplicateDoc) => {
        duplicateBatch.set(
          duplicateDoc.ref,
          {
            isActive: false,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
    await duplicateBatch.commit();
  }

  await sendPasswordResetEmail(secondaryAuth, normalizedEmail);
  return { uid: resolvedUid, email: normalizedEmail, reactivated: true };
};

// Create a college admin user in both Firebase Auth and Firestore
export const createCollegeAdmin = async (adminData, collegeCode) => {
  if (isLocalDbMode()) {
    return localCreateCollegeAdmin(adminData, collegeCode);
  }
  const secondaryAuth = getSecondaryAuth();
  const normalizedEmail = normalizeEmail(adminData?.email);

  try {
    const reactivated = await reactivateAdminByEmail({
      secondaryAuth,
      name: adminData?.name,
      email: normalizedEmail,
      role: "collegeAdmin",
      collegeCode,
    });
    if (reactivated) {
      console.log("College admin reactivated:", reactivated.uid);
      return reactivated.uid;
    }

    // 1. Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      adminData.password,
    );

    const uid = userCredential.user.uid;

    // 2. Add user to Firestore with collegeAdmin role
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      uid: uid,
      name: adminData.name,
      email: normalizedEmail,
      role: "collegeAdmin",
      collegeCode: collegeCode,
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
    });

    // (previously we sent a reset email, but this flow now uses the
    // password provided during creation so no outgoing email is needed)
    // await sendPasswordResetEmail(secondaryAuth, normalizedEmail);

    console.log("College admin created:", uid);
    return uid;
  } catch (error) {
    console.error("Error creating college admin:", error);
    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => null);
  }
};

// Create a super admin user in both Firebase Auth and Firestore
export const createSuperAdmin = async (adminData) => {
  if (isLocalDbMode()) {
    return localCreateSuperAdmin(adminData);
  }
  const secondaryAuth = getSecondaryAuth();
  const normalizedEmail = normalizeEmail(adminData?.email);

  try {
    const reactivated = await reactivateAdminByEmail({
      secondaryAuth,
      name: adminData?.name,
      email: normalizedEmail,
      role: "superAdmin",
    });
    if (reactivated) {
      console.log("Super admin reactivated:", reactivated.uid);
      return reactivated.uid;
    }

    // 1. Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizedEmail,
      adminData.password,
    );

    const uid = userCredential.user.uid;

    // 2. Add user to Firestore with superAdmin role
    await setDoc(doc(db, USERS_COLLECTION, uid), {
      uid: uid,
      name: adminData.name,
      email: normalizedEmail,
      role: "superAdmin",
      isActive: true,
      deletedAt: null,
      createdAt: new Date(),
    });

    // (previously we sent a reset email, but this flow now uses the
    // password provided during creation so no outgoing email is needed)
    // await sendPasswordResetEmail(secondaryAuth, normalizedEmail);

    console.log("Super admin created:", uid);
    return uid;
  } catch (error) {
    console.error("Error creating super admin:", error);
    throw error;
  } finally {
    await signOut(secondaryAuth).catch(() => null);
  }
};

// Get user by email
export const getUserByEmail = async (email) => {
  if (isLocalDbMode()) {
    return localGetUserByEmail(email);
  }
  try {
    // Note: Firestore doesn't have a direct "where email" query in basic setup
    // This is a limitation - you might want to add an index or use a different approach
    console.log("Getting user by email:", email);
    return null;
  } catch (error) {
    console.error("Error getting user by email:", error);
    throw error;
  }
};

// Get user by UID
export const getUserByUID = async (uid) => {
  if (isLocalDbMode()) {
    return localGetUserByUID(uid);
  }
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() || {};
      if (!ACTIVE_FILTER(data)) {
        return null;
      }
      return {
        uid: docSnap.id,
        ...data,
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting user by UID:", error);
    throw error;
  }
};

// Get user by collegeCode
export const getUserByCollegeCode = async (collegeCode) => {
  if (isLocalDbMode()) {
    return localGetUserByCollegeCode(collegeCode);
  }
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("collegeCode", "==", collegeCode),
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const activeUserDoc = querySnapshot.docs.find((userDoc) =>
        ACTIVE_FILTER(userDoc.data()),
      );
      if (!activeUserDoc) {
        return null;
      }
      return {
        uid: activeUserDoc.id,
        ...activeUserDoc.data(),
      };
    }
    console.log("No user found for college code:", collegeCode);
    return null;
  } catch (error) {
    console.error("Error getting user by college code:", error);
    throw error;
  }
};

// Get all admins (superAdmin and collegeAdmin)
export const getAllAdmins = async () => {
  if (isLocalDbMode()) {
    return localGetAllAdmins();
  }
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where("role", "in", ["superAdmin", "collegeAdmin"]),
    );
    const querySnapshot = await getDocs(q);
    const adminsList = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() || {};
      if (ACTIVE_FILTER(data)) {
        adminsList.push({
          uid: doc.id,
          ...data,
        });
      }
    });
    return adminsList;
  } catch (error) {
    console.error("Error getting all admins:", error);
    throw error;
  }
};

// Update an admin user in Firestore
export const updateAdmin = async (uid, updateData) => {
  if (isLocalDbMode()) {
    return localUpdateAdmin(uid, updateData);
  }
  try {
    const docRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(docRef, updateData);
    console.log("Admin updated:", uid);
    return true;
  } catch (error) {
    console.error("Error updating admin:", error);
    throw error;
  }
};

const softDeleteUserByUid = async (uid) => {
  const refs = new Map();
  const byIdRef = doc(db, USERS_COLLECTION, uid);
  const byIdSnap = await getDoc(byIdRef);
  if (byIdSnap.exists()) {
    refs.set(byIdRef.path, byIdRef);
  }

  const byUidSnap = await getDocs(
    query(collection(db, USERS_COLLECTION), where("uid", "==", uid)),
  );
  byUidSnap.forEach((userDoc) => refs.set(userDoc.ref.path, userDoc.ref));

  if (refs.size === 0) {
    return false;
  }

  const batch = writeBatch(db);
  refs.forEach((userRef) => {
    batch.set(
      userRef,
      {
        isActive: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true },
    );
  });
  await batch.commit();
  return true;
};

// Soft delete a college admin user from Firestore
export const deleteCollegeAdmin = async (uid) => {
  if (isLocalDbMode()) {
    return localDeleteCollegeAdmin(uid);
  }
  try {
    await softDeleteUserByUid(uid);
    console.log("College admin soft deleted in Firestore:", uid);
    return true;
  } catch (error) {
    console.error("Error soft deleting college admin:", error);
    throw error;
  }
};
