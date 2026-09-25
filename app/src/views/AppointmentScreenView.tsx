import { useState, useEffect, useRef } from "react";
import type { AppointmentCall } from "shared";
import { db } from "../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { toDate } from "../lib/dates";

/** Same short two-tone chime as PublicDisplay, kept local — this module never reads Turn/Terminal data. */
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
    // Audio unavailable or blocked — screen still works visually
  }
}

// Independent of PublicDisplay: reads appointmentCalls (a PII-free mirror of
// Appointment, see docs/turnos-agendados-spec-2026-09-25.md section 5), not
// turns/terminals. A branch that doesn't deploy this screen loses nothing —
// staff can still call appointments out loud from "Agenda del día".
export function AppointmentScreenView() {
  const [calls, setCalls] = useState<AppointmentCall[]>([]);
  const [time, setTime] = useState(new Date());
  const [hasConnectionError, setHasConnectionError] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "appointmentCalls"),
      (snapshot) => {
        setHasConnectionError(false);
        setCalls(snapshot.docs.map((d) => d.data() as AppointmentCall));
      },
      (error) => {
        console.error("AppointmentScreenView calls listener:", error);
        setHasConnectionError(true);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sorted = [...calls].sort((a, b) => toDate(b.calledAt).getTime() - toDate(a.calledAt).getTime());

  // Chime + flash per appointment when its signature (calledAt + recallCount)
  // changes — same rationale as PublicDisplay: a recall doesn't otherwise
  // change anything visible on the card.
  const [flashing, setFlashing] = useState<Record<string, boolean>>({});
  const flashTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const prevSignature = useRef<Record<string, string>>({});

  useEffect(() => () => {
    Object.values(flashTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    for (const call of calls) {
      const signature = `${toDate(call.calledAt).getTime()}:${call.recallCount}`;
      const prev = prevSignature.current[call.appointmentId];
      if (prev !== undefined && prev !== signature) {
        playChime();
        // Reacting to a change already pushed in by the onSnapshot listener
        // above, same pattern as PublicDisplay's recall flash.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFlashing((current) => ({ ...current, [call.appointmentId]: true }));
        if (flashTimeoutsRef.current[call.appointmentId]) clearTimeout(flashTimeoutsRef.current[call.appointmentId]);
        flashTimeoutsRef.current[call.appointmentId] = setTimeout(() => {
          setFlashing((current) => {
            const next = { ...current };
            delete next[call.appointmentId];
            return next;
          });
        }, 3000);
      }
      prevSignature.current[call.appointmentId] = signature;
    }
  }, [calls]);

  return (
    <div className="ags">
      <div className="ags-header">
        <div className="ags-brand">
          <span className="ags-brand-dot"></span>
          <span className="ags-brand-name">Agenda</span>
        </div>
        <div className="ags-clock">
          {time.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      </div>

      <div className="ags-body">
        {sorted.length === 0 ? (
          <div className="ags-empty">Sin citas llamadas en este momento</div>
        ) : (
          <div className="ags-grid">
            {sorted.map((call) => (
              <div key={call.appointmentId} className={`ags-card ${flashing[call.appointmentId] ? "ags-flashing" : ""}`}>
                <span className="ags-service">{call.serviceName}</span>
                <div className="ags-time">{call.startTime}</div>
                {call.recallCount > 0 && <span className="ags-recall-badge">Rellamado {call.recallCount}x</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ags-footer">
        <span className={`ags-footer-dot ${hasConnectionError ? "ags-footer-dot-error" : ""}`}></span>
        <span>{hasConnectionError ? "Conexión inestable — datos pueden estar desactualizados" : "En tiempo real"}</span>
      </div>

      <style>{agsStyles}</style>
    </div>
  );
}

const agsStyles = `
  .ags {
    width: 100vw;
    height: 100vh;
    background: #2D2926;
    color: #FAF7F2;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', system-ui, sans-serif;
    overflow: hidden;
  }

  .ags-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 3rem;
    border-bottom: 1px solid rgba(250,247,242,0.08);
  }

  .ags-brand { display: flex; align-items: center; gap: 0.75rem; }
  .ags-brand-dot { width: 10px; height: 10px; background: #D4603A; border-radius: 50%; }
  .ags-brand-name {
    font-family: 'Fraunces', Georgia, serif;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: rgba(250,247,242,0.9);
  }

  .ags-clock {
    font-size: 1.5rem;
    font-weight: 600;
    color: rgba(250,247,242,0.5);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.05em;
  }

  .ags-body { flex: 1; display: flex; padding: 3rem; overflow-y: auto; }
  .ags-empty { margin: auto; color: rgba(250,247,242,0.3); font-size: 1.5rem; }

  .ags-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 2rem;
    align-content: center;
  }

  .ags-card {
    position: relative;
    text-align: center;
    padding: 2.5rem 1.5rem 2rem;
    background: rgba(212,96,58,0.06);
    border: 1px solid rgba(212,96,58,0.4);
    border-radius: 6px 6px 20px 20px;
    transition: border-color 0.3s ease, background 0.3s ease;
  }

  .ags-service {
    display: block;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(250,247,242,0.6);
    margin-bottom: 0.75rem;
  }

  .ags-time {
    font-family: 'Fraunces', Georgia, serif;
    font-size: clamp(2.5rem, 6vw, 4.5rem);
    font-weight: 900;
    line-height: 1;
    color: #D4603A;
    animation: ags-appear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes ags-appear {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }

  .ags-recall-badge {
    display: table;
    margin: 0.75rem auto 0;
    font-size: 0.7rem;
    font-weight: 700;
    color: #E9A84C;
    background: rgba(233,168,76,0.15);
    padding: 0.2rem 0.65rem;
    border-radius: 999px;
  }

  .ags-flashing { animation: ags-recall-pulse 0.6s ease-in-out 5; }

  @keyframes ags-recall-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(233,168,76,0); border-color: rgba(212,96,58,0.4); }
    50% { box-shadow: 0 0 0 10px rgba(233,168,76,0.3); border-color: #E9A84C; }
  }

  .ags-footer {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1.25rem 3rem;
    border-top: 1px solid rgba(250,247,242,0.08);
    font-size: 0.85rem;
    color: rgba(250,247,242,0.25);
    font-weight: 500;
  }

  .ags-footer-dot { width: 8px; height: 8px; background: #5B8A5E; border-radius: 50%; animation: ags-pulse-dot 2.5s ease-in-out infinite; }
  @keyframes ags-pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .ags-footer-dot-error { background: #D64545; animation: ags-pulse-dot-error 1s ease-in-out infinite; }
  @keyframes ags-pulse-dot-error { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  @media (max-width: 700px) {
    .ags-header { padding: 1rem 1.25rem; }
    .ags-brand-name { font-size: 1.05rem; }
    .ags-clock { font-size: 1.1rem; letter-spacing: 0.02em; }
    .ags-body { padding: 1.5rem; }
    .ags-grid { grid-template-columns: 1fr; gap: 1.25rem; }
  }

  @media (prefers-reduced-motion: reduce) {
    .ags-footer-dot, .ags-footer-dot-error { animation: none; }
  }
`;
