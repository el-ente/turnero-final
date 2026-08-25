import { useState, useEffect } from "react";
import type { Turn, Queue } from "shared";
import { createTurn } from "../lib/api";
import { toDate } from "../lib/dates";
import { db } from "../lib/firebase";
import { collection, getDocs, query } from "firebase/firestore";
import { TicketMark } from "../components/TicketMark";

const IDLE_RESET_MS = 25000;
const CONFIRM_DISPLAY_MS = 5000;

export function TotemView() {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [memberNumberInput, setMemberNumberInput] = useState<string>("");
  const [confirmedMemberNumber, setConfirmedMemberNumber] = useState<number | null>(null);
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<"entering-number" | "selecting-queue" | "confirmed">("entering-number");

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

  const handleNewTurn = () => {
    setCurrentTurn(null);
    setStatus("entering-number");
    setMemberNumberInput("");
    setConfirmedMemberNumber(null);
    setError("");
  };

  // Auto-dismiss the confirmation screen so the kiosk is free for the next customer
  useEffect(() => {
    if (status !== "confirmed") return;
    const timer = setTimeout(handleNewTurn, CONFIRM_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [status, currentTurn?.id]);

  // Idle reset — an abandoned interaction shouldn't block the next customer either
  useEffect(() => {
    if (status === "confirmed") return;
    const timer = setTimeout(handleNewTurn, IDLE_RESET_MS);
    return () => clearTimeout(timer);
  }, [status, memberNumberInput, selectedQueueId]);

  const handleMemberNumberChange = (value: string) => {
    setMemberNumberInput(value.replace(/\D/g, "").slice(0, 5));
  };

  const handleSubmitNumber = () => {
    if (!isValidMemberNumber) return;
    setConfirmedMemberNumber(parsedMemberNumber);
    setStatus("selecting-queue");
    setError("");
  };

  const handleBackToEnteringNumber = () => {
    setStatus("entering-number");
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
      setStatus("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear turno");
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
            disabled={!isValidMemberNumber}
          >
            Continuar
          </button>
        </div>

        <style>{totemBaseStyles}</style>
        <style>{selectingStyles}</style>
        <style>{numberEntryStyles}</style>
      </div>
    );
  }

  if (status === "selecting-queue") {
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
            <button className="totem-change-link" onClick={handleBackToEnteringNumber}>
              cambiar
            </button>
          </div>

          {queues.length === 0 ? (
            <div className="totem-empty">No hay colas disponibles</div>
          ) : (
            <div className="queue-options">
              {queues.map((queue) => (
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

          {queues.find((q) => q.id === selectedQueueId)?.type === "priority" && (
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

  if (status === "confirmed" && currentTurn) {
    const queue = queues.find((q) => q.id === currentTurn.queueId);

    return (
      <div className="totem">
        <div className="ticket-card">
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
            <div className="ticket-status">Ticket listo</div>
            <div className="ticket-hint">Mirá el panel para seguir tu turno</div>
            <div className="ticket-time">
              {toDate(currentTurn.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
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

  @keyframes ticket-in {
    from { opacity: 0; transform: scale(0.9) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
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

  .ticket-hint {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .ticket-time {
    font-size: 0.85rem;
    color: var(--text-light);
  }
`;
