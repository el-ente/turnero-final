import { useState, useEffect } from "react";
import type { Turn, Queue } from "shared";
import { createTurn, getCurrentTurn, cancelTurn } from "../lib/api";
import { toDate } from "../lib/dates";
import { db } from "../lib/firebase";
import { collection, getDocs, query, where, doc, onSnapshot } from "firebase/firestore";
import { TicketMark } from "../components/TicketMark";

export function TotemView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [memberNumberInput, setMemberNumberInput] = useState<string>("");
  const [confirmedMemberNumber, setConfirmedMemberNumber] = useState<number | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<"entering-number" | "selecting-queue" | "viewing">("entering-number");

  const parsedMemberNumber = Number(memberNumberInput);
  const isValidMemberNumber =
    memberNumberInput.length > 0 &&
    Number.isInteger(parsedMemberNumber) &&
    parsedMemberNumber >= 1 &&
    parsedMemberNumber <= 99999;

  // Load queues (in the background, independent of the identity flow)
  useEffect(() => {
    const loadQueues = async () => {
      try {
        const q = query(collection(db, "queues"));
        const snapshot = await getDocs(q);
        const queueList = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Queue)
          .filter((queue) => queue.active !== false);
        setQueues(queueList);
        if (queueList.length > 0 && !selectedQueueId) {
          setSelectedQueueId(queueList[0].id);
        }
      } catch (err) {
        setError("Error cargando colas");
      }
    };
    loadQueues();
  }, []);

  // Real-time listener on active turn
  useEffect(() => {
    if (!currentTurn?.id) return;

    const unsubscribe = onSnapshot(doc(db, "turns", currentTurn.id), (snap) => {
      if (!snap.exists()) return;
      const turn = { ...snap.data(), id: snap.id } as Turn;
      setCurrentTurn(turn);

      // Turn ended — allow the next kiosk user in, but they must type their own number
      if (["finished", "cancelled", "no_show"].includes(turn.status)) {
        setTimeout(() => {
          setCurrentTurn(null);
          setStatus("entering-number");
          setMemberNumberInput("");
          setConfirmedMemberNumber(null);
        }, 5000);
      }
    });
    return unsubscribe;
  }, [currentTurn?.id]);

  // Live count of waiting turns ahead of this one in the same queue
  const [aheadCount, setAheadCount] = useState<number | null>(null);
  useEffect(() => {
    if (!currentTurn || currentTurn.status !== "waiting") {
      setAheadCount(null);
      return;
    }
    const q = query(
      collection(db, "turns"),
      where("queueId", "==", currentTurn.queueId),
      where("status", "==", "waiting")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ahead = snapshot.docs
        .map((d) => d.data() as Turn)
        .filter((t) => toDate(t.queuedAt).getTime() < toDate(currentTurn.queuedAt).getTime()).length;
      setAheadCount(ahead);
    });
    return unsubscribe;
  }, [currentTurn?.queueId, currentTurn?.status, currentTurn?.queuedAt]);

  const handleMemberNumberChange = (value: string) => {
    setMemberNumberInput(value.replace(/\D/g, "").slice(0, 5));
  };

  const handleSubmitNumber = async () => {
    if (!isValidMemberNumber) return;
    const memberNumber = parsedMemberNumber;
    setLoading(true);
    setError("");
    try {
      const turn = await getCurrentTurn(memberNumber);
      if (turn) {
        setCurrentTurn(turn);
        setStatus("viewing");
      } else {
        setConfirmedMemberNumber(memberNumber);
        setStatus("selecting-queue");
      }
    } catch {
      // No active turn found for this member number — go pick a queue
      setConfirmedMemberNumber(memberNumber);
      setStatus("selecting-queue");
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEnteringNumber = () => {
    setStatus("entering-number");
    setError("");
  };

  const handleTakeAnotherSection = () => {
    if (!currentTurn) return;
    setConfirmedMemberNumber(currentTurn.memberNumber);
    setSelectedQueueId("");
    setStatus("selecting-queue");
    setError("");
  };

  const handleBackToViewing = () => {
    setStatus("viewing");
    setError("");
  };

  const handleTakeTurn = async () => {
    if (!selectedQueueId || confirmedMemberNumber === null) {
      setError("Seleccioná una cola");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const turn = await createTurn(selectedQueueId, confirmedMemberNumber, "totem");
      setCurrentTurn(turn);
      setStatus("viewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear turno");
    } finally {
      setLoading(false);
    }
  };

  const handleNewTurn = () => {
    setCurrentTurn(null);
    setStatus("entering-number");
    setMemberNumberInput("");
    setConfirmedMemberNumber(null);
    setError("");
  };

  const handleCancelTurn = async () => {
    if (!currentTurn) return;
    setLoading(true);
    try {
      await cancelTurn(currentTurn.id);
      handleNewTurn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar turno");
    } finally {
      setLoading(false);
    }
  };

  if (status === "entering-number") {
    return (
      <div className="totem">
        <div className="totem-card">
          <div className="totem-header">
            <TicketMark size={36} className="totem-icon" />
            <h1>Sacar turno</h1>
            <p className="totem-subtitle">Ingresá tu número de socio</p>
          </div>

          <div className="totem-number-group">
            <input
              className="totem-number-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={memberNumberInput}
              onChange={(e) => handleMemberNumberChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmitNumber();
              }}
              placeholder="Ej: 4213"
              autoFocus
            />
            {!isValidMemberNumber && (
              <p className="totem-hint">Ingresá un número de 1 a 5 dígitos.</p>
            )}
          </div>

          {error && <div className="totem-error">{error}</div>}

          <button
            className="totem-submit"
            onClick={handleSubmitNumber}
            disabled={loading || !isValidMemberNumber}
          >
            {loading ? "Verificando..." : "Continuar"}
          </button>
        </div>

        <style>{totemBaseStyles}</style>
        <style>{selectingStyles}</style>
        <style>{numberEntryStyles}</style>
      </div>
    );
  }

  if (status === "selecting-queue") {
    const selectableQueues = currentTurn
      ? queues.filter((q) => q.id !== currentTurn.queueId)
      : queues;

    return (
      <div className="totem">
        <div className="totem-card">
          <div className="totem-header">
            <TicketMark size={36} className="totem-icon" />
            <h1>Sacar turno</h1>
            <p className="totem-subtitle">Seleccioná la cola y retirá tu número</p>
          </div>

          <div className="totem-member-confirm">
            <span>Socio N° {confirmedMemberNumber}</span>
            {currentTurn ? (
              <button className="totem-change-link" onClick={handleBackToViewing}>
                volver a mi turno actual
              </button>
            ) : (
              <button className="totem-change-link" onClick={handleBackToEnteringNumber}>
                cambiar
              </button>
            )}
          </div>

          {selectableQueues.length === 0 ? (
            <div className="totem-empty">No hay colas disponibles</div>
          ) : (
            <div className="queue-options">
              {selectableQueues.map((queue) => (
                <button
                  key={queue.id}
                  className={`queue-option ${selectedQueueId === queue.id ? "selected" : ""}`}
                  onClick={() => setSelectedQueueId(queue.id)}
                >
                  <span className="queue-option-name">{queue.name}</span>
                  {queue.type === "priority" && <span className="queue-priority-tag">Prioritaria</span>}
                </button>
              ))}
            </div>
          )}

          {selectableQueues.find((q) => q.id === selectedQueueId)?.type === "priority" && (
            <p className="totem-priority-note">
              Para personas mayores, embarazadas o con discapacidad.
            </p>
          )}

          {error && <div className="totem-error">{error}</div>}

          <button
            className="totem-submit"
            onClick={handleTakeTurn}
            disabled={loading || !selectedQueueId}
          >
            {loading ? "Procesando..." : "Confirmar turno"}
          </button>
        </div>

        <style>{totemBaseStyles}</style>
        <style>{selectingStyles}</style>
      </div>
    );
  }

  if (status === "viewing" && currentTurn) {
    const queue = queues.find((q) => q.id === currentTurn.queueId);
    const isCalled = currentTurn.status === "called";
    const isEnded = ["finished", "cancelled", "no_show"].includes(currentTurn.status);

    return (
      <div className="totem">
        <div className={`ticket-card ${isCalled ? "ticket-called" : ""}`}>
          {currentTurn.status === "waiting" && (
            <button className="ticket-not-you" onClick={handleNewTurn}>
              ¿No sos vos? Sacar mi turno
            </button>
          )}

          <div className="ticket-top">
            <span className="ticket-label">Tu turno</span>
            <div className="ticket-number">{currentTurn.memberNumber}</div>
            <span className="ticket-queue">{queue?.name || currentTurn.queueId}</span>
          </div>

          <div className="ticket-divider">
            <div className="ticket-notch ticket-notch-left"></div>
            <div className="ticket-dash"></div>
            <div className="ticket-notch ticket-notch-right"></div>
          </div>

          <div className="ticket-bottom">
            <div className={`ticket-status ${isCalled ? "ticket-status-called" : ""}`}>
              {currentTurn.status === "waiting" && "Esperando..."}
              {currentTurn.status === "called" && "¡Te están llamando!"}
              {currentTurn.status === "attending" && "En atención"}
              {currentTurn.status === "finished" && "Finalizado"}
              {currentTurn.status === "cancelled" && "Cancelado"}
              {currentTurn.status === "no_show" && "No presentado"}
            </div>
            {currentTurn.terminalId && isCalled && (
              <div className="ticket-terminal">Dirigite al terminal</div>
            )}
            {currentTurn.status === "waiting" && aheadCount !== null && (
              <div className="ticket-position">
                {aheadCount === 0 ? "Sos el próximo" : `${aheadCount} persona${aheadCount !== 1 ? "s" : ""} por delante tuyo`}
              </div>
            )}
            <div className="ticket-time">
              {toDate(currentTurn.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            {currentTurn.recallCount > 0 && (
              <div className="ticket-recall">Rellamado {currentTurn.recallCount}x</div>
            )}
          </div>

          {!isEnded && (
            <button className="ticket-another-section" onClick={handleTakeAnotherSection}>
              Sacar turno en otra sección
            </button>
          )}

          {currentTurn.status === "waiting" && (
            <button className="ticket-cancel" onClick={handleCancelTurn} disabled={loading}>
              {loading ? "Cancelando..." : "Cancelar turno"}
            </button>
          )}

          {isEnded && (
            <button className="totem-submit" onClick={handleNewTurn}>
              Sacar otro turno
            </button>
          )}
        </div>

        <style>{totemBaseStyles}</style>
        <style>{ticketStyles}</style>
      </div>
    );
  }

  return null;
}

const totemBaseStyles = `
  .totem {
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

  .totem-card {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    box-shadow: var(--shadow-md);
  }

  .totem-loading {
    color: var(--text-muted);
    font-size: 1rem;
  }

  .totem-submit {
    width: 100%;
    padding: 1rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 1.05rem;
    font-weight: 600;
    transition: all 0.15s ease;
    box-shadow: 0 2px 8px rgba(212,96,58,0.25);
  }

  .totem-submit:hover:not(:disabled) {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(212,96,58,0.3);
  }

  .totem-submit:active:not(:disabled) {
    transform: translateY(0);
  }

  .totem-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const selectingStyles = `
  .totem-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .totem-icon {
    display: block;
    margin: 0 auto 0.75rem;
    color: var(--primary);
  }

  .totem-header h1 {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.5rem;
  }

  .totem-subtitle {
    color: var(--text-muted);
    font-size: 0.95rem;
  }

  .totem-member-confirm {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    margin: -1.25rem 0 1.5rem;
  }

  .totem-change-link {
    background: none;
    border: none;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 0.85rem;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .totem-change-link:hover {
    color: var(--primary-hover);
  }

  .queue-options {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    margin-bottom: 1.5rem;
  }

  .queue-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 1rem;
    font-weight: 500;
    color: var(--text);
    transition: all 0.15s ease;
  }

  .queue-option:hover {
    border-color: var(--primary);
    background: rgba(212,96,58,0.03);
  }

  .queue-option.selected {
    border-color: var(--primary);
    background: var(--primary-light);
    color: var(--primary-hover);
  }

  .queue-option-name {
    font-weight: 500;
  }

  .queue-priority-tag {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-light);
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
  }

  .totem-priority-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: -0.75rem 0 1rem;
    padding: 0 0.25rem;
  }

  .totem-error {
    color: var(--danger);
    background: var(--danger-light);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .totem-empty {
    text-align: center;
    color: var(--text-muted);
    padding: 2rem;
    font-size: 0.95rem;
  }
`;

const numberEntryStyles = `
  .totem-number-group {
    margin-bottom: 1.5rem;
  }

  .totem-number-input {
    width: 100%;
    padding: 1rem 1.25rem;
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.1em;
    color: var(--text);
    background: var(--surface);
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  .totem-number-input:focus {
    outline: none;
    border-color: var(--primary);
  }

  .totem-hint {
    color: var(--text-muted);
    font-size: 0.8rem;
    margin: 0.5rem 0.25rem 0;
  }
`;

const ticketStyles = `
  .ticket-card {
    position: relative;
    width: 100%;
    max-width: 400px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    animation: ticket-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  .ticket-not-you {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: none;
    border: none;
    color: var(--text-light);
    font-family: var(--font-body);
    font-size: 0.75rem;
    text-decoration: underline;
    cursor: pointer;
    padding: 0.25rem;
    z-index: 1;
  }

  .ticket-not-you:hover {
    color: var(--text-muted);
  }

  .ticket-called {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(212,96,58,0.15), var(--shadow-lg);
    animation: ticket-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), ticket-pulse 1.5s ease-in-out infinite;
  }

  @keyframes ticket-in {
    from { opacity: 0; transform: scale(0.9) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes ticket-pulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(212,96,58,0.15), var(--shadow-lg); }
    50% { box-shadow: 0 0 0 6px rgba(212,96,58,0.25), var(--shadow-lg); }
  }

  .ticket-top {
    text-align: center;
    padding: 2.5rem 2rem 2rem;
    background: linear-gradient(135deg, rgba(212,96,58,0.05), rgba(233,168,76,0.05));
  }

  .ticket-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .ticket-number {
    font-family: var(--font-display);
    font-size: 7rem;
    font-weight: 900;
    line-height: 1;
    color: var(--primary);
    margin-bottom: 0.5rem;
  }

  .ticket-queue {
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .ticket-divider {
    position: relative;
    height: 1px;
    margin: 0;
  }

  .ticket-notch {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    background: var(--bg);
    border-radius: 50%;
  }

  .ticket-notch-left { left: -10px; }
  .ticket-notch-right { right: -10px; }

  .ticket-dash {
    position: absolute;
    top: 50%;
    left: 20px;
    right: 20px;
    border-top: 2px dashed var(--border);
  }

  .ticket-bottom {
    text-align: center;
    padding: 1.5rem 2rem;
  }

  .ticket-status {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--secondary);
    margin-bottom: 0.25rem;
  }

  .ticket-status-called {
    color: var(--primary);
    font-size: 1.3rem;
    animation: status-blink 1s ease-in-out infinite;
  }

  @keyframes status-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .ticket-terminal {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .ticket-position {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--secondary);
    margin-bottom: 0.25rem;
  }

  .ticket-another-section {
    display: block;
    width: calc(100% - 3rem);
    margin: 0 1.5rem 0.75rem;
    padding: 0.7rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ticket-another-section:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-light);
  }

  .ticket-cancel {
    display: block;
    width: calc(100% - 3rem);
    margin: 0 1.5rem 1.5rem;
    padding: 0.7rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .ticket-cancel:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--danger-light);
  }

  .ticket-cancel:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .ticket-time {
    font-size: 0.85rem;
    color: var(--text-light);
  }

  .ticket-recall {
    display: inline-block;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-light);
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .totem-submit {
    width: calc(100% - 3rem);
    margin: 0 1.5rem 1.5rem;
  }
`;
