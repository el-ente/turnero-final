import { useState, useEffect } from "react";
import type { Turn, Terminal } from "shared";
import { db } from "../lib/firebase";
import { doc, getDoc, collection, query, where, onSnapshot } from "firebase/firestore";
import {
  getNextTurn,
  callTurn,
  startTurn,
  finishTurn,
  noShowTurn,
  recallTurn,
} from "../lib/api";

const TERMINAL_ID = "terminal-1"; // For demo, hardcoded

export function TerminalView() {
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [waitingTurns, setWaitingTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load terminal config
  useEffect(() => {
    const loadTerminal = async () => {
      try {
        const terminalDoc = await getDoc(doc(db, "terminals", TERMINAL_ID));
        if (terminalDoc.exists()) {
          setTerminal(terminalDoc.data() as Terminal);
        }
      } catch (err) {
        console.error("Error loading terminal:", err);
      }
    };
    loadTerminal();
  }, []);

  // Real-time listener for waiting turns in active queues
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
        .sort((a, b) => {
          const numCmp = a.currentTurnNumber - b.currentTurnNumber;
          return numCmp !== 0 ? numCmp : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      setWaitingTurns(turns);
    });

    return unsubscribe;
  }, [terminal?.activeQueueIds]);

  // Load current turn if exists
  useEffect(() => {
    if (!terminal?.currentTurnId) {
      setCurrentTurn(null);
      return;
    }

    const loadCurrentTurn = async () => {
      try {
        const turnDoc = await getDoc(doc(db, "turns", terminal.currentTurnId!));
        if (turnDoc.exists()) {
          const turnData = turnDoc.data() as Turn;
          setCurrentTurn(turnData);
        } else {
          setCurrentTurn(null);
        }
      } catch (err) {
        console.error("Error loading current turn:", err);
        setCurrentTurn(null);
      }
    };
    loadCurrentTurn();
  }, [terminal?.currentTurnId]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleNextTurn = async () => {
    setLoading(true);
    try {
      const turn = await getNextTurn(TERMINAL_ID);
      if (turn) {
        setCurrentTurn(turn);
        showMessage("success", `Turno ${turn.currentTurnNumber} seleccionado`);
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
      await callTurn(TERMINAL_ID, currentTurn.id);
      showMessage("success", `Turno ${currentTurn.currentTurnNumber} llamado`);
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleStartTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await startTurn(TERMINAL_ID, currentTurn.id);
      showMessage("success", "Atención iniciada");
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
      await finishTurn(TERMINAL_ID, currentTurn.id);
      setCurrentTurn(null);
      showMessage("success", "Turno finalizado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleNoShow = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await noShowTurn(TERMINAL_ID, currentTurn.id);
      setCurrentTurn(null);
      showMessage("success", "Turno marcado como no presentado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleRecallTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await recallTurn(TERMINAL_ID, currentTurn.id);
      showMessage("success", "Turno re-llamado");
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="terminal-view">
      {/* Control Panel */}
      <div className="control-panel">
        <div className="terminal-info">
          <div className="terminal-id">{TERMINAL_ID}</div>
          <div className="terminal-status">EN LÍNEA</div>
        </div>

        <div className="action-buttons">
          <button
            className="btn btn-primary"
            onClick={handleNextTurn}
            disabled={loading || !terminal}
          >
            <span className="btn-icon">→</span>
            <span>Próximo</span>
          </button>

          <button
            className="btn btn-call"
            onClick={handleCallTurn}
            disabled={loading || !currentTurn}
          >
            <span className="btn-icon">📢</span>
            <span>Llamar</span>
          </button>

          <button
            className="btn btn-start"
            onClick={handleStartTurn}
            disabled={loading || !currentTurn}
          >
            <span className="btn-icon">▶</span>
            <span>Iniciar</span>
          </button>

          <button
            className="btn btn-finish"
            onClick={handleFinishTurn}
            disabled={loading || !currentTurn}
          >
            <span className="btn-icon">✓</span>
            <span>Finalizar</span>
          </button>

          <button
            className="btn btn-recall"
            onClick={handleRecallTurn}
            disabled={loading || !currentTurn}
          >
            <span className="btn-icon">🔄</span>
            <span>Re-llamar</span>
          </button>

          <button
            className="btn btn-noshow"
            onClick={handleNoShow}
            disabled={loading || !currentTurn}
          >
            <span className="btn-icon">✗</span>
            <span>No Presentó</span>
          </button>
        </div>
      </div>

      {/* Main Display */}
      <div className="main-area">
        {/* Current Turn Display */}
        <div className="current-turn-display">
          {currentTurn ? (
            <>
              <div className="turn-header">ATENDIENDO</div>
              <div className="turn-number">{currentTurn.currentTurnNumber}</div>
              <div className="turn-status-badge">{currentTurn.status.toUpperCase()}</div>
              {currentTurn.recallCount > 0 && (
                <div className="turn-meta">Reintentos: {currentTurn.recallCount}</div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">—</div>
              <div className="empty-text">Sin turno asignado</div>
            </div>
          )}
        </div>

        {/* Waiting Queue */}
        <div className="waiting-queue">
          <div className="queue-header">COLA DE ESPERA ({waitingTurns.length})</div>
          <div className="queue-list">
            {waitingTurns.slice(0, 10).map((turn, idx) => (
              <div key={turn.id} className="queue-item" style={{ animationDelay: `${idx * 0.05}s` }}>
                <span className="queue-number">{turn.currentTurnNumber}</span>
                <span className="queue-time">
                  {new Date(turn.createdAt).toLocaleTimeString("es-AR")}
                </span>
                {turn.recallCount > 0 && <span className="queue-requeue">R{turn.recallCount}</span>}
              </div>
            ))}
            {waitingTurns.length === 0 && <div className="queue-empty">Sin turnos esperando</div>}
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Outfit:wght@300;400;600;700&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .terminal-view {
          width: 100%;
          height: 100vh;
          background: linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%);
          display: grid;
          grid-template-columns: 300px 1fr;
          grid-template-rows: auto 1fr;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* Control Panel */
        .control-panel {
          grid-column: 1;
          grid-row: 1 / 3;
          background: #0a0d13;
          border-right: 3px solid #0ffe00;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          overflow-y: auto;
        }

        .terminal-info {
          text-align: center;
          padding: 1.5rem;
          border: 2px solid #0ffe00;
          border-radius: 0;
          background: rgba(15, 254, 0, 0.05);
        }

        .terminal-id {
          font-family: 'Space Mono', monospace;
          font-size: 1.2rem;
          font-weight: 700;
          color: #0ffe00;
          letter-spacing: 1px;
        }

        .terminal-status {
          font-size: 0.8rem;
          color: #0ffe00;
          margin-top: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          animation: blink-status 2s ease-in-out infinite;
        }

        @keyframes blink-status {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }

        .btn {
          padding: 1rem;
          border: 2px solid transparent;
          border-radius: 0;
          background: rgba(15, 254, 0, 0.1);
          color: #fff;
          cursor: pointer;
          font-family: 'Outfit', sans-serif;
          font-size: 0.95rem;
          font-weight: 600;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          transition: all 0.2s;
          text-transform: uppercase;
        }

        .btn-icon {
          font-size: 1.2rem;
        }

        .btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .btn-primary {
          border-color: #0ffe00;
          color: #0ffe00;
        }

        .btn-primary:hover:not(:disabled) {
          background: rgba(15, 254, 0, 0.2);
          box-shadow: 0 0 10px rgba(15, 254, 0, 0.3);
        }

        .btn-call, .btn-start, .btn-finish {
          border-color: #00d4ff;
          color: #00d4ff;
        }

        .btn-call:hover:not(:disabled),
        .btn-start:hover:not(:disabled),
        .btn-finish:hover:not(:disabled) {
          background: rgba(0, 212, 255, 0.2);
          box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
        }

        .btn-recall {
          border-color: #ffa500;
          color: #ffa500;
        }

        .btn-recall:hover:not(:disabled) {
          background: rgba(255, 165, 0, 0.2);
          box-shadow: 0 0 10px rgba(255, 165, 0, 0.3);
        }

        .btn-noshow {
          border-color: #ff3333;
          color: #ff3333;
        }

        .btn-noshow:hover:not(:disabled) {
          background: rgba(255, 51, 51, 0.2);
          box-shadow: 0 0 10px rgba(255, 51, 51, 0.3);
        }

        /* Main Area */
        .main-area {
          grid-column: 2;
          grid-row: 2;
          display: grid;
          grid-template-columns: 1fr 350px;
          gap: 2rem;
          padding: 2rem;
          overflow: hidden;
        }

        /* Current Turn */
        .current-turn-display {
          background: linear-gradient(135deg, rgba(15, 254, 0, 0.05), rgba(0, 212, 255, 0.05));
          border: 3px solid #0ffe00;
          border-radius: 0;
          padding: 3rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          position: relative;
          overflow: hidden;
        }

        .current-turn-display::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 50% 50%, rgba(15, 254, 0, 0.1), transparent);
          pointer-events: none;
        }

        .turn-header {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: #0ffe00;
          text-transform: uppercase;
          position: relative;
          z-index: 1;
        }

        .turn-number {
          font-family: 'Space Mono', monospace;
          font-size: 12rem;
          font-weight: 700;
          line-height: 0.9;
          color: #0ffe00;
          text-shadow: 0 0 20px rgba(15, 254, 0, 0.5);
          position: relative;
          z-index: 1;
          animation: pulse-number 2s ease-in-out infinite;
        }

        @keyframes pulse-number {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .turn-status-badge {
          font-size: 1rem;
          font-weight: 700;
          padding: 0.5rem 1rem;
          border: 2px solid #00d4ff;
          color: #00d4ff;
          letter-spacing: 1px;
          position: relative;
          z-index: 1;
        }

        .turn-meta {
          font-size: 0.9rem;
          color: #ffa500;
          position: relative;
          z-index: 1;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          color: #666;
        }

        .empty-icon {
          font-size: 6rem;
          color: #333;
        }

        .empty-text {
          font-size: 1.1rem;
          color: #999;
        }

        /* Waiting Queue */
        .waiting-queue {
          background: rgba(15, 254, 0, 0.02);
          border: 2px solid rgba(15, 254, 0, 0.2);
          border-radius: 0;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          overflow: hidden;
        }

        .queue-header {
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 1px;
          color: #0ffe00;
          text-transform: uppercase;
        }

        .queue-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .queue-item {
          display: grid;
          grid-template-columns: 60px 1fr auto;
          gap: 0.8rem;
          align-items: center;
          padding: 0.8rem;
          background: rgba(15, 254, 0, 0.08);
          border-left: 3px solid #00d4ff;
          animation: slide-in-item 0.4s ease-out forwards;
          opacity: 0;
        }

        @keyframes slide-in-item {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .queue-number {
          font-family: 'Space Mono', monospace;
          font-size: 1.5rem;
          font-weight: 700;
          color: #0ffe00;
        }

        .queue-time {
          font-size: 0.8rem;
          color: #999;
        }

        .queue-requeue {
          font-size: 0.7rem;
          padding: 0.3rem 0.6rem;
          background: #ffa500;
          color: #000;
          border-radius: 2px;
          font-weight: 600;
        }

        .queue-empty {
          padding: 2rem;
          text-align: center;
          color: #666;
          font-size: 0.9rem;
        }

        /* Message */
        .message {
          position: fixed;
          bottom: 2rem;
          left: 50%;
          transform: translateX(-50%);
          padding: 1rem 2rem;
          border-radius: 0;
          font-weight: 600;
          letter-spacing: 0.5px;
          z-index: 100;
          animation: slide-up 0.3s ease-out;
        }

        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        .message-success {
          background: #0ffe00;
          color: #000;
        }

        .message-error {
          background: #ff3333;
          color: #fff;
        }

        /* Scrollbar */
        .queue-list::-webkit-scrollbar {
          width: 6px;
        }

        .queue-list::-webkit-scrollbar-track {
          background: transparent;
        }

        .queue-list::-webkit-scrollbar-thumb {
          background: rgba(15, 254, 0, 0.3);
        }
      `}</style>
    </div>
  );
}
