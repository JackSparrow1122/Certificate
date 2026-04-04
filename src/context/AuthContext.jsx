import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase/config";
import { getAuthUserProfile } from "../utils/authProfileLookup";
import {
  getStudentSession,
  STUDENT_SESSION_CHANGED_EVENT,
} from "../utils/studentSession";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const applyStudentSession = () => {
      const studentSession = getStudentSession();
      if (studentSession?.role === "student") {
        setUser({
          uid: studentSession.uid || studentSession.loginId || "",
          email: studentSession.email || "",
        });
        setRole("student");
        setProfile(studentSession.profile || null);
        return;
      }
      setUser(null);
      setRole(null);
      setProfile(null);
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        const userData = await getAuthUserProfile({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });

        if (userData) {
          setRole(userData.role || null);
          setProfile(userData);
        } else {
          setRole(null);
          setProfile(null);
        }
      } else {
        applyStudentSession();
      }

      setLoading(false);
    });

    const onStudentSessionChanged = () => {
      if (auth.currentUser) return;
      applyStudentSession();
      setLoading(false);
    };

    window.addEventListener(
      STUDENT_SESSION_CHANGED_EVENT,
      onStudentSessionChanged,
    );

    return () => {
      unsubscribe();
      window.removeEventListener(
        STUDENT_SESSION_CHANGED_EVENT,
        onStudentSessionChanged,
      );
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
