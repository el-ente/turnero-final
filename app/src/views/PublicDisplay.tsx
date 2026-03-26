import { useState, useEffect } from "react";
import type { Turn } from "shared";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";

export function PublicDisplay() {
  const [calledTurns, setCalledTurns] = useState<Turn[]>([]);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    // Real-time listener for called turns
    const q = query(
      collection(db, "turns"),
      where("status", "==", "called"),
      orderBy("calledAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turns = snapshot.docs
        .map((doc) => doc.data() as Turn)
        .sort((a, b) => {
          // Sort by called time, most recent first
          const timeA = a.calledAt ? new Date(a.calledAt).getTime() : 0;
          const timeB = b.calledAt ? new Date(b.calledAt).getTime() : 0;
          return timeB - timeA;
        });
      setCalledTurns(turns);
    });

    return unsubscribe;
  }, []);

  // Clock update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTurn = calledTurns[0];
  const nextTurns = calledTurns.slice(1, 6);

  return (
    <div className="public-display">
      {/* Header */}
      <div className="header">
        <div className="logo">🎫 TURNERO</div>
        <div className="clock">{time.toLocaleTimeString("es-AR")}</div>
      </div>

      {/* Main display */}
      <div className="main-display">
        {currentTurn ? (
          <div className="current-turn-section">
            <div className="label">AHORA ATENDIENDO</div>
            <div className="current-number">{currentTurn.currentTurnNumber}</div>
            <div className="queue-info">
              Terminal {currentTurn.terminalId || "—"}
            </div>
          </div>
        ) : (
          <div className="current-turn-section empty">
            <div className="label">NO HAY TURNOS LLAMADOS</div>
          </div>
        )}

        {/* Next turns */}
        {nextTurns.length > 0 && (
          <div className="next-turns-section">
            <div className="next-label">PRÓXIMOS</div>
            <div className="next-turns-list">
              {nextTurns.map((turn, idx) => (
                <div key={turn.id} className="next-turn" style={{ animationDelay: `${idx * 0.1}s` }}>
                  <span className="next-number">{turn.currentTurnNumber}</span>
                  <span className="next-terminal">{turn.terminalId || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="footer">
        <div className="status-dot"></div>
        <span>Sistema en tiempo real</span>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&family=Outfit:wght@100;300;400;600;700&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .public-display {
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #0f1629 100%);
          color: #fff;
          display: flex;
          flex-direction: column;
          font-family: 'Outfit', sans-serif;
          overflow: hidden;
          position: relative;
        }

        /* Subtle grid background */
        .public-display::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image:
            linear-gradient(90deg, rgba(0, 255, 200, 0.03) 1px, transparent 1px),
            linear-gradient(rgba(0, 255, 200, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
          z-index: 1;
        }

        /* Header */
        .header {
          padding: 2rem 3rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid rgba(0, 255, 200, 0.2);
          z-index: 2;
          position: relative;
        }

        .logo {
          font-size: 1.8rem;
          font-weight: 700;
          letter-spacing: 2px;
          background: linear-gradient(90deg, #00ffc8, #ff006e);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .clock {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 2rem;
          font-weight: 600;
          color: #00ffc8;
          letter-spacing: 1px;
        }

        /* Main display */
        .main-display {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4rem;
          padding: 4rem 3rem;
          z-index: 2;
          position: relative;
        }

        /* Current turn */
        .current-turn-section {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1.5rem;
          padding: 3rem;
          border: 3px solid #ff006e;
          border-radius: 0;
          background: rgba(255, 0, 110, 0.05);
          position: relative;
          overflow: hidden;
          animation: pulse-border 3s ease-in-out infinite;
        }

        .current-turn-section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 50% 50%, rgba(255, 0, 110, 0.1), transparent);
          pointer-events: none;
        }

        @keyframes pulse-border {
          0%, 100% { border-color: #ff006e; }
          50% { border-color: #ff4d7f; }
        }

        .current-turn-section.empty {
          border-color: rgba(255, 0, 110, 0.3);
          animation: none;
        }

        .label {
          font-size: 1.2rem;
          font-weight: 600;
          letter-spacing: 3px;
          color: #00ffc8;
          text-transform: uppercase;
          position: relative;
          z-index: 1;
        }

        .current-number {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 15rem;
          font-weight: 700;
          line-height: 1;
          color: #ff006e;
          text-shadow:
            0 0 20px rgba(255, 0, 110, 0.5),
            0 0 40px rgba(255, 0, 110, 0.3);
          position: relative;
          z-index: 1;
          animation: number-entry 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes number-entry {
          from {
            opacity: 0;
            transform: scale(0.5) translateY(40px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .queue-info {
          font-size: 1.5rem;
          color: #00ffc8;
          letter-spacing: 1px;
          position: relative;
          z-index: 1;
        }

        /* Next turns */
        .next-turns-section {
          flex: 0.6;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          padding: 2rem;
          border-left: 3px solid #00ffc8;
          height: 100%;
        }

        .next-label {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: #00ffc8;
          text-transform: uppercase;
        }

        .next-turns-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          flex: 1;
        }

        .next-turn {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: rgba(0, 255, 200, 0.1);
          border-left: 4px solid #00ffc8;
          animation: slide-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
          opacity: 0;
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-30px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .next-number {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 3rem;
          font-weight: 700;
          color: #ff006e;
          min-width: 90px;
          text-align: center;
        }

        .next-terminal {
          font-size: 0.9rem;
          color: #aaa;
          font-weight: 400;
        }

        /* Footer */
        .footer {
          padding: 1.5rem 3rem;
          border-top: 2px solid rgba(0, 255, 200, 0.2);
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 0.9rem;
          color: #666;
          z-index: 2;
          position: relative;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          background: #00ffc8;
          border-radius: 50%;
          animation: blink 2s ease-in-out infinite;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* Responsive */
        @media (max-width: 1200px) {
          .current-number {
            font-size: 10rem;
          }
          .main-display {
            gap: 2rem;
            padding: 2rem;
          }
        }

        @media (max-width: 768px) {
          .main-display {
            flex-direction: column;
            gap: 2rem;
          }
          .next-turns-section {
            border-left: none;
            border-top: 3px solid #00ffc8;
            padding: 2rem 0 0 0;
            width: 100%;
          }
          .current-number {
            font-size: 8rem;
          }
          .clock {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}
