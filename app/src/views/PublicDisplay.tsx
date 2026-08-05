import { useState, useEffect, useRef } from "react";
import type { Turn, Terminal, Sector } from "shared";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { toDate } from "../lib/dates";

/** Short two-tone chime so a called number doesn't rely purely on the screen being watched. */
function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    [880, 1108.73].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.18);
      osc.stop(now + i * 0.18 + 0.4);
    });
  } catch {
    // Audio unavailable or blocked — display still works visually
  }
}

export function PublicDisplay() {
  const [calledTurns, setCalledTurns] = useState<Turn[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [sectorNames, setSectorNames] = useState<Record<string, string>>({});
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const q = query(
      collection(db, "turns"),
      where("status", "in", ["called", "attending"])
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCalledTurns(snapshot.docs.map((doc) => doc.data() as Turn));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "terminals"), (snapshot) => {
      setTerminals(snapshot.docs.map((d) => d.data() as Terminal));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "sectors"), (snapshot) => {
      const names: Record<string, string> = {};
      snapshot.docs.forEach((d) => {
        names[d.id] = (d.data() as Sector).name;
      });
      setSectorNames(names);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Every counter calls independently — a busy Pharmacy shouldn't bump a
  // still-current Perfumería call out of view. One card per open terminal,
  // each showing only its own latest called/attending turn.
  const activeTerminals = terminals
    .filter((t) => t.status !== "offline")
    .sort((a, b) => a.name.localeCompare(b.name));

  const latestTurnByTerminal: Record<string, Turn> = {};
  calledTurns.forEach((turn) => {
    if (!turn.terminalId) return;
    const current = latestTurnByTerminal[turn.terminalId];
    const turnTime = turn.calledAt ? toDate(turn.calledAt).getTime() : 0;
    const currentTime = current?.calledAt ? toDate(current.calledAt).getTime() : 0;
    if (!current || turnTime > currentTime) {
      latestTurnByTerminal[turn.terminalId] = turn;
    }
  });

  // Chime per terminal — each counter's own new call rings independently,
  // instead of one global ref racing across whichever counter called last.
  const prevTurnIdByTerminal = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    for (const terminal of activeTerminals) {
      const turn = latestTurnByTerminal[terminal.id];
      const prev = prevTurnIdByTerminal.current[terminal.id];
      if (turn?.id && prev !== undefined && turn.id !== prev) {
        playChime();
      }
      prevTurnIdByTerminal.current[terminal.id] = turn?.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calledTurns, terminals]);

  const sectorLabel = (terminal: Terminal) =>
    terminal.sectorIds.map((id) => sectorNames[id]).filter(Boolean).join(" / ");

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
        {activeTerminals.length === 0 ? (
          <div className="display-empty">Sin terminales activas</div>
        ) : (
          <div className="counter-grid">
            {activeTerminals.map((terminal) => {
              const turn = latestTurnByTerminal[terminal.id];
              const label = sectorLabel(terminal);
              return (
                <div key={terminal.id} className={`counter-card tear-edge ${turn ? "" : "counter-idle"}`}>
                  <div className="counter-header">
                    <span className="counter-name">{terminal.name}</span>
                    {label && <span className="counter-sector">{label}</span>}
                  </div>
                  {turn ? (
                    <div className="counter-number">{turn.memberNumber}</div>
                  ) : (
                    <div className="counter-number counter-number-empty">—</div>
                  )}
                  <span className="counter-status">
                    {turn ? "Ahora atendiendo" : "Esperando"}
                  </span>
                </div>
              );
            })}
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
          overflow: hidden;
        }

        .display-empty {
          margin: auto;
          color: rgba(250,247,242,0.3);
          font-size: 1.5rem;
        }

        .counter-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 2rem;
          align-content: center;
        }

        .counter-card {
          position: relative;
          text-align: center;
          padding: 2.5rem 1.5rem 2rem;
          background: rgba(250,247,242,0.04);
          border: 1px solid rgba(250,247,242,0.08);
          border-radius: 6px 6px 20px 20px;
          --tear-bg: #2D2926;
          --tear-dash: rgba(250,247,242,0.18);
          transition: border-color 0.3s ease, background 0.3s ease;
        }

        .counter-card:not(.counter-idle) {
          border-color: rgba(212,96,58,0.4);
          background: rgba(212,96,58,0.06);
        }

        .counter-header {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          margin-bottom: 1.25rem;
        }

        .counter-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: rgba(250,247,242,0.85);
        }

        .counter-sector {
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(250,247,242,0.35);
        }

        .counter-number {
          font-family: 'Fraunces', Georgia, serif;
          font-size: clamp(3rem, 7vw, 5.5rem);
          font-weight: 900;
          line-height: 1;
          color: #D4603A;
          animation: number-appear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
          margin-bottom: 0.75rem;
        }

        .counter-number-empty {
          color: rgba(250,247,242,0.12);
          animation: none;
        }

        @keyframes number-appear {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }

        .counter-status {
          font-size: 0.85rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(250,247,242,0.4);
        }

        .counter-idle .counter-status {
          color: rgba(250,247,242,0.2);
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

        @media (max-width: 700px) {
          .display-body { padding: 1.5rem; }
          .counter-grid { grid-template-columns: 1fr; gap: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
