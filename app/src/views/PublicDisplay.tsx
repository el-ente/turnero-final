import { useState, useEffect } from "react";
import type { Turn } from "shared";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { toDate } from "../lib/dates";

export function PublicDisplay() {
  const [calledTurns, setCalledTurns] = useState<Turn[]>([]);
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const q = query(
      collection(db, "turns"),
      where("status", "in", ["called", "attending"]),
      orderBy("calledAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turns = snapshot.docs
        .map((doc) => doc.data() as Turn)
        .sort((a, b) => {
          const timeA = a.calledAt ? toDate(a.calledAt).getTime() : 0;
          const timeB = b.calledAt ? toDate(b.calledAt).getTime() : 0;
          return timeB - timeA;
        });
      setCalledTurns(turns);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTurn = calledTurns[0];
  const nextTurns = calledTurns.slice(1, 6);

  return (
    <div className="display">
      <div className="display-header">
        <div className="display-brand">
          <span className="brand-dot"></span>
          <span className="brand-name">Turnero Digital</span>
        </div>
        <div className="display-clock">
          {time.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      </div>

      <div className="display-body">
        <div className="display-main">
          {currentTurn ? (
            <div className="now-serving">
              <span className="now-label">Ahora atendiendo</span>
              <div className="now-number">{currentTurn.currentTurnNumber}</div>
              <div className="now-terminal">
                <span className="terminal-icon">◉</span>
                {currentTurn.terminalId || "—"}
              </div>
            </div>
          ) : (
            <div className="now-serving now-empty">
              <span className="now-label">Sin turnos llamados</span>
              <div className="now-number empty-dash">—</div>
            </div>
          )}
        </div>

        {nextTurns.length > 0 && (
          <div className="display-sidebar">
            <div className="sidebar-label">Proximos</div>
            <div className="sidebar-list">
              {nextTurns.map((turn, idx) => (
                <div key={turn.id} className="sidebar-item" style={{ animationDelay: `${idx * 0.08}s` }}>
                  <span className="sidebar-number">{turn.currentTurnNumber}</span>
                  <span className="sidebar-terminal">{turn.terminalId || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="display-footer">
        <span className="footer-dot"></span>
        <span>En tiempo real</span>
      </div>

      <style>{`
        .display {
          width: 100vw;
          height: 100vh;
          background: #2D2926;
          color: #FAF7F2;
          display: flex;
          flex-direction: column;
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
        }

        .display-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem 3rem;
          border-bottom: 1px solid rgba(250,247,242,0.08);
        }

        .display-brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .brand-dot {
          width: 10px;
          height: 10px;
          background: #D4603A;
          border-radius: 50%;
        }

        .brand-name {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 1.4rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: rgba(250,247,242,0.9);
        }

        .display-clock {
          font-size: 1.5rem;
          font-weight: 600;
          color: rgba(250,247,242,0.5);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.05em;
        }

        .display-body {
          flex: 1;
          display: flex;
          padding: 3rem;
          gap: 3rem;
          overflow: hidden;
        }

        .display-main {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .now-serving {
          text-align: center;
          padding: 3rem;
          background: rgba(250,247,242,0.04);
          border: 1px solid rgba(250,247,242,0.08);
          border-radius: 24px;
          min-width: 400px;
        }

        .now-label {
          display: block;
          font-size: 1rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: rgba(250,247,242,0.4);
          margin-bottom: 1rem;
        }

        .now-number {
          font-family: 'Fraunces', Georgia, serif;
          font-size: clamp(8rem, 18vw, 16rem);
          font-weight: 900;
          line-height: 1;
          color: #D4603A;
          animation: number-appear 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .empty-dash {
          color: rgba(250,247,242,0.1);
          animation: none;
        }

        @keyframes number-appear {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
        }

        .now-terminal {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1.5rem;
          font-size: 1.1rem;
          font-weight: 500;
          color: rgba(250,247,242,0.5);
          background: rgba(250,247,242,0.06);
          padding: 0.5rem 1.25rem;
          border-radius: 999px;
        }

        .terminal-icon {
          color: #5B8A5E;
          font-size: 0.7rem;
        }

        .now-empty {
          border-color: rgba(250,247,242,0.05);
        }

        .display-sidebar {
          width: 300px;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          border-left: 1px solid rgba(250,247,242,0.08);
          padding-left: 3rem;
        }

        .sidebar-label {
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          color: rgba(250,247,242,0.3);
        }

        .sidebar-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
          justify-content: center;
        }

        .sidebar-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          background: rgba(250,247,242,0.04);
          border: 1px solid rgba(250,247,242,0.06);
          border-radius: 12px;
          animation: slide-in 0.4s ease-out forwards;
          opacity: 0;
        }

        @keyframes slide-in {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .sidebar-number {
          font-family: 'Fraunces', Georgia, serif;
          font-size: 2rem;
          font-weight: 700;
          color: #E9A84C;
        }

        .sidebar-terminal {
          font-size: 0.85rem;
          color: rgba(250,247,242,0.35);
          font-weight: 500;
        }

        .display-footer {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1.25rem 3rem;
          border-top: 1px solid rgba(250,247,242,0.08);
          font-size: 0.85rem;
          color: rgba(250,247,242,0.25);
          font-weight: 500;
        }

        .footer-dot {
          width: 8px;
          height: 8px;
          background: #5B8A5E;
          border-radius: 50%;
          animation: pulse-dot 2.5s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        @media (max-width: 900px) {
          .display-body {
            flex-direction: column;
            padding: 2rem;
            gap: 2rem;
          }
          .display-sidebar {
            width: 100%;
            border-left: none;
            border-top: 1px solid rgba(250,247,242,0.08);
            padding-left: 0;
            padding-top: 2rem;
          }
          .sidebar-list {
            flex-direction: row;
            flex-wrap: wrap;
            gap: 0.5rem;
          }
          .sidebar-item {
            flex: 1;
            min-width: 120px;
          }
        }
      `}</style>
    </div>
  );
}
