import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Terminal } from "shared";
import { canAccessTerminal } from "shared";
import { db } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "../contexts/useAuth";

export function TerminalSelector() {
  const [allTerminals, setAllTerminals] = useState<Terminal[]>([]);
  const navigate = useNavigate();
  const { appUser } = useAuth();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "terminals"), (snapshot) => {
      const list = snapshot.docs.map((doc) => doc.data() as Terminal);
      setAllTerminals(list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return unsubscribe;
  }, []);

  // A cashier only sees terminals in their assigned sector(s); admin/supervisor see all.
  const terminals = appUser ? allTerminals.filter((t) => canAccessTerminal(appUser, t)) : [];

  return (
    <div className="tsel">
      <div className="tsel-card">
        <h1 className="tsel-title">Seleccionar Terminal</h1>
        <p className="tsel-subtitle">Elegí tu puesto de atención</p>

        {terminals.length === 0 ? (
          <div className="tsel-empty">
            {allTerminals.length === 0
              ? "No hay terminales configuradas"
              : "No tenés ningún sector asignado. Pedile a un administrador que te asigne uno."}
          </div>
        ) : (
          <div className="tsel-list">
            {terminals.map((t) => (
              <button
                key={t.id}
                className="tsel-item"
                onClick={() => navigate(`/terminal/${t.id}`)}
              >
                <div className="tsel-item-header">
                  <span className={`tsel-dot tsel-dot-${t.status}`}></span>
                  <span className="tsel-item-name">{t.name}</span>
                </div>
                <div className="tsel-item-meta">
                  {t.activeQueueIds.length} cola{t.activeQueueIds.length !== 1 ? "s" : ""} · {t.servingStrategy === "ratio_based" ? "Ratio" : "FIFO"}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .tsel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          min-height: calc(100vh - 64px);
          background:
            radial-gradient(ellipse at 30% 20%, rgba(212,96,58,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(91,138,94,0.06) 0%, transparent 50%),
            var(--bg);
        }

        .tsel-card {
          width: 100%;
          max-width: 480px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl);
          padding: 2.5rem;
          box-shadow: var(--shadow-md);
        }

        .tsel-title {
          font-family: var(--font-display);
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.25rem;
          text-align: center;
        }

        .tsel-subtitle {
          text-align: center;
          color: var(--text-muted);
          font-size: 0.95rem;
          margin-bottom: 2rem;
        }

        .tsel-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .tsel-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 1rem 1.25rem;
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: var(--radius);
          cursor: pointer;
          font-family: var(--font-body);
          text-align: left;
          transition: all 0.15s ease;
        }

        .tsel-item:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .tsel-item-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tsel-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .tsel-dot-available { background: var(--secondary); }
        .tsel-dot-busy { background: var(--accent); }
        .tsel-dot-offline { background: var(--text-light); }

        .tsel-item-name {
          font-weight: 600;
          font-size: 1rem;
          color: var(--text);
        }

        .tsel-item-meta {
          font-size: 0.8rem;
          color: var(--text-muted);
          padding-left: 1rem;
        }

        .tsel-empty {
          text-align: center;
          color: var(--text-muted);
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}
