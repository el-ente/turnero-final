import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { TicketMark } from "../components/TicketMark";
import { useAuth } from "../contexts/useAuth";

export function LoginView() {
  const { signIn } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/terminal";

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
      navigate(from, { replace: true });
    } catch {
      // AuthContext already captured the error; nothing else to do here.
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <TicketMark size={28} />
          <span>Turnero</span>
        </div>
        <h1 className="login-title">Iniciar sesión</h1>
        <p className="login-subtitle">Accedé con tu cuenta de Google para operar una terminal o el panel de administración.</p>

        <button className="login-google-btn" onClick={handleSignIn} disabled={signingIn}>
          {signingIn ? "Ingresando…" : "Continuar con Google"}
        </button>
      </div>

      <style>{`
        .login {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          min-height: 100vh;
          background:
            radial-gradient(ellipse at 30% 20%, rgba(212,96,58,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(91,138,94,0.06) 0%, transparent 50%),
            var(--bg);
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          padding: 2.5rem;
          box-shadow: var(--shadow-md);
          text-align: center;
        }

        .login-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-family: var(--font-display);
          font-weight: 700;
          color: var(--text);
          margin-bottom: 1.5rem;
        }

        .login-title {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.5rem;
        }

        .login-subtitle {
          color: var(--text-muted);
          font-size: 0.9rem;
          margin-bottom: 2rem;
        }

        .login-google-btn {
          width: 100%;
          padding: 0.85rem 1.25rem;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius);
          font-family: var(--font-body);
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: opacity 0.15s ease;
        }

        .login-google-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .login-google-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
