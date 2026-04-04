import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { clearStudentSession } from "./studentSession";

export const performFullLogout = async () => {
  await signOut(auth).catch(() => null);
  clearStudentSession();
  try {
    localStorage.clear();
  } catch {
    // no-op
  }
  try {
    sessionStorage.clear();
  } catch {
    // no-op
  }
};

