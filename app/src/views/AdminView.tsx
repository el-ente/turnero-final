import { useState, useEffect } from "react";
import type { Sector, Queue, Terminal } from "shared";
import { AdminModal } from "../components/AdminModal";
import {
  getQueueStats,
  apiListSectors, apiCreateSector, apiUpdateSector, apiDeleteSector,
  apiListQueues, apiCreateQueue, apiUpdateQueue, apiDeleteQueue,
  apiListTerminals, apiCreateTerminal, apiUpdateTerminal, apiDeleteTerminal,
} from "../lib/api";

type ModalMode =
  | null
  | { type: "create-sector" }
  | { type: "edit-sector"; entity: Sector }
  | { type: "delete-sector"; entity: Sector }
  | { type: "create-queue" }
  | { type: "edit-queue"; entity: Queue }
  | { type: "delete-queue"; entity: Queue }
  | { type: "create-terminal" }
  | { type: "edit-terminal"; entity: Terminal }
  | { type: "delete-terminal"; entity: Terminal };

export function AdminView() {
  const [tab, setTab] = useState<"queues" | "terminals" | "sectors" | "stats">("queues");
  const [queues, setQueues] = useState<Queue[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [modal, setModal] = useState<ModalMode>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (type: "success" | "error", text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = async () => {
    try {
      const [s, q, t] = await Promise.all([apiListSectors(), apiListQueues(), apiListTerminals()]);
      setSectors(s);
      setQueues(q);
      setTerminals(t);
    } catch (err) {
      showToast("error", "Error cargando datos");
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleGetStats = async (queueId: string) => {
    try {
      const stats = await getQueueStats(queueId);
      setStatsData(stats);
      setSelectedQueueId(queueId);
      setTab("stats");
    } catch { showToast("error", "Error obteniendo estadísticas"); }
  };

  const getSectorName = (sectorId: string) => sectors.find((s) => s.id === sectorId)?.name || sectorId;
  const getQueueName = (queueId: string) => queues.find((q) => q.id === queueId)?.name || queueId;

  const tabs = [
    { key: "queues" as const, label: "Colas" },
    { key: "terminals" as const, label: "Terminales" },
    { key: "sectors" as const, label: "Sectores" },
    { key: "stats" as const, label: "Estadísticas" },
  ];

  return (
    <div className="adm">
      <div className="adm-top">
        <h1>Administración</h1>
        <div className="adm-tabs">
          {tabs.map((t) => (
            <button key={t.key} className={`adm-tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-body">
        {/* ─── Queues ─── */}
        {tab === "queues" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestión de Colas</h2>
              <button className="adm-btn-new" onClick={() => setModal({ type: "create-queue" })}>+ Nueva Cola</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Sector</th>
                    <th>Reencolar</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {queues.map((queue) => (
                    <tr key={queue.id}>
                      <td className="adm-bold">{queue.name}</td>
                      <td><span className={`adm-pill adm-pill-${queue.type}`}>{queue.type}</span></td>
                      <td>{getSectorName(queue.sectorId)}</td>
                      <td>
                        <span className={`adm-pill ${queue.reenqueueConfig?.enabled ? "adm-pill-on" : "adm-pill-off"}`}>
                          {queue.reenqueueConfig?.enabled ? "Sí" : "No"}
                        </span>
                      </td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn" onClick={() => handleGetStats(queue.id)}>Stats</button>
                        <button className="adm-link-btn" onClick={() => setModal({ type: "edit-queue", entity: queue })}>Editar</button>
                        <button className="adm-link-btn adm-link-danger" onClick={() => setModal({ type: "delete-queue", entity: queue })}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {queues.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin colas</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Terminals ─── */}
        {tab === "terminals" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestión de Terminales</h2>
              <button className="adm-btn-new" onClick={() => setModal({ type: "create-terminal" })}>+ Nueva Terminal</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Estrategia</th>
                    <th>Colas</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {terminals.map((terminal) => (
                    <tr key={terminal.id}>
                      <td className="adm-bold">{terminal.name}</td>
                      <td><span className="adm-pill adm-pill-info">{terminal.servingStrategy === "ratio_based" ? "Ratio" : "FIFO"}</span></td>
                      <td>{terminal.activeQueueIds?.length || 0}</td>
                      <td><span className={`adm-pill adm-pill-${terminal.status}`}>{terminal.status}</span></td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn" onClick={() => setModal({ type: "edit-terminal", entity: terminal })}>Editar</button>
                        <button className="adm-link-btn adm-link-danger" onClick={() => setModal({ type: "delete-terminal", entity: terminal })}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {terminals.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin terminales</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Sectors ─── */}
        {tab === "sectors" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestión de Sectores</h2>
              <button className="adm-btn-new" onClick={() => setModal({ type: "create-sector" })}>+ Nuevo Sector</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Colas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((sector) => (
                    <tr key={sector.id}>
                      <td className="adm-bold">{sector.name}</td>
                      <td>{sector.description || "—"}</td>
                      <td>{queues.filter((q) => q.sectorId === sector.id).length}</td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn" onClick={() => setModal({ type: "edit-sector", entity: sector })}>Editar</button>
                        <button className="adm-link-btn adm-link-danger" onClick={() => setModal({ type: "delete-sector", entity: sector })}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                  {sectors.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin sectores</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── Stats ─── */}
        {tab === "stats" && statsData && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Estadísticas — {getQueueName(selectedQueueId)}</h2>
              <button className="adm-link-btn" onClick={() => setTab("queues")}>← Volver</button>
            </div>
            <div className="adm-stats-grid">
              {[
                { label: "Creados hoy", value: statsData.totalTodayCreated },
                { label: "Esperando", value: statsData.waitingCount },
                { label: "Llamados", value: statsData.calledCount },
                { label: "Atendiendo", value: statsData.attendingCount },
                { label: "Finalizados", value: statsData.finishedCount },
                { label: "No presentados", value: statsData.noShowCount },
                { label: "Cancelados", value: statsData.cancelledCount },
                { label: "Espera promedio", value: `${statsData.avgWaitTimeSeconds}s` },
              ].map((s) => (
                <div key={s.label} className="adm-stat-card">
                  <div className="adm-stat-label">{s.label}</div>
                  <div className="adm-stat-value">{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ─── Modals ─── */}
      {modal?.type === "create-sector" && (
        <SectorFormModal
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiCreateSector(data); showToast("success", "Sector creado"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "edit-sector" && (
        <SectorFormModal
          sector={modal.entity}
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiUpdateSector(modal.entity.id, data); showToast("success", "Sector actualizado"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "delete-sector" && (
        <ConfirmDeleteModal
          label={`sector "${modal.entity.name}" y todas sus colas`}
          onClose={() => setModal(null)}
          saving={saving}
          onConfirm={async () => {
            setSaving(true);
            try { await apiDeleteSector(modal.entity.id); showToast("success", "Sector eliminado"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "create-queue" && (
        <QueueFormModal
          sectors={sectors}
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiCreateQueue(data); showToast("success", "Cola creada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "edit-queue" && (
        <QueueFormModal
          queue={modal.entity}
          sectors={sectors}
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiUpdateQueue(modal.entity.id, data); showToast("success", "Cola actualizada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "delete-queue" && (
        <ConfirmDeleteModal
          label={`cola "${modal.entity.name}"`}
          onClose={() => setModal(null)}
          saving={saving}
          onConfirm={async () => {
            setSaving(true);
            try { await apiDeleteQueue(modal.entity.id); showToast("success", "Cola eliminada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "create-terminal" && (
        <TerminalFormModal
          sectors={sectors}
          queues={queues}
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiCreateTerminal(data); showToast("success", "Terminal creada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "edit-terminal" && (
        <TerminalFormModal
          terminal={modal.entity}
          sectors={sectors}
          queues={queues}
          onClose={() => setModal(null)}
          saving={saving}
          onSave={async (data) => {
            setSaving(true);
            try { await apiUpdateTerminal(modal.entity.id, data); showToast("success", "Terminal actualizada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {modal?.type === "delete-terminal" && (
        <ConfirmDeleteModal
          label={`terminal "${modal.entity.name}"`}
          onClose={() => setModal(null)}
          saving={saving}
          onConfirm={async () => {
            setSaving(true);
            try { await apiDeleteTerminal(modal.entity.id); showToast("success", "Terminal eliminada"); setModal(null); loadData(); }
            catch (e) { showToast("error", e instanceof Error ? e.message : "Error"); }
            finally { setSaving(false); }
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`adm-toast adm-toast-${toast.type}`}>{toast.text}</div>
      )}

      <style>{adminStyles}</style>
    </div>
  );
}

// ─── Form Components (inline, specific to Admin) ───

function SectorFormModal({ sector, onClose, onSave, saving }: {
  sector?: Sector;
  onClose: () => void;
  onSave: (data: { name: string; description?: string }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(sector?.name || "");
  const [description, setDescription] = useState(sector?.description || "");

  return (
    <AdminModal title={sector ? "Editar Sector" : "Nuevo Sector"} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">Nombre</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Atención General" />
      </div>
      <div className="form-group">
        <label className="form-label">Descripción</label>
        <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" />
      </div>
      <div className="form-actions">
        <button className="form-btn form-btn-cancel" onClick={onClose}>Cancelar</button>
        <button className="form-btn form-btn-save" disabled={!name.trim() || saving} onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined })}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </AdminModal>
  );
}

function QueueFormModal({ queue, sectors, onClose, onSave, saving }: {
  queue?: Queue;
  sectors: Sector[];
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(queue?.name || "");
  const [sectorId, setSectorId] = useState(queue?.sectorId || sectors[0]?.id || "");
  const [type, setType] = useState<string>(queue?.type || "normal");
  const [reenqueueEnabled, setReenqueueEnabled] = useState(queue?.reenqueueConfig?.enabled ?? false);
  const [maxAttempts, setMaxAttempts] = useState(queue?.reenqueueConfig?.maxAttempts ?? 3);
  const [positionsBack, setPositionsBack] = useState(queue?.reenqueueConfig?.positionsBack ?? 5);
  const [priorityWeight, setPriorityWeight] = useState(queue?.priorityWeight ?? 1);

  return (
    <AdminModal title={queue ? "Editar Cola" : "Nueva Cola"} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">Nombre</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Atención Preferencial" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Sector</label>
          <select className="form-select" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
            {sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Tipo</label>
          <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="priority">Prioritaria</option>
          </select>
        </div>
      </div>
      {type === "priority" && (
        <div className="form-group">
          <label className="form-label">Peso prioridad</label>
          <input className="form-input" type="number" min={1} value={priorityWeight} onChange={(e) => setPriorityWeight(Number(e.target.value))} />
        </div>
      )}
      <div className="form-group">
        <label className="form-check">
          <input type="checkbox" checked={reenqueueEnabled} onChange={(e) => setReenqueueEnabled(e.target.checked)} />
          <span>Reencolar en no-show</span>
        </label>
      </div>
      {reenqueueEnabled && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Max intentos</label>
            <input className="form-input" type="number" min={1} value={maxAttempts} onChange={(e) => setMaxAttempts(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Posiciones atrás</label>
            <input className="form-input" type="number" min={1} value={positionsBack} onChange={(e) => setPositionsBack(Number(e.target.value))} />
          </div>
        </div>
      )}
      <div className="form-actions">
        <button className="form-btn form-btn-cancel" onClick={onClose}>Cancelar</button>
        <button className="form-btn form-btn-save" disabled={!name.trim() || !sectorId || saving} onClick={() => onSave({
          name: name.trim(),
          sectorId,
          type,
          reenqueueConfig: { enabled: reenqueueEnabled, maxAttempts, positionsBack },
          priorityWeight: type === "priority" ? priorityWeight : undefined,
        })}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </AdminModal>
  );
}

function TerminalFormModal({ terminal, sectors, queues, onClose, onSave, saving }: {
  terminal?: Terminal;
  sectors: Sector[];
  queues: Queue[];
  onClose: () => void;
  onSave: (data: any) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(terminal?.name || "");
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>(terminal?.sectorIds || []);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>(terminal?.activeQueueIds || []);
  const [strategy, setStrategy] = useState<string>(terminal?.servingStrategy || "fifo_across_queues");
  const [normalRatio, setNormalRatio] = useState(terminal?.strategyConfig?.ratioBased?.normalQueueRatio ?? 2);
  const [priorityRatio, setPriorityRatio] = useState(terminal?.strategyConfig?.ratioBased?.priorityQueueRatio ?? 1);

  const filteredQueues = queues.filter((q) => selectedSectorIds.includes(q.sectorId));

  const toggleSector = (id: string) => {
    const next = selectedSectorIds.includes(id)
      ? selectedSectorIds.filter((s) => s !== id)
      : [...selectedSectorIds, id];
    setSelectedSectorIds(next);
    // Remove queues that no longer belong to selected sectors
    setSelectedQueueIds((prev) => prev.filter((qId) => queues.find((q) => q.id === qId && next.includes(q.sectorId))));
  };

  const toggleQueue = (id: string) => {
    setSelectedQueueIds((prev) => prev.includes(id) ? prev.filter((q) => q !== id) : [...prev, id]);
  };

  return (
    <AdminModal title={terminal ? "Editar Terminal" : "Nueva Terminal"} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">Nombre</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Caja 1" />
      </div>
      <div className="form-group">
        <label className="form-label">Sectores</label>
        <div className="form-multi-select">
          {sectors.map((s) => (
            <span key={s.id} className={`form-chip ${selectedSectorIds.includes(s.id) ? "active" : ""}`} onClick={() => toggleSector(s.id)}>
              {s.name}
            </span>
          ))}
          {sectors.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Creá un sector primero</span>}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Colas</label>
        <div className="form-multi-select">
          {filteredQueues.map((q) => (
            <span key={q.id} className={`form-chip ${selectedQueueIds.includes(q.id) ? "active" : ""}`} onClick={() => toggleQueue(q.id)}>
              {q.name}
            </span>
          ))}
          {filteredQueues.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {selectedSectorIds.length === 0 ? "Seleccioná un sector" : "No hay colas en los sectores seleccionados"}
          </span>}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Estrategia</label>
        <select className="form-select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          <option value="fifo_across_queues">FIFO (orden global)</option>
          <option value="ratio_based">Ratio (normal/prioritaria)</option>
        </select>
      </div>
      {strategy === "ratio_based" && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Ratio normal</label>
            <input className="form-input" type="number" min={1} value={normalRatio} onChange={(e) => setNormalRatio(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Ratio prioridad</label>
            <input className="form-input" type="number" min={1} value={priorityRatio} onChange={(e) => setPriorityRatio(Number(e.target.value))} />
          </div>
        </div>
      )}
      <div className="form-actions">
        <button className="form-btn form-btn-cancel" onClick={onClose}>Cancelar</button>
        <button className="form-btn form-btn-save" disabled={!name.trim() || saving} onClick={() => {
          const strategyConfig: any = { strategy };
          if (strategy === "ratio_based") {
            strategyConfig.ratioBased = { normalQueueRatio: normalRatio, priorityQueueRatio: priorityRatio };
          }
          onSave({ name: name.trim(), sectorIds: selectedSectorIds, activeQueueIds: selectedQueueIds, servingStrategy: strategy, strategyConfig });
        }}>
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </AdminModal>
  );
}

function ConfirmDeleteModal({ label, onClose, onConfirm, saving }: {
  label: string;
  onClose: () => void;
  onConfirm: () => void;
  saving: boolean;
}) {
  return (
    <AdminModal title="Confirmar eliminación" onClose={onClose}>
      <p style={{ marginBottom: "1.5rem", color: "var(--text)" }}>
        ¿Estás seguro de que querés eliminar {label}? Esta acción no se puede deshacer.
      </p>
      <div className="form-actions">
        <button className="form-btn form-btn-cancel" onClick={onClose}>Cancelar</button>
        <button className="form-btn form-btn-danger" disabled={saving} onClick={onConfirm}>
          {saving ? "Eliminando..." : "Eliminar"}
        </button>
      </div>
    </AdminModal>
  );
}

// ─── Styles ───

const adminStyles = `
  .adm {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 64px);
    background: var(--bg);
  }

  .adm-top {
    padding: 1.5rem 2rem;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }

  .adm-top h1 {
    font-family: var(--font-display);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 1rem;
  }

  .adm-tabs {
    display: flex;
    gap: 0.25rem;
  }

  .adm-tab {
    padding: 0.5rem 1rem;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-family: var(--font-body);
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all 0.15s ease;
  }

  .adm-tab:hover { color: var(--text); background: var(--surface-warm); }
  .adm-tab.active { color: var(--primary); background: var(--primary-light); font-weight: 600; }

  .adm-body {
    flex: 1;
    padding: 1.5rem 2rem;
    overflow-y: auto;
  }

  .adm-section {
    animation: fade-up 0.25s ease;
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .adm-section-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
  }

  .adm-section-top h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 500;
    color: var(--text);
  }

  .adm-btn-new {
    padding: 0.6rem 1.25rem;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.875rem;
    font-weight: 600;
    transition: all 0.15s ease;
  }

  .adm-btn-new:hover {
    background: var(--primary-hover);
    box-shadow: 0 2px 8px rgba(212,96,58,0.2);
  }

  .adm-table-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .adm-table {
    width: 100%;
    border-collapse: collapse;
  }

  .adm-table thead { background: var(--surface-warm); }

  .adm-table th {
    padding: 0.75rem 1.25rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
  }

  .adm-table td {
    padding: 0.875rem 1.25rem;
    font-size: 0.9rem;
    color: var(--text);
    border-bottom: 1px solid var(--border-light);
  }

  .adm-table tbody tr:last-child td { border-bottom: none; }
  .adm-table tbody tr:hover { background: rgba(212,96,58,0.02); }

  .adm-bold { font-weight: 600; }

  .adm-pill {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .adm-pill-priority { background: var(--primary-light); color: var(--primary); }
  .adm-pill-normal { background: var(--surface-warm); color: var(--text-muted); }
  .adm-pill-on { background: var(--secondary-light); color: var(--secondary); }
  .adm-pill-off { background: var(--surface-warm); color: var(--text-light); }
  .adm-pill-info { background: var(--accent-light); color: var(--accent); }
  .adm-pill-available { background: var(--secondary-light); color: var(--secondary); }
  .adm-pill-busy { background: var(--accent-light); color: var(--accent); }
  .adm-pill-offline { background: var(--danger-light); color: var(--danger); }

  .adm-actions-cell {
    display: flex;
    gap: 0.5rem;
  }

  .adm-link-btn {
    padding: 0.35rem 0.75rem;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 0.8rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .adm-link-btn:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-light);
  }

  .adm-link-danger:hover {
    border-color: var(--danger);
    color: var(--danger);
    background: var(--danger-light);
  }

  .adm-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .adm-stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.5rem;
    text-align: center;
  }

  .adm-stat-label {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }

  .adm-stat-value {
    font-family: var(--font-display);
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--primary);
    line-height: 1;
  }

  .adm-toast {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius);
    font-weight: 600;
    font-size: 0.9rem;
    z-index: 300;
    animation: toast-in 0.3s ease-out;
    box-shadow: var(--shadow-lg);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translate(-50%, 12px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  .adm-toast-success { background: var(--secondary); color: white; }
  .adm-toast-error { background: var(--danger); color: white; }

  .adm-body::-webkit-scrollbar { width: 6px; }
  .adm-body::-webkit-scrollbar-track { background: transparent; }
  .adm-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  @media (max-width: 768px) {
    .adm-top { padding: 1rem 1.25rem; }
    .adm-top h1 { font-size: 1.35rem; }
    .adm-tabs { flex-wrap: wrap; }
    .adm-body { padding: 1rem 1.25rem; }
    .adm-table th, .adm-table td { padding: 0.625rem 0.75rem; }
    .adm-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
`;
