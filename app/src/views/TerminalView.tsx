import { useState, useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import type { Turn, Terminal } from "shared";
import { db } from "../lib/firebase";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import {
  getNextTurn,
  callTurn,
  startTurn,
  finishTurn,
  noShowTurn,
  recallTurn,
  apiUpdateTerminal,
} from "../lib/api";
import { toDate } from "../lib/dates";

const STATUS_LABELS: Record<string, string> = {
  waiting: "Esperando",
  called: "Llamado",
  attending: "En atención",
  finished: "Finalizado",
  no_show: "No presentado",
  cancelled: "Cancelado",
};

export function TerminalView() {
  const { terminalId } = useParams<{ terminalId: string }>();
  if (!terminalId) return <Navigate to="/terminal" replace />;
  return <TerminalViewContent terminalId={terminalId} />;
}

function TerminalViewContent({ terminalId }: { terminalId: string }) {
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [waitingTurns, setWaitingTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "terminals", terminalId), (snap) => {
      if (snap.exists()) {
        setTerminal(snap.data() as Terminal);
      }
    });
    return unsubscribe;
  }, [terminalId]);

  useEffect(() => {
    if (!terminal) return;
    const q = query(
      collection(db, "turns"),
      where("queueId", "in", terminal.activeQueueIds),
      where("status", "==", "waiting")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turns = snapshot.docs
        .map((doc) => doc.data() as Turn)
        .sort((a, b) => toDate(a.queuedAt).getTime() - toDate(b.queuedAt).getTime());
      setWaitingTurns(turns);
    });
    return unsubscribe;
  }, [terminal?.activeQueueIds]);

  useEffect(() => {
    if (!terminal?.currentTurnId) {
      setCurrentTurn(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "turns", terminal.currentTurnId), (snap) => {
      if (snap.exists()) {
        setCurrentTurn(snap.data() as Turn);
      } else {
        setCurrentTurn(null);
      }
    });
    return unsubscribe;
  }, [terminal?.currentTurnId]);

  useEffect(() => {
    setConfirmingNoShow(false);
  }, [currentTurn?.id]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleNextTurn = async () => {
    setLoading(true);
    try {
      const turn = await getNextTurn(terminalId);
      if (turn) {
        setCurrentTurn(turn);
        showMessage("success", `Turno ${turn.memberNumber} seleccionado`);
      } else {
        showMessage("error", "No hay turnos disponibles");
      }
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleCallTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await callTurn(terminalId, currentTurn.id);
      showMessage("success", `Turno ${currentTurn.memberNumber} llamado`);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      // Another terminal got there first — the suggested turn is stale.
      // Re-pull instead of leaving the operator at a dead end.
      if (message.includes("not in WAITING status")) {
        showMessage("error", "Ese turno ya no estaba disponible, buscando otro...");
        await handleNextTurn();
        return;
      }
      showMessage("error", message);
      setLoading(false);
    }
  };

  const handleStartTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await startTurn(terminalId, currentTurn.id);
      showMessage("success", "Atencion iniciada");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleFinishTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await finishTurn(terminalId, currentTurn.id);
      setCurrentTurn(null);
      showMessage("success", "Turno finalizado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmNoShow = async () => {
    if (!currentTurn) return;
    setConfirmingNoShow(false);
    setLoading(true);
    try {
      await noShowTurn(terminalId, currentTurn.id);
      setCurrentTurn(null);
      showMessage("success", "Turno marcado como no presentado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTerminalStatus = async () => {
    if (!terminal) return;
    const nextStatus = terminal.status === "offline" ? "available" : "offline";
    try {
      await apiUpdateTerminal(terminalId, { status: nextStatus });
      showMessage("success", nextStatus === "offline" ? "Terminal pausada" : "Terminal reanudada");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    }
  };

  const handleRecallTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await recallTurn(terminalId, currentTurn.id);
      showMessage("success", "Turno re-llamado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="term">
      {/* Sidebar */}
      <aside className="term-sidebar">
        <div className="term-identity">
          <div className={`term-id-dot ${terminal?.status === "offline" ? "term-id-dot-offline" : ""}`}></div>
          <div className="term-id-info">
            <div className="term-id-name">{terminal?.name || terminalId}</div>
            <div className="term-id-status">{terminal?.status === "offline" ? "Pausada" : "En línea"}</div>
          </div>
          <button className="term-pause-btn" onClick={handleToggleTerminalStatus} disabled={!terminal}>
            {terminal?.status === "offline" ? "Reanudar" : "Pausar"}
          </button>
        </div>

        <div className="term-actions">
          <button
            className="term-btn term-btn-primary"
            onClick={handleNextTurn}
            disabled={loading || !terminal || terminal.status === "offline"}
          >
            Proximo turno
          </button>
          <button className="term-btn term-btn-default" onClick={handleCallTurn} disabled={loading || currentTurn?.status !== "waiting"}>
            Llamar
          </button>
          <button className="term-btn term-btn-default" onClick={handleStartTurn} disabled={loading || currentTurn?.status !== "called"}>
            Iniciar atencion
          </button>
          <button className="term-btn term-btn-success" onClick={handleFinishTurn} disabled={loading || currentTurn?.status !== "attending"}>
            Finalizar
          </button>

          <div className="term-actions-divider"></div>

          <button className="term-btn term-btn-outline" onClick={handleRecallTurn} disabled={loading || currentTurn?.status !== "called"}>
            Re-llamar
          </button>
          {confirmingNoShow ? (
            <div className="term-noshow-confirm">
              <span>¿Seguro?</span>
              <button className="term-btn term-btn-danger" onClick={handleConfirmNoShow} disabled={loading}>
                Sí, no presentó
              </button>
              <button className="term-btn term-btn-outline" onClick={() => setConfirmingNoShow(false)} disabled={loading}>
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="term-btn term-btn-danger"
              onClick={() => setConfirmingNoShow(true)}
              disabled={loading || currentTurn?.status !== "called"}
            >
              No presento
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="term-main">
        <div className="term-current tear-edge">
          {currentTurn ? (
            <>
              <span className="term-current-label">Atendiendo</span>
              <div className="term-current-number">{currentTurn.memberNumber}</div>
              <span className={`term-status-pill term-status-${currentTurn.status}`}>
                {STATUS_LABELS[currentTurn.status] ?? currentTurn.status}
              </span>
              {currentTurn.recallCount > 0 && (
                <span className="term-recall-badge">Reintentos: {currentTurn.recallCount}</span>
              )}
            </>
          ) : (
            <div className="term-empty">
              <div className="term-empty-icon">—</div>
              <div className="term-empty-text">Sin turno asignado</div>
            </div>
          )}
        </div>

        <div className="term-queue">
          <div className="term-queue-header">
            Cola de espera
            <span className="term-queue-count">{waitingTurns.length}</span>
          </div>
          <div className="term-queue-list">
            {waitingTurns.slice(0, 10).map((turn, idx) => (
              <div key={turn.id} className="term-queue-item" style={{ animationDelay: `${idx * 0.04}s` }}>
                <span className="term-queue-num">{turn.memberNumber}</span>
                <span className="term-queue-time">
                  {toDate(turn.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {turn.recallCount > 0 && <span className="term-queue-r">R{turn.recallCount}</span>}
              </div>
            ))}
            {waitingTurns.length === 0 && (
              <div className="term-queue-empty">Sin turnos esperando</div>
            )}
          </div>
        </div>
      </main>

      {/* Toast */}
      {message && (
        <div className={`term-toast term-toast-${message.type}`}>
          {message.text}
        </div>
      )}

      <style>{`
        .term {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: calc(100vh - 64px);
          background: var(--bg);
        }

        /* Sidebar */
        .term-sidebar {
          background: var(--surface);
          border-right: 1px solid var(--border);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .term-identity {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          background: var(--surface-warm);
          border-radius: var(--radius);
        }

        .term-id-dot {
          width: 10px;
          height: 10px;
          background: var(--secondary);
          border-radius: 50%;
          flex-shrink: 0;
          animation: pulse-online 2.5s ease-in-out infinite;
        }

        @keyframes pulse-online {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .term-id-dot-offline {
          background: var(--text-light);
          animation: none;
        }

        .term-id-info {
          flex: 1;
          min-width: 0;
        }

        .term-pause-btn {
          flex-shrink: 0;
          padding: 0.35rem 0.65rem;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .term-pause-btn:hover:not(:disabled) {
          border-color: var(--text-light);
          color: var(--text);
        }

        .term-id-name {
          font-weight: 600;
          font-size: 0.9rem;
          color: var(--text);
        }

        .term-id-status {
          font-size: 0.75rem;
          color: var(--secondary);
          font-weight: 500;
        }

        .term-actions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1;
        }

        .term-actions-divider {
          height: 1px;
          background: var(--border-light);
          margin: 0.25rem 0;
        }

        .term-noshow-confirm {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding: 0.6rem;
          background: var(--danger-light);
          border-radius: var(--radius-sm);
        }

        .term-noshow-confirm span {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--danger);
        }

        /* Base buttons read as physical counter controls: a bottom "lip"
           that flattens on press, like a bell-push. Secondary/exception
           actions (outline, danger) stay flat and quiet by contrast. */
        .term-btn {
          padding: 0.8rem 1rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-family: var(--font-body);
          font-size: 0.9rem;
          font-weight: 600;
          text-align: left;
          background: var(--surface);
          color: var(--text);
          box-shadow: 0 3px 0 var(--border);
          transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .term-btn:active:not(:disabled) {
          transform: translateY(3px);
          box-shadow: 0 0 0 var(--border);
        }

        .term-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .term-btn-primary {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
          box-shadow: 0 3px 0 var(--primary-hover);
        }

        .term-btn-primary:hover:not(:disabled) {
          background: var(--primary-hover);
        }

        .term-btn-primary:active:not(:disabled) {
          box-shadow: 0 0 0 var(--primary-hover);
        }

        .term-btn-default:hover:not(:disabled) {
          background: var(--surface-warm);
          border-color: var(--text-light);
        }

        .term-btn-success {
          background: var(--secondary);
          border-color: var(--secondary);
          color: white;
          box-shadow: 0 3px 0 #4e7a51;
        }

        .term-btn-success:hover:not(:disabled) {
          background: #4e7a51;
        }

        .term-btn-success:active:not(:disabled) {
          box-shadow: 0 0 0 #4e7a51;
        }

        .term-btn-outline {
          background: transparent;
          border-color: var(--border);
          color: var(--text-muted);
          box-shadow: none;
        }

        .term-btn-outline:active:not(:disabled) {
          transform: translateY(1px);
        }

        .term-btn-outline:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-light);
        }

        .term-btn-danger {
          background: transparent;
          border-color: var(--border);
          color: var(--danger);
          box-shadow: none;
        }

        .term-btn-danger:active:not(:disabled) {
          transform: translateY(1px);
        }

        .term-btn-danger:hover:not(:disabled) {
          background: var(--danger-light);
          border-color: var(--danger);
        }

        /* Main */
        .term-main {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          padding: 1.5rem;
          overflow: hidden;
        }

        /* Current turn */
        .term-current {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px 6px var(--radius-lg) var(--radius-lg);
          padding: 3.75rem 3rem 3rem;
          gap: 1rem;
        }

        .term-current-label {
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--text-muted);
        }

        .term-current-number {
          font-family: var(--font-display);
          font-size: 10rem;
          font-weight: 900;
          line-height: 1;
          color: var(--primary);
        }

        .term-status-pill {
          display: inline-block;
          padding: 0.35rem 1rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: capitalize;
        }

        .term-status-waiting { background: var(--accent-light); color: var(--accent); }
        .term-status-called { background: var(--primary-light); color: var(--primary); }
        .term-status-attending { background: var(--secondary-light); color: var(--secondary); }

        .term-recall-badge {
          font-size: 0.8rem;
          color: var(--accent);
          font-weight: 500;
        }

        .term-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .term-empty-icon {
          font-size: 4rem;
          color: var(--border);
          font-family: var(--font-display);
        }

        .term-empty-text {
          color: var(--text-light);
          font-size: 0.95rem;
        }

        /* Queue */
        .term-queue {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .term-queue-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 0.75rem;
        }

        .term-queue-count {
          background: var(--surface-warm);
          color: var(--text-muted);
          padding: 0.2rem 0.6rem;
          border-radius: 999px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .term-queue-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .term-queue-item {
          display: grid;
          grid-template-columns: 50px 1fr auto;
          gap: 0.75rem;
          align-items: center;
          padding: 0.7rem 0.75rem;
          background: var(--surface-warm);
          border-radius: var(--radius-sm);
          animation: item-in 0.3s ease-out forwards;
          opacity: 0;
        }

        @keyframes item-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .term-queue-num {
          font-family: var(--font-display);
          font-size: 1.3rem;
          font-weight: 700;
          color: var(--primary);
        }

        .term-queue-time {
          font-size: 0.8rem;
          color: var(--text-light);
          font-variant-numeric: tabular-nums;
        }

        .term-queue-r {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-light);
          padding: 0.15rem 0.5rem;
          border-radius: 999px;
        }

        .term-queue-empty {
          text-align: center;
          padding: 2rem;
          color: var(--text-light);
          font-size: 0.9rem;
        }

        .term-queue-list::-webkit-scrollbar { width: 4px; }
        .term-queue-list::-webkit-scrollbar-track { background: transparent; }
        .term-queue-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

        /* Toast */
        .term-toast {
          position: fixed;
          bottom: 1.5rem;
          left: 50%;
          transform: translateX(-50%);
          padding: 0.75rem 1.5rem;
          border-radius: var(--radius);
          font-weight: 600;
          font-size: 0.9rem;
          z-index: 100;
          animation: toast-in 0.3s ease-out;
          box-shadow: var(--shadow-lg);
        }

        @keyframes toast-in {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }

        .term-toast-success {
          background: var(--secondary);
          color: white;
        }

        .term-toast-error {
          background: var(--danger);
          color: white;
        }

        @media (max-width: 900px) {
          .term {
            grid-template-columns: 1fr;
          }
          .term-sidebar {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .term-main {
            grid-template-columns: 1fr;
          }
          .term-current-number {
            font-size: 6rem;
          }
        }
      `}</style>
    </div>
  );
}
