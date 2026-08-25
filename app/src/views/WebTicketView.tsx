import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Turn, Queue } from "shared";
import { createTurn, cancelTurn } from "../lib/api";
import { toDate } from "../lib/dates";
import { STATUS_LABELS } from "../lib/turnStatusLabels";
import { db } from "../lib/firebase";
import { collection, getDocs, query, doc, onSnapshot, where } from "firebase/firestore";
import { TicketMark } from "../components/TicketMark";

// Unlike Totem (a shared kiosk that must reset fast for the next stranger),
// this page is one visitor's own tab/device — it's meant to be left open,
// bookmarked, or reopened later, so it tracks live status and offers cancel
// instead of resetting.
export function WebTicketView() {
  const { turnId } = useParams<{ turnId?: string }>();
  const navigate = useNavigate();

  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [memberNumberInput, setMemberNumberInput] = useState<string>("");
  const [confirmedMemberNumber, setConfirmedMemberNumber] = useState<number | null>(null);
  const [status, setStatus] = useState<"entering-number" | "selecting-queue">("entering-number");
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string>("");
  // Separate from `error` (which reports action failures like a failed
  // cancel) — this flags a dead live-tracking listener, so the visitor
  // knows the ticket status on screen may no longer be updating.
  const [listenerErrors, setListenerErrors] = useState<Record<string, boolean>>({});
  const setListenerError = (key: string, hasError: boolean) =>
    setListenerErrors((current) => ({ ...current, [key]: hasError }));
  const hasConnectionError = Object.values(listenerErrors).some(Boolean);

  const parsedMemberNumber = Number(memberNumberInput);
  const isValidMemberNumber =
    memberNumberInput.length > 0 &&
    Number.isInteger(parsedMemberNumber) &&
    parsedMemberNumber >= 1 &&
    parsedMemberNumber <= 99999;

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
      } catch {
        setError("Error cargando colas");
      }
    };
    loadQueues();
  }, []);

  // Live tracking of the ticket once we know its id — from the URL, or just
  // created below and pushed into it via navigate().
  useEffect(() => {
    if (!turnId) {
      setCurrentTurn(null);
      setNotFound(false);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, "turns", turnId),
      (snap) => {
        setListenerError("turn", false);
        if (!snap.exists()) {
          setNotFound(true);
          setCurrentTurn(null);
          return;
        }
        setNotFound(false);
        setCurrentTurn({ ...snap.data(), id: snap.id } as Turn);
      },
      (error) => {
        console.error("WebTicketView turn listener:", error);
        setListenerError("turn", true);
      }
    );
    return unsubscribe;
  }, [turnId]);

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
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setListenerError("aheadCount", false);
        const ahead = snapshot.docs
          .map((d) => d.data() as Turn)
          .filter((t) => toDate(t.queuedAt).getTime() < toDate(currentTurn.queuedAt).getTime()).length;
        setAheadCount(ahead);
      },
      (error) => {
        console.error("WebTicketView ahead-count listener:", error);
        setListenerError("aheadCount", true);
      }
    );
    return unsubscribe;
  }, [currentTurn?.queueId, currentTurn?.status, currentTurn?.queuedAt]);

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
      const turn = await createTurn(selectedQueueId, confirmedMemberNumber, "mobile");
      navigate(`/mi-turno/${turn.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear turno");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelTurn = async () => {
    if (!currentTurn) return;
    setCancelling(true);
    setError("");
    try {
      await cancelTurn(currentTurn.id, currentTurn.memberNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar turno");
    } finally {
      setCancelling(false);
    }
  };

  const handleStartOver = () => navigate("/mi-turno", { replace: true });

  // ─── Tracking a specific ticket (from the URL, or just created) ───
  if (turnId) {
    if (notFound) {
      return (
        <div className="wt">
          <div className="wt-card">
            <TicketMark size={32} className="wt-icon" />
            <h1>No encontramos ese turno</h1>
            <p className="wt-subtitle">El enlace puede estar vencido, o el turno ya no existe.</p>
            <button className="wt-submit" onClick={handleStartOver}>Sacar un turno nuevo</button>
          </div>
          <style>{wtBaseStyles}</style>
        </div>
      );
    }

    if (!currentTurn) {
      return (
        <div className="wt">
          <div className="wt-card"><p className="wt-subtitle">Cargando tu turno...</p></div>
          <style>{wtBaseStyles}</style>
        </div>
      );
    }

    const queue = queues.find((q) => q.id === currentTurn.queueId);
    const isCalled = currentTurn.status === "called";
    const isEnded = ["finished", "cancelled", "no_show"].includes(currentTurn.status);

    return (
      <div className="wt">
        <div className={`wt-ticket ${isCalled ? "wt-ticket-called" : ""}`}>
          <div className="wt-ticket-top">
            <span className="wt-ticket-label">Tu turno</span>
            <div className="wt-ticket-number">{currentTurn.memberNumber}</div>
            <span className="wt-ticket-queue">{queue?.name || currentTurn.queueId}</span>
          </div>

          <div className="wt-ticket-divider">
            <div className="wt-notch wt-notch-left"></div>
            <div className="wt-dash"></div>
            <div className="wt-notch wt-notch-right"></div>
          </div>

          <div className="wt-ticket-bottom">
            <div className={`wt-status ${isCalled ? "wt-status-called" : ""}`}>
              {STATUS_LABELS[currentTurn.status] ?? currentTurn.status}
            </div>
            {currentTurn.status === "waiting" && aheadCount !== null && (
              <div className="wt-position">
                {aheadCount === 0 ? "Sos el próximo" : `${aheadCount} persona${aheadCount !== 1 ? "s" : ""} por delante tuyo`}
              </div>
            )}
            {isCalled && <div className="wt-called-hint">Dirigite al mostrador</div>}
            <div className="wt-time">
              {toDate(currentTurn.createdAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            {currentTurn.recallCount > 0 && (
              <div className="wt-recall">Rellamado {currentTurn.recallCount}x</div>
            )}
          </div>

          {hasConnectionError && (
            <p className="wt-connection-notice">No pudimos conectar para actualizar tu turno en vivo. Recargá la página si algo no coincide.</p>
          )}

          {!isEnded && (
            <p className="wt-save-hint">Guardá este enlace para volver a ver tu turno.</p>
          )}

          {error && <div className="wt-error">{error}</div>}

          {currentTurn.status === "waiting" && (
            <button className="wt-cancel" onClick={handleCancelTurn} disabled={cancelling}>
              {cancelling ? "Cancelando..." : "Cancelar turno"}
            </button>
          )}

          {isEnded && (
            <button className="wt-submit" onClick={handleStartOver}>Sacar otro turno</button>
          )}
        </div>

        <style>{wtBaseStyles}</style>
      </div>
    );
  }

  // ─── No ticket yet — take one ───
  if (status === "entering-number") {
    return (
      <div className="wt">
        <div className="wt-card">
          <div className="wt-header">
            <TicketMark size={36} className="wt-icon" />
            <h1>Sacar turno</h1>
            <p className="wt-subtitle">Ingresá tu número de socio</p>
          </div>

          <div className="wt-number-group">
            <input
              className="wt-number-input"
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
              <p className="wt-hint">Ingresá un número de 1 a 5 dígitos.</p>
            )}
          </div>

          {error && <div className="wt-error">{error}</div>}

          <button className="wt-submit" onClick={handleSubmitNumber} disabled={!isValidMemberNumber}>
            Continuar
          </button>
        </div>

        <style>{wtBaseStyles}</style>
      </div>
    );
  }

  return (
    <div className="wt">
      <div className="wt-card">
        <div className="wt-header">
          <TicketMark size={36} className="wt-icon" />
          <h1>Sacar turno</h1>
          <p className="wt-subtitle">Seleccioná la cola</p>
        </div>

        <div className="wt-member-confirm">
          <span>Socio N° {confirmedMemberNumber}</span>
          <button className="wt-change-link" onClick={handleBackToEnteringNumber}>cambiar</button>
        </div>

        {queues.length === 0 ? (
          <div className="wt-empty">No hay colas disponibles</div>
        ) : (
          <div className="wt-queue-options">
            {queues.map((queue) => (
              <button
                key={queue.id}
                className={`wt-queue-option ${selectedQueueId === queue.id ? "selected" : ""}`}
                onClick={() => setSelectedQueueId(queue.id)}
              >
                <span className="wt-queue-option-name">{queue.name}</span>
                {queue.type === "priority" && <span className="wt-queue-priority-tag">Prioritaria</span>}
              </button>
            ))}
          </div>
        )}

        {queues.find((q) => q.id === selectedQueueId)?.type === "priority" && (
          <p className="wt-priority-note">Para personas mayores, embarazadas o con discapacidad.</p>
        )}

        {error && <div className="wt-error">{error}</div>}

        <button className="wt-submit" onClick={handleTakeTurn} disabled={loading || !selectedQueueId}>
          {loading ? "Procesando..." : "Confirmar turno"}
        </button>
      </div>

      <style>{wtBaseStyles}</style>
    </div>
  );
}

const wtBaseStyles = `
  .wt {
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

  .wt-card {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    box-shadow: var(--shadow-md);
    text-align: center;
  }

  .wt-header { text-align: center; margin-bottom: 2rem; }

  .wt-icon { display: block; margin: 0 auto 0.75rem; color: var(--primary); }

  .wt-header h1, .wt-card > h1 {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.5rem;
  }

  .wt-subtitle { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.5rem; }

  .wt-number-group { margin-bottom: 1.5rem; text-align: left; }

  .wt-number-input {
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

  .wt-number-input:focus { outline: none; border-color: var(--primary); }

  .wt-hint { color: var(--text-muted); font-size: 0.8rem; margin: 0.5rem 0.25rem 0; }

  .wt-member-confirm {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    color: var(--text-muted);
    font-size: 0.9rem;
    font-weight: 600;
    margin: -1.25rem 0 1.5rem;
  }

  .wt-change-link {
    background: none;
    border: none;
    color: var(--primary);
    font-family: var(--font-body);
    font-size: 0.85rem;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .wt-change-link:hover { color: var(--primary-hover); }

  .wt-queue-options { display: flex; flex-direction: column; gap: 0.625rem; margin-bottom: 1.5rem; }

  .wt-queue-option {
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

  .wt-queue-option:hover { border-color: var(--primary); background: rgba(212,96,58,0.03); }

  .wt-queue-option.selected {
    border-color: var(--primary);
    background: var(--primary-light);
    color: var(--primary-hover);
  }

  .wt-queue-priority-tag {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-light);
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
  }

  .wt-priority-note {
    color: var(--text-muted);
    font-size: 0.85rem;
    margin: -0.75rem 0 1rem;
    padding: 0 0.25rem;
  }

  .wt-error {
    color: var(--danger);
    background: var(--danger-light);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1rem;
    text-align: left;
  }

  .wt-empty { text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.95rem; }

  .wt-submit {
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

  .wt-submit:hover:not(:disabled) {
    background: var(--primary-hover);
    transform: translateY(-1px);
    box-shadow: 0 4px 14px rgba(212,96,58,0.3);
  }

  .wt-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Ticket */
  .wt-ticket {
    position: relative;
    width: 100%;
    max-width: 400px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    animation: wt-ticket-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }

  @keyframes wt-ticket-in {
    from { opacity: 0; transform: scale(0.9) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  .wt-ticket-called {
    border-color: var(--primary);
    box-shadow: 0 0 0 3px rgba(212,96,58,0.15), var(--shadow-lg);
    animation: wt-ticket-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), wt-ticket-pulse 1.5s ease-in-out infinite;
  }

  @keyframes wt-ticket-pulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(212,96,58,0.15), var(--shadow-lg); }
    50% { box-shadow: 0 0 0 6px rgba(212,96,58,0.25), var(--shadow-lg); }
  }

  .wt-ticket-top {
    text-align: center;
    padding: 2.5rem 2rem 2rem;
    background: linear-gradient(135deg, rgba(212,96,58,0.05), rgba(233,168,76,0.05));
  }

  .wt-ticket-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .wt-ticket-number {
    font-family: var(--font-display);
    font-size: 7rem;
    font-weight: 900;
    line-height: 1;
    color: var(--primary);
    margin-bottom: 0.5rem;
  }

  .wt-ticket-queue { font-size: 1.1rem; font-weight: 500; color: var(--text-muted); }

  .wt-ticket-divider { position: relative; height: 1px; margin: 0; }

  .wt-notch {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    background: var(--bg);
    border-radius: 50%;
  }

  .wt-notch-left { left: -10px; }
  .wt-notch-right { right: -10px; }

  .wt-dash {
    position: absolute;
    top: 50%;
    left: 20px;
    right: 20px;
    border-top: 2px dashed var(--border);
  }

  .wt-ticket-bottom { text-align: center; padding: 1.5rem 2rem; }

  .wt-status { font-size: 1.1rem; font-weight: 600; color: var(--secondary); margin-bottom: 0.25rem; }

  .wt-status-called {
    color: var(--primary);
    font-size: 1.3rem;
    animation: wt-status-blink 1s ease-in-out infinite;
  }

  @keyframes wt-status-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .wt-position { font-size: 0.85rem; font-weight: 500; color: var(--secondary); margin-bottom: 0.25rem; }

  .wt-called-hint {
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
  }

  .wt-time { font-size: 0.85rem; color: var(--text-light); }

  .wt-recall {
    display: inline-block;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-light);
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
  }

  .wt-save-hint {
    font-size: 0.8rem;
    color: var(--text-light);
    text-align: center;
    margin: 0 1.5rem 1rem;
  }

  .wt-connection-notice {
    font-size: 0.8rem;
    color: var(--danger);
    text-align: center;
    margin: 0 1.5rem 1rem;
  }

  .wt-cancel {
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

  .wt-cancel:hover:not(:disabled) {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--danger-light);
  }

  .wt-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

  .wt-ticket .wt-submit, .wt-ticket .wt-error {
    width: calc(100% - 3rem);
    margin: 0 1.5rem 1.5rem;
  }
`;
