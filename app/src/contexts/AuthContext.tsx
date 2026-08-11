import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import type { AppUser } from "shared";
import { auth, googleProvider } from "../lib/firebase";
import { apiBootstrapUser } from "../lib/api";
import { AuthContext } from "./authContextBase";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setError(null);

      if (!user) {
        setAppUser(null);
        setLoading(false);
        return;
      }

      try {
        // Resolves (and provisions on first login) the Firestore profile
        // backing this Firebase Auth account - role, sector assignment, status.
        const profile = await apiBootstrapUser();
        setAppUser(profile);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el perfil");
        setAppUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      throw err;
    }
  };

  const signOutUser = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, appUser, loading, error, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}
