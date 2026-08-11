import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { UserRole } from "shared";
import { useAuth } from "../contexts/useAuth";

// Gates a route behind Google Sign-In and (optionally) one of `roles`.
// Totem and Display never use this - they're the public, unauthenticated views.
export function RequireAuth({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  const { firebaseUser, appUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="auth-status">Cargando…</div>;
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!appUser || appUser.status !== "active") {
    return (
      <div className="auth-status">
        Tu cuenta ({firebaseUser.email}) todavía no fue activada por un administrador.
      </div>
    );
  }

  if (roles && !roles.includes(appUser.role)) {
    return <div className="auth-status">No tenés permiso para ver esta sección.</div>;
  }

  return <>{children}</>;
}
