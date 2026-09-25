import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import type { Appointment, AppointmentService } from "shared";
import {
  getAvailableSlots, createAppointment, getAppointment, cancelAppointment, rescheduleAppointment,
  type AppointmentSlot,
} from "../lib/api";
import { db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { TicketMark } from "../components/TicketMark";

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

function addDaysLocal(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
}

// Requests a generous window and lets the backend clamp it to the service's
// own bookingHorizonDays — the frontend doesn't need to know that value.
const REQUEST_WINDOW_DAYS = 30;

// Unlike Turn (publicly readable, tracked live via onSnapshot), appointments
// hold PII and are not publicly readable — every read here goes through a
// Cloud Function, and there's no live listener: use "Actualizar" to refresh.
export function AppointmentBookingView() {
  const { appointmentId } = useParams<{ appointmentId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  if (appointmentId) {
    return <ManageAppointment appointmentId={appointmentId} initialMemberNumber={searchParams.get("memberNumber")} />;
  }
  return <BookAppointment onBooked={(appt, memberNumber) => navigate(`/agenda/${appt.id}?memberNumber=${memberNumber}`, { replace: true })} />;
}

function BookAppointment({ onBooked }: { onBooked: (appt: Appointment, memberNumber: number) => void }) {
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [contactName, setContactName] = useState("");
  const [memberNumberInput, setMemberNumberInput] = useState("");
  const [contact, setContact] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, "appointmentServices"));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as AppointmentService)
          .filter((s) => s.active !== false);
        setServices(list);
        if (list.length > 0) setServiceId(list[0].id);
      } catch {
        setError("Error cargando servicios disponibles");
      }
    })();
  }, []);

  const loadSlots = useCallback(async (svcId: string) => {
    if (!svcId) return;
    setLoadingSlots(true);
    setError("");
    try {
      const dateFrom = formatDate(new Date());
      const dateTo = formatDate(addDaysLocal(new Date(), REQUEST_WINDOW_DAYS));
      const result = await getAvailableSlots(svcId, dateFrom, dateTo);
      setSlots(result);
      setSelectedDate(result[0]?.date ?? "");
      setSelectedTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando horarios disponibles");
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (serviceId) loadSlots(serviceId);
  }, [serviceId, loadSlots]);

  const parsedMemberNumber = Number(memberNumberInput);
  const isValidMemberNumber =
    memberNumberInput.length > 0 && Number.isInteger(parsedMemberNumber) && parsedMemberNumber >= 1 && parsedMemberNumber <= 99999;

  const availableDates = Array.from(new Set(slots.map((s) => s.date)));
  const slotsForDate = slots.filter((s) => s.date === selectedDate);

  const canSubmit = serviceId && selectedDate && selectedTime && contactName.trim() && isValidMemberNumber && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const appointment = await createAppointment({
        serviceId,
        date: selectedDate,
        startTime: selectedTime,
        memberNumber: parsedMemberNumber,
        contactName: contactName.trim(),
        contact: contact.trim() || undefined,
      });
      onBooked(appointment, parsedMemberNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agendar el turno");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="agb">
      <div className="agb-card">
        <div className="agb-header">
          <TicketMark size={36} className="agb-icon" />
          <h1>Agendar turno</h1>
          <p className="agb-subtitle">Elegí un servicio, un horario, y dejá tus datos</p>
        </div>

        {services.length === 0 ? (
          <div className="agb-empty">No hay servicios disponibles para agendar</div>
        ) : (
          <>
            {services.length > 1 && (
              <div className="agb-field">
                <label className="agb-label">Servicio</label>
                <div className="agb-options">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      className={`agb-option ${serviceId === s.id ? "selected" : ""}`}
                      onClick={() => setServiceId(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingSlots ? (
              <div className="agb-empty">Cargando horarios...</div>
            ) : availableDates.length === 0 ? (
              <div className="agb-empty">No hay horarios disponibles próximamente</div>
            ) : (
              <>
                <div className="agb-field">
                  <label className="agb-label">Día</label>
                  <div className="agb-day-chips">
                    {availableDates.map((date) => (
                      <button
                        key={date}
                        className={`agb-day-chip ${selectedDate === date ? "selected" : ""}`}
                        onClick={() => { setSelectedDate(date); setSelectedTime(""); }}
                      >
                        {formatDateLabel(date)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="agb-field">
                  <label className="agb-label">Horario</label>
                  <div className="agb-time-options">
                    {slotsForDate.map((slot) => (
                      <button
                        key={slot.startTime}
                        className={`agb-option ${selectedTime === slot.startTime ? "selected" : ""}`}
                        onClick={() => setSelectedTime(slot.startTime)}
                      >
                        {slot.startTime}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="agb-field">
                  <label className="agb-label">Nombre</label>
                  <input
                    className="agb-input"
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </div>

                <div className="agb-field">
                  <label className="agb-label">Número de socio</label>
                  <input
                    className="agb-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={5}
                    value={memberNumberInput}
                    onChange={(e) => setMemberNumberInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    placeholder="Ej: 4213"
                  />
                </div>

                <div className="agb-field">
                  <label className="agb-label">Contacto (opcional)</label>
                  <input
                    className="agb-input"
                    type="text"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="Teléfono o email"
                  />
                </div>

                {error && <div className="agb-error">{error}</div>}

                <button className="agb-submit" onClick={handleSubmit} disabled={!canSubmit}>
                  {submitting ? "Agendando..." : "Confirmar turno"}
                </button>
              </>
            )}
          </>
        )}
      </div>

      <style>{agbStyles}</style>
    </div>
  );
}

function ManageAppointment({ appointmentId, initialMemberNumber }: { appointmentId: string; initialMemberNumber: string | null }) {
  const navigate = useNavigate();
  const [memberNumberInput, setMemberNumberInput] = useState(initialMemberNumber ?? "");
  const [memberNumber, setMemberNumber] = useState<number | null>(
    initialMemberNumber && Number.isInteger(Number(initialMemberNumber)) ? Number(initialMemberNumber) : null
  );
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [reprogramming, setReprogramming] = useState(false);

  const load = useCallback(async (num: number) => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const result = await getAppointment(appointmentId, num);
      setAppointment(result);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    if (memberNumber !== null) load(memberNumber);
  }, [memberNumber, load]);

  if (memberNumber === null) {
    const parsed = Number(memberNumberInput);
    const isValid = memberNumberInput.length > 0 && Number.isInteger(parsed) && parsed >= 1 && parsed <= 99999;
    return (
      <div className="agb">
        <div className="agb-card">
          <div className="agb-header">
            <TicketMark size={36} className="agb-icon" />
            <h1>Ver mi cita</h1>
            <p className="agb-subtitle">Ingresá tu número de socio para verla</p>
          </div>
          <div className="agb-field">
            <input
              className="agb-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={5}
              value={memberNumberInput}
              onChange={(e) => setMemberNumberInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
              onKeyDown={(e) => { if (e.key === "Enter" && isValid) setMemberNumber(parsed); }}
              placeholder="Ej: 4213"
              autoFocus
            />
          </div>
          <button className="agb-submit" disabled={!isValid} onClick={() => setMemberNumber(parsed)}>Ver cita</button>
        </div>
        <style>{agbStyles}</style>
      </div>
    );
  }

  if (loading && !appointment) {
    return (
      <div className="agb">
        <div className="agb-card"><p className="agb-subtitle">Cargando tu cita...</p></div>
        <style>{agbStyles}</style>
      </div>
    );
  }

  if (notFound || !appointment) {
    return (
      <div className="agb">
        <div className="agb-card">
          <TicketMark size={32} className="agb-icon" />
          <h1>No encontramos esa cita</h1>
          <p className="agb-subtitle">Revisá el código y tu número de socio.</p>
          <button className="agb-submit" onClick={() => navigate("/agenda")}>Agendar un turno nuevo</button>
        </div>
        <style>{agbStyles}</style>
      </div>
    );
  }

  const isReserved = appointment.status === "reservada";

  const handleCancel = async () => {
    if (!memberNumber) return;
    setActing(true);
    setError("");
    try {
      await cancelAppointment(appointmentId, memberNumber);
      await load(memberNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cancelar la cita");
    } finally {
      setActing(false);
    }
  };

  if (reprogramming) {
    return (
      <RescheduleAppointment
        appointment={appointment}
        memberNumber={memberNumber}
        onDone={() => { setReprogramming(false); load(memberNumber); }}
        onCancel={() => setReprogramming(false)}
      />
    );
  }

  return (
    <div className="agb">
      <div className="agb-ticket">
        <div className="agb-ticket-top">
          <span className="agb-ticket-label">Tu cita</span>
          <div className="agb-ticket-date">{formatDateLabel(appointment.date)}</div>
          <div className="agb-ticket-time">{appointment.startTime}</div>
        </div>

        <div className="agb-ticket-divider">
          <div className="agb-notch agb-notch-left"></div>
          <div className="agb-dash"></div>
          <div className="agb-notch agb-notch-right"></div>
        </div>

        <div className="agb-ticket-bottom">
          <div className="agb-status">{STATUS_LABELS[appointment.status] ?? appointment.status}</div>
          <div className="agb-code">Código: {appointment.id}</div>
          <p className="agb-save-hint">Guardá este enlace para gestionar tu cita.</p>

          {error && <div className="agb-error">{error}</div>}

          {isReserved && (
            <div className="agb-actions">
              <button className="agb-cancel" onClick={handleCancel} disabled={acting}>
                {acting ? "Cancelando..." : "Cancelar cita"}
              </button>
              <button className="agb-submit" onClick={() => setReprogramming(true)} disabled={acting}>
                Reprogramar
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{agbStyles}</style>
    </div>
  );
}

function RescheduleAppointment({
  appointment, memberNumber, onDone, onCancel,
}: {
  appointment: Appointment; memberNumber: number; onDone: () => void; onCancel: () => void;
}) {
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const dateFrom = formatDate(new Date());
        const dateTo = formatDate(addDaysLocal(new Date(), REQUEST_WINDOW_DAYS));
        const result = await getAvailableSlots(appointment.serviceId, dateFrom, dateTo);
        setSlots(result);
        setSelectedDate(result[0]?.date ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error cargando horarios");
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [appointment.serviceId]);

  const availableDates = Array.from(new Set(slots.map((s) => s.date)));
  const slotsForDate = slots.filter((s) => s.date === selectedDate);

  const handleConfirm = async () => {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError("");
    try {
      await rescheduleAppointment(appointment.id, memberNumber, selectedDate, selectedTime);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reprogramar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="agb">
      <div className="agb-card">
        <div className="agb-header">
          <h1>Reprogramar cita</h1>
          <p className="agb-subtitle">Actual: {formatDateLabel(appointment.date)} {appointment.startTime}</p>
        </div>

        {loadingSlots ? (
          <div className="agb-empty">Cargando horarios...</div>
        ) : availableDates.length === 0 ? (
          <div className="agb-empty">No hay otros horarios disponibles</div>
        ) : (
          <>
            <div className="agb-field">
              <label className="agb-label">Día</label>
              <div className="agb-day-chips">
                {availableDates.map((date) => (
                  <button
                    key={date}
                    className={`agb-day-chip ${selectedDate === date ? "selected" : ""}`}
                    onClick={() => { setSelectedDate(date); setSelectedTime(""); }}
                  >
                    {formatDateLabel(date)}
                  </button>
                ))}
              </div>
            </div>

            <div className="agb-field">
              <label className="agb-label">Horario</label>
              <div className="agb-time-options">
                {slotsForDate.map((slot) => (
                  <button
                    key={slot.startTime}
                    className={`agb-option ${selectedTime === slot.startTime ? "selected" : ""}`}
                    onClick={() => setSelectedTime(slot.startTime)}
                  >
                    {slot.startTime}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <div className="agb-error">{error}</div>}

        <div className="agb-actions">
          <button className="agb-cancel" onClick={onCancel} disabled={submitting}>Volver</button>
          <button className="agb-submit" onClick={handleConfirm} disabled={submitting || !selectedDate || !selectedTime}>
            {submitting ? "Confirmando..." : "Confirmar nuevo horario"}
          </button>
        </div>
      </div>
      <style>{agbStyles}</style>
    </div>
  );
}

const agbStyles = `
  .agb {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    min-height: 100vh;
    background:
      radial-gradient(ellipse at 30% 20%, rgba(212,96,58,0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 70% 80%, rgba(91,138,94,0.06) 0%, transparent 50%),
      var(--bg);
  }

  .agb-card {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 2.5rem;
    box-shadow: var(--shadow-md);
    text-align: center;
  }

  .agb-header { text-align: center; margin-bottom: 1.5rem; }
  .agb-icon { display: block; margin: 0 auto 0.75rem; color: var(--primary); }
  .agb-header h1, .agb-card > h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.5rem;
  }
  .agb-subtitle { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1rem; }

  .agb-field { margin-bottom: 1.25rem; text-align: left; }
  .agb-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .agb-input {
    width: 100%;
    padding: 0.85rem 1rem;
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--font-body);
    font-size: 1rem;
    color: var(--text);
    background: var(--surface);
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }
  .agb-input:focus { outline: none; border-color: var(--primary); }

  .agb-options, .agb-time-options {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .agb-day-chips {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }

  .agb-option, .agb-day-chip {
    padding: 0.6rem 1rem;
    background: var(--surface);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text);
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .agb-day-chip { flex: 0 0 auto; text-transform: capitalize; }

  .agb-option:hover, .agb-day-chip:hover { border-color: var(--primary); }

  .agb-option.selected, .agb-day-chip.selected {
    border-color: var(--primary);
    background: var(--primary-light);
    color: var(--primary-hover);
  }

  .agb-empty { text-align: center; color: var(--text-muted); padding: 1.5rem; font-size: 0.95rem; }

  .agb-error {
    color: var(--danger);
    background: var(--danger-light);
    padding: 0.75rem 1rem;
    border-radius: var(--radius-sm);
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1rem;
    text-align: left;
  }

  .agb-submit {
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
  .agb-submit:hover:not(:disabled) { background: var(--primary-hover); }
  .agb-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  .agb-actions { display: flex; gap: 0.75rem; }
  .agb-actions .agb-submit, .agb-actions .agb-cancel { flex: 1; }

  .agb-cancel {
    padding: 1rem;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .agb-cancel:hover:not(:disabled) { border-color: var(--danger); color: var(--danger); background: var(--danger-light); }
  .agb-cancel:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Ticket (management view) */
  .agb-ticket {
    position: relative;
    width: 100%;
    max-width: 400px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
  }

  .agb-ticket-top {
    text-align: center;
    padding: 2rem 2rem 1.5rem;
    background: linear-gradient(135deg, rgba(212,96,58,0.05), rgba(233,168,76,0.05));
  }

  .agb-ticket-label {
    display: block;
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-muted);
    margin-bottom: 0.5rem;
  }

  .agb-ticket-date { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--text); text-transform: capitalize; }
  .agb-ticket-time { font-family: var(--font-display); font-size: 3rem; font-weight: 900; color: var(--primary); line-height: 1; }

  .agb-ticket-divider { position: relative; height: 1px; margin: 0; }
  .agb-notch { position: absolute; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; background: var(--bg); border-radius: 50%; }
  .agb-notch-left { left: -10px; }
  .agb-notch-right { right: -10px; }
  .agb-dash { position: absolute; top: 50%; left: 20px; right: 20px; border-top: 2px dashed var(--border); }

  .agb-ticket-bottom { text-align: center; padding: 1.5rem 2rem; }
  .agb-status { font-size: 1.1rem; font-weight: 600; color: var(--secondary); margin-bottom: 0.5rem; }
  .agb-code { font-size: 0.8rem; color: var(--text-light); margin-bottom: 0.75rem; }
  .agb-save-hint { font-size: 0.8rem; color: var(--text-light); margin-bottom: 1rem; }
`;
