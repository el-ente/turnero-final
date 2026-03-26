import { useState, useEffect } from "react";
import type { Turn } from "shared";
import { createTurn, getCurrentTurn } from "../lib/api";
import { db } from "../lib/firebase";
import { collection, getDocs, query } from "firebase/firestore";

export function TotemView() {
  const [queues, setQueues] = useState<any[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [memberId, setMemberId] = useState<string>(`member-${Math.random().toString(36).substr(2, 9)}`);
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<"selecting" | "taking" | "viewing">("selecting");

  useEffect(() => {
    // Load queues from Firestore
    const loadQueues = async () => {
      try {
        const q = query(collection(db, "queues"));
        const snapshot = await getDocs(q);
        const queueList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setQueues(queueList);
        if (queueList.length > 0) {
          setSelectedQueueId(queueList[0].id);
        }
      } catch (err) {
        setError("Error loading queues");
      }
    };

    loadQueues();
  }, []);

  const handleTakeTurn = async () => {
    if (!selectedQueueId) {
      setError("Please select a queue");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await createTurn(selectedQueueId, memberId, "totem");
      // Get current turn
      const turn = await getCurrentTurn(memberId) as Turn;
      setCurrentTurn(turn);
      setStatus("viewing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating turn");
    } finally {
      setLoading(false);
    }
  };

  const handleNewTurn = () => {
    setCurrentTurn(null);
    setStatus("selecting");
    setMemberId(`member-${Math.random().toString(36).substr(2, 9)}`);
    setError("");
  };

  if (status === "selecting") {
    return (
      <div className="totem-container">
        <h1>Sistema de Turnos</h1>
        <div className="totem-section">
          <h2>Selecciona tu cola</h2>
          {queues.length === 0 ? (
            <p>No hay colas disponibles</p>
          ) : (
            <div className="queue-selector">
              {queues.map((queue) => (
                <button
                  key={queue.id}
                  className={`queue-button ${selectedQueueId === queue.id ? "selected" : ""}`}
                  onClick={() => setSelectedQueueId(queue.id)}
                >
                  {queue.name}
                  {queue.type === "priority" && " ⭐"}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        <button
          className="primary-button"
          onClick={handleTakeTurn}
          disabled={loading || !selectedQueueId}
        >
          {loading ? "Sacando turno..." : "Sacar Turno"}
        </button>

        <div className="info-text">
          <p>Tu ID: {memberId}</p>
        </div>
      </div>
    );
  }

  if (status === "viewing" && currentTurn) {
    const queue = queues.find((q) => q.id === currentTurn.queueId);
    return (
      <div className="totem-container">
        <h1>Tu Turno</h1>
        <div className="turn-display">
          <div className="turn-number">{currentTurn.currentTurnNumber}</div>
          <div className="turn-queue">{queue?.name || currentTurn.queueId}</div>
          <div className="turn-status">
            {currentTurn.status === "waiting" && "Esperando..."}
            {currentTurn.status === "called" && "¡Te llaman!"}
            {currentTurn.status === "attending" && "En atención"}
            {currentTurn.status === "finished" && "Finalizado"}
            {currentTurn.status === "cancelled" && "Cancelado"}
          </div>
        </div>

        <div className="turn-info">
          <p>Hora: {new Date(currentTurn.createdAt.toString()).toLocaleTimeString()}</p>
          {currentTurn.recallCount > 0 && <p>Reintentos: {currentTurn.recallCount}</p>}
        </div>

        <button className="primary-button" onClick={handleNewTurn}>
          Sacar Otro Turno
        </button>
      </div>
    );
  }

  return null;
}

const styles = `
.totem-container {
  padding: 2rem;
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}

.totem-section {
  margin: 2rem 0;
}

.queue-selector {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 1rem 0;
}

.queue-button {
  padding: 1rem;
  font-size: 1rem;
  border: 2px solid #ccc;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.queue-button:hover {
  border-color: #0066cc;
  background: #f0f8ff;
}

.queue-button.selected {
  border-color: #0066cc;
  background: #0066cc;
  color: white;
}

.primary-button {
  padding: 1rem 2rem;
  font-size: 1.1rem;
  background: #0066cc;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.primary-button:hover:not(:disabled) {
  background: #0052a3;
}

.primary-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  color: #d32f2f;
  padding: 1rem;
  background: #ffebee;
  border-radius: 4px;
  margin: 1rem 0;
}

.turn-display {
  background: #f5f5f5;
  padding: 2rem;
  border-radius: 8px;
  margin: 2rem 0;
}

.turn-number {
  font-size: 4rem;
  font-weight: bold;
  color: #0066cc;
  margin: 1rem 0;
}

.turn-queue {
  font-size: 1.5rem;
  color: #333;
  margin: 1rem 0;
}

.turn-status {
  font-size: 1.2rem;
  color: #666;
  margin-top: 1rem;
}

.turn-info {
  font-size: 0.9rem;
  color: #666;
  margin: 1rem 0;
}

.info-text {
  font-size: 0.8rem;
  color: #999;
  margin-top: 2rem;
}
`;

export const totemStyles = styles;
