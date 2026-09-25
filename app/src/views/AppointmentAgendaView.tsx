import { useState, useEffect } from "react";
import type { Appointment, AppointmentService } from "shared";
import { db } from "../lib/firebase";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import {
  callAppointment, recallAppointment, startAppointment, finishAppointment, noShowAppointment,
} from "../lib/api";

const STATUS_LABELS: Record<string, string> = {
  reservada: "Reservada",
  llamada: "Llamada",
  atendiendo: "En atención",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
  no_show: "No se presentó",
};

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return formatDate(date);
}

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long",
  });
}

// Staff-facing "Agenda del día" — deliberately separate from TerminalView.
// There is no dispatch engine here (no FIFO/ratio, no currentTurnId): the
// order is already fixed by startTime, so this is a list the staff works
// down, not a queue to arbitrate. See docs/turnos-agendados-spec-2026-09-25.md
// section 4 for why this isn't a tab inside Terminal.
export function AppointmentAgendaView() {
  const [date, setDate] = useState(() => formatDate(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Record<string, AppointmentService>>({});
  const [serviceFilter, setServiceFilter] = useState<string>("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmingNoShow, setConfirmingNoShow] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hasConnectionError, setHasConnectionError] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "appointmentServices"));
      const byId: Record<string, AppointmentService> = {};
      snap.docs.forEach((d) => { byId[d.id] = { id: d.id, ...d.data() } as AppointmentService; });
      setServices(byId);
    })();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "appointments"), where("date", "==", date));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setHasConnectionError(false);
        setAppointments(snapshot.docs.map((d) => d.data() as Appointment));
      },
      (error) => {
        console.error("AppointmentAgendaView listener:", error);
        setHasConnectionError(true);
      }
    );
    return unsubscribe;
  }, [date]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const visible = appointments
    .filter((a) => !serviceFilter || a.serviceId === serviceFilter)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const counts = {
    total: visible.length,
    pendientes: visible.filter((a) => a.status === "reservada" || a.status === "llamada").length,
    atendidos: visible.filter((a) => a.status === "finalizada").length,
    noShow: visible.filter((a) => a.status === "no_show").length,
  };

  const runAction = async (id: string, action: () => Promise<unknown>, successText: string) => {
    setLoadingAction(id);
    try {
      await action();
      showMessage("success", successText);
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Error");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleConfirmNoShow = async (id: string) => {
    setConfirmingNoShow((current) => ({ ...current, [id]: false }));
    await runAction(id, () => noShowAppointment(id), "Marcada como no presentado");
  };

  return (
    <div className="aga">
      <div className="aga-toolbar">
        <div className="aga-date-nav">
          <button className="aga-nav-btn" onClick={() => setDate((d) => addDays(d, -1))}>◀</button>
          <div className="aga-date-label">{formatDateLabel(date)}</div>
          <button className="aga-nav-btn" onClick={() => setDate((d) => addDays(d, 1))}>▶</button>
          <button className="aga-today-btn" onClick={() => setDate(formatDate(new Date()))}>Hoy</button>
        </div>

        <select className="aga-service-select" value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}>
          <option value="">Todos los servicios</option>
          {Object.values(services).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="aga-counts">
        <span className="aga-count-stamp">Total: {counts.total}</span>
        <span className="aga-count-stamp">Pendientes: {counts.pendientes}</span>
        <span className="aga-count-stamp">Atendidos: {counts.atendidos}</span>
        <span className="aga-count-stamp">No-show: {counts.noShow}</span>
      </div>

      {hasConnectionError && (
        <div className="aga-connection-warning">Conexión perdida — los datos pueden estar desactualizados</div>
      )}

      <div className="aga-list">
        <div className="aga-row aga-row-header">
          <span>Hora</span>
          <span>Nombre</span>
          <span>Socio</span>
          <span>Servicio</span>
          <span>Estado</span>
          <span>Acciones</span>
        </div>

        {visible.length === 0 ? (
          <div className="aga-empty">No hay citas para este día</div>
        ) : (
          visible.map((appt) => {
            const isLoading = loadingAction === appt.id;
            return (
              <div key={appt.id} className="aga-row">
                <span className="aga-time">{appt.startTime}</span>
                <span>{appt.contactName}</span>
                <span>{appt.memberNumber}</span>
                <span>{services[appt.serviceId]?.name ?? appt.serviceId}</span>
                <span className={`aga-status-pill aga-status-${appt.status}`}>
                  {STATUS_LABELS[appt.status] ?? appt.status}
                  {appt.recallCount > 0 && appt.status === "llamada" && ` (x${appt.recallCount + 1})`}
                </span>
                <span className="aga-actions">
                  {appt.status === "reservada" && (
                    <button
                      className="aga-btn aga-btn-primary"
                      disabled={isLoading}
                      onClick={() => runAction(appt.id, () => callAppointment(appt.id), `Llamando a ${appt.contactName}`)}
                    >
                      Llamar
                    </button>
                  )}
                  {appt.status === "llamada" && (
                    <>
                      <button
                        className="aga-btn aga-btn-outline"
                        disabled={isLoading}
                        onClick={() => runAction(appt.id, () => recallAppointment(appt.id), "Re-llamado")}
                      >
                        Re-llamar
                      </button>
                      <button
                        className="aga-btn aga-btn-default"
                        disabled={isLoading}
                        onClick={() => runAction(appt.id, () => startAppointment(appt.id), "Atención iniciada")}
                      >
                        Atender
                      </button>
                      {confirmingNoShow[appt.id] ? (
                        <span className="aga-noshow-confirm">
                          ¿Seguro?
                          <button className="aga-btn aga-btn-danger" disabled={isLoading} onClick={() => handleConfirmNoShow(appt.id)}>Sí</button>
                          <button
                            className="aga-btn aga-btn-outline"
                            disabled={isLoading}
                            onClick={() => setConfirmingNoShow((c) => ({ ...c, [appt.id]: false }))}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          className="aga-btn aga-btn-danger"
                          disabled={isLoading}
                          onClick={() => setConfirmingNoShow((c) => ({ ...c, [appt.id]: true }))}
                        >
                          No presentado
                        </button>
                      )}
                    </>
                  )}
                  {appt.status === "atendiendo" && (
                    <button
                      className="aga-btn aga-btn-success"
                      disabled={isLoading}
                      onClick={() => runAction(appt.id, () => finishAppointment(appt.id), "Cita finalizada")}
                    >
                      Finalizar
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}
      </div>

      {message && <div className={`aga-toast aga-toast-${message.type}`}>{message.text}</div>}

      <style>{agaStyles}</style>
    </div>
  );
}

const agaStyles = `
  .aga { padding: 1.5rem; max-width: 1100px; margin: 0 auto; }

  .aga-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .aga-date-nav { display: flex; align-items: center; gap: 0.6rem; }
  .aga-nav-btn, .aga-today-btn {
    padding: 0.4rem 0.7rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--text);
  }
  .aga-nav-btn:hover, .aga-today-btn:hover { border-color: var(--primary); color: var(--primary); }

  .aga-date-label {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text);
    text-transform: capitalize;
    min-width: 220px;
    text-align: center;
  }

  .aga-service-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 0.9rem;
  }

  .aga-counts { display: flex; gap: 0.6rem; margin-bottom: 1rem; flex-wrap: wrap; }
  .aga-count-stamp {
    padding: 0.3rem 0.75rem;
    background: var(--surface-warm);
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .aga-connection-warning {
    padding: 0.6rem 0.75rem;
    background: var(--danger-light);
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: 0.85rem;
    font-weight: 600;
    margin-bottom: 1rem;
  }

  .aga-list {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .aga-row {
    display: grid;
    grid-template-columns: 70px 1.2fr 90px 1.2fr 140px 1.8fr;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
    font-size: 0.9rem;
  }
  .aga-row:last-child { border-bottom: none; }

  .aga-row-header {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    background: var(--surface-warm);
  }

  .aga-time { font-family: var(--font-display); font-weight: 700; color: var(--primary); }

  .aga-empty { text-align: center; padding: 2.5rem; color: var(--text-light); font-size: 0.95rem; }

  .aga-status-pill {
    display: inline-block;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    width: fit-content;
  }
  .aga-status-reservada { background: var(--accent-light); color: var(--accent); }
  .aga-status-llamada { background: var(--primary-light); color: var(--primary); }
  .aga-status-atendiendo { background: var(--secondary-light); color: var(--secondary); }
  .aga-status-finalizada { background: var(--surface-warm); color: var(--text-muted); }
  .aga-status-cancelada, .aga-status-no_show { background: var(--danger-light); color: var(--danger); }

  .aga-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }

  .aga-btn {
    padding: 0.4rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--surface);
    color: var(--text);
    transition: all 0.15s ease;
  }
  .aga-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .aga-btn-primary { background: var(--primary); border-color: var(--primary); color: white; }
  .aga-btn-primary:hover:not(:disabled) { background: var(--primary-hover); }

  .aga-btn-success { background: var(--secondary); border-color: var(--secondary); color: white; }

  .aga-btn-outline { background: transparent; color: var(--text-muted); }
  .aga-btn-outline:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

  .aga-btn-danger { background: transparent; color: var(--danger); }
  .aga-btn-danger:hover:not(:disabled) { background: var(--danger-light); border-color: var(--danger); }

  .aga-noshow-confirm {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--danger);
  }

  .aga-toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 0.9rem;
    z-index: 100;
    box-shadow: var(--shadow-lg);
  }
  .aga-toast-success { background: var(--secondary); color: white; }
  .aga-toast-error { background: var(--danger); color: white; }

  @media (max-width: 800px) {
    .aga-row { grid-template-columns: 60px 1fr 1fr; }
    .aga-row span:nth-child(3), .aga-row span:nth-child(4) { display: none; }
  }
`;
