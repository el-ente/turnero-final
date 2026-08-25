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

  // Tracks which listeners are currently erroring so the footer indicator
  // can flip to "connection lost" — this board runs unattended, so a dead
  // listener with no visible sign could go a full business day unnoticed.
  const [listenerErrors, setListenerErrors] = useState<Record<string, boolean>>({});
  const setListenerError = (key: string, hasError: boolean) =>
    setListenerErrors((current) => ({ ...current, [key]: hasError }));

  useEffect(() => {
    const q = query(
      collection(db, "turns"),
      where("status", "in", ["called", "attending"])
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setListenerError("turns", false);
        setCalledTurns(snapshot.docs.map((doc) => doc.data() as Turn));
      },
      (error) => {
        console.error("PublicDisplay turns listener:", error);
        setListenerError("turns", true);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "terminals"),
      (snapshot) => {
        setListenerError("terminals", false);
        setTerminals(snapshot.docs.map((d) => d.data() as Terminal));
      },
      (error) => {
        console.error("PublicDisplay terminals listener:", error);
        setListenerError("terminals", true);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "sectors"),
      (snapshot) => {
        setListenerError("sectors", false);
        const names: Record<string, string> = {};
        snapshot.docs.forEach((d) => {
          names[d.id] = (d.data() as Sector).name;
        });
        setSectorNames(names);
      },
      (error) => {
        console.error("PublicDisplay sectors listener:", error);
        setListenerError("sectors", true);
      }
    );
    return unsubscribe;
  }, []);

  const hasConnectionError = Object.values(listenerErrors).some(Boolean);

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
  // Signature combines turn id + lastRecallAt so a re-llamar on the SAME
  // turn (id unchanged) still rings again, not just a brand-new call.
  //
  // The chime alone doesn't say WHICH card — with several counters open at
  // once, that's ambiguous, and a recall has no other visible tell (same
  // card, same number, nothing changes) unlike a new call (idle → number,
  // or number changing). So a recall also flashes its own card for a few
  // seconds, tracked per terminal since two counters can recall close
  // together and shouldn't cancel each other's flash.
  const [flashingTerminals, setFlashingTerminals] = useState<Record<string, boolean>>({});
  const flashTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => () => {
    Object.values(flashTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  const prevSignatureByTerminal = useRef<Record<string, string | undefined>>({});
  useEffect(() => {
    for (const terminal of activeTerminals) {
      const turn = latestTurnByTerminal[terminal.id];
      const signature = turn ? `${turn.id}:${turn.lastRecallAt ? toDate(turn.lastRecallAt).getTime() : 0}` : undefined;
      const prev = prevSignatureByTerminal.current[terminal.id];
      if (signature && prev !== undefined && signature !== prev) {
        playChime();

        const isRecall = turn && prev.startsWith(`${turn.id}:`);
        if (isRecall) {
          setFlashingTerminals((current) => ({ ...current, [terminal.id]: true }));
          if (flashTimeoutsRef.current[terminal.id]) clearTimeout(flashTimeoutsRef.current[terminal.id]);
          flashTimeoutsRef.current[terminal.id] = setTimeout(() => {
            setFlashingTerminals((current) => {
              const next = { ...current };
              delete next[terminal.id];
              return next;
            });
          }, 3000);
        }
      }
      prevSignatureByTerminal.current[terminal.id] = signature;
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
              const isFlashing = flashingTerminals[terminal.id];
              return (
                <div
                  key={terminal.id}
                  className={`counter-card tear-edge ${turn ? "" : "counter-idle"} ${isFlashing ? "counter-recalling" : ""}`}
                >
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
                  {turn && turn.recallCount > 0 && (
                    <span className="counter-recall-badge">Rellamado {turn.recallCount}x</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="display-footer">
        <span className={`footer-dot ${hasConnectionError ? "footer-dot-error" : ""}`}></span>
        <span>{hasConnectionError ? "Conexión inestable — datos pueden estar desactualizados" : "En tiempo real"}</span>
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
          overflow-y: auto;
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

        .counter-recall-badge {
          display: table;
          margin: 0.6rem auto 0;
          font-size: 0.7rem;
          font-weight: 700;
          color: #E9A84C;
          background: rgba(233,168,76,0.15);
          padding: 0.2rem 0.65rem;
          border-radius: 999px;
        }

        .counter-recalling {
          animation: recall-pulse 0.6s ease-in-out 5;
        }

        @keyframes recall-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(233,168,76,0); border-color: rgba(212,96,58,0.4); }
          50% { box-shadow: 0 0 0 10px rgba(233,168,76,0.3); border-color: #E9A84C; }
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

        .footer-dot-error {
          background: #D64545;
          animation: pulse-dot-error 1s ease-in-out infinite;
        }

        @keyframes pulse-dot-error {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }

        @media (max-width: 700px) {
          .display-header { padding: 1rem 1.25rem; }
          .brand-name { font-size: 1.05rem; }
          .display-clock { font-size: 1.1rem; letter-spacing: 0.02em; }
          .display-body { padding: 1.5rem; }
          .counter-grid { grid-template-columns: 1fr; gap: 1.25rem; }
        }
      `}</style>
    </div>
  );
}
