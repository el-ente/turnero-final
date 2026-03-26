import { useState, useEffect } from "react";
import type { Sector, Queue, Terminal } from "shared";
import { db } from "../lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { getQueueStats } from "../lib/api";

export function AdminView() {
  const [tab, setTab] = useState<"queues" | "terminals" | "sectors" | "stats">("queues");
  const [queues, setQueues] = useState<(Queue & { id: string })[]>([]);
  const [terminals, setTerminals] = useState<(Terminal & { id: string })[]>([]);
  const [sectors, setSectors] = useState<(Sector & { id: string })[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const [qsec, tsec, ssec] = await Promise.all([
          getDocs(collection(db, "queues")),
          getDocs(collection(db, "terminals")),
          getDocs(collection(db, "sectors")),
        ]);
        setQueues(qsec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Queue & { id: string })));
        setTerminals(tsec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Terminal & { id: string })));
        setSectors(ssec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Sector & { id: string })));
      } catch (err) {
        console.error("Error loading data:", err);
      }
    };
    loadData();
  }, []);

  const handleGetStats = async (queueId: string) => {
    try {
      const stats = await getQueueStats(queueId);
      setStatsData(stats);
      setSelectedQueueId(queueId);
      setTab("stats");
    } catch (err) {
      console.error("Error getting stats:", err);
    }
  };

  const getQueueName = (queueId: string) => queues.find((q) => q.id === queueId)?.name || queueId;
  const getSectorName = (sectorId: string) => sectors.find((s) => s.id === sectorId)?.name || sectorId;

  const tabs = [
    { key: "queues" as const, label: "Colas" },
    { key: "terminals" as const, label: "Terminales" },
    { key: "sectors" as const, label: "Sectores" },
    { key: "stats" as const, label: "Estadisticas" },
  ];

  return (
    <div className="adm">
      <div className="adm-top">
        <h1>Administracion</h1>
        <div className="adm-tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`adm-tab ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-body">
        {tab === "queues" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestion de Colas</h2>
              <button className="adm-btn-new">+ Nueva Cola</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
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
                      <td className="adm-mono">{queue.id}</td>
                      <td className="adm-bold">{queue.name}</td>
                      <td><span className={`adm-pill adm-pill-${queue.type}`}>{queue.type}</span></td>
                      <td>{getSectorName(queue.sectorId)}</td>
                      <td>
                        <span className={`adm-pill ${queue.reenqueueConfig.enabled ? "adm-pill-on" : "adm-pill-off"}`}>
                          {queue.reenqueueConfig.enabled ? "Si" : "No"}
                        </span>
                      </td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn" onClick={() => handleGetStats(queue.id)}>Stats</button>
                        <button className="adm-link-btn">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "terminals" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestion de Terminales</h2>
              <button className="adm-btn-new">+ Nueva Terminal</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
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
                      <td className="adm-mono">{terminal.id}</td>
                      <td className="adm-bold">{terminal.name}</td>
                      <td><span className="adm-pill adm-pill-info">{terminal.servingStrategy}</span></td>
                      <td>{terminal.activeQueueIds.length}</td>
                      <td>
                        <span className={`adm-pill adm-pill-${terminal.status}`}>
                          {terminal.status}
                        </span>
                      </td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn">Editar</button>
                        <button className="adm-link-btn">Config</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "sectors" && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Gestion de Sectores</h2>
              <button className="adm-btn-new">+ Nuevo Sector</button>
            </div>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Descripcion</th>
                    <th>Colas</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.map((sector) => (
                    <tr key={sector.id}>
                      <td className="adm-mono">{sector.id}</td>
                      <td className="adm-bold">{sector.name}</td>
                      <td>{sector.description || "—"}</td>
                      <td>{queues.filter((q) => q.sectorId === sector.id).length}</td>
                      <td className="adm-actions-cell">
                        <button className="adm-link-btn">Editar</button>
                        <button className="adm-link-btn adm-link-danger">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "stats" && statsData && (
          <div className="adm-section">
            <div className="adm-section-top">
              <h2>Estadisticas — {getQueueName(selectedQueueId)}</h2>
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

      <style>{`
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

        .adm-tab:hover {
          color: var(--text);
          background: var(--surface-warm);
        }

        .adm-tab.active {
          color: var(--primary);
          background: var(--primary-light);
          font-weight: 600;
        }

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

        /* Table */
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

        .adm-table thead {
          background: var(--surface-warm);
        }

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

        .adm-table tbody tr:last-child td {
          border-bottom: none;
        }

        .adm-table tbody tr:hover {
          background: rgba(212,96,58,0.02);
        }

        .adm-mono {
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .adm-bold {
          font-weight: 600;
        }

        /* Pills */
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

        /* Stats */
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

        /* Scrollbar */
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
      `}</style>
    </div>
  );
}
