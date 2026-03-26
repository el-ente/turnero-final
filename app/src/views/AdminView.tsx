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

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [qsec, tsec, ssec] = await Promise.all([
          getDocs(collection(db, "queues")),
          getDocs(collection(db, "terminals")),
          getDocs(collection(db, "sectors")),
        ]);

        setQueues(
          qsec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Queue & { id: string }))
        );
        setTerminals(
          tsec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Terminal & { id: string })
        )
        );
        setSectors(
          ssec.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Sector & { id: string }))
        );
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

  const getQueueName = (queueId: string) => {
    return queues.find((q) => q.id === queueId)?.name || queueId;
  };

  const getSectorName = (sectorId: string) => {
    return sectors.find((s) => s.id === sectorId)?.name || sectorId;
  };

  return (
    <div className="admin-view">
      {/* Header */}
      <div className="admin-header">
        <h1>Panel de Administración</h1>
        <div className="tab-nav">
          <button
            className={`tab-btn ${tab === "queues" ? "active" : ""}`}
            onClick={() => setTab("queues")}
          >
            Colas
          </button>
          <button
            className={`tab-btn ${tab === "terminals" ? "active" : ""}`}
            onClick={() => setTab("terminals")}
          >
            Terminales
          </button>
          <button
            className={`tab-btn ${tab === "sectors" ? "active" : ""}`}
            onClick={() => setTab("sectors")}
          >
            Sectores
          </button>
          <button
            className={`tab-btn ${tab === "stats" ? "active" : ""}`}
            onClick={() => setTab("stats")}
          >
            Estadísticas
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="admin-content">
        {/* Queues Tab */}
        {tab === "queues" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Gestión de Colas</h2>
              <button className="btn-primary">+ Nueva Cola</button>
            </div>
            <table className="data-table">
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
                    <td className="code">{queue.id}</td>
                    <td className="name">{queue.name}</td>
                    <td>
                      <span className={`badge badge-${queue.type}`}>{queue.type}</span>
                    </td>
                    <td>{getSectorName(queue.sectorId)}</td>
                    <td>
                      {queue.reenqueueConfig.enabled ? (
                        <span className="badge badge-enabled">Activado</span>
                      ) : (
                        <span className="badge badge-disabled">Desactivado</span>
                      )}
                    </td>
                    <td className="actions">
                      <button
                        className="btn-action"
                        onClick={() => handleGetStats(queue.id)}
                      >
                        Ver Stats
                      </button>
                      <button className="btn-action">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Terminals Tab */}
        {tab === "terminals" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Gestión de Terminales</h2>
              <button className="btn-primary">+ Nueva Terminal</button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Estrategia</th>
                  <th>Colas Activas</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {terminals.map((terminal) => (
                  <tr key={terminal.id}>
                    <td className="code">{terminal.id}</td>
                    <td className="name">{terminal.name}</td>
                    <td>
                      <span className="badge badge-info">{terminal.servingStrategy}</span>
                    </td>
                    <td>{terminal.activeQueueIds.length}</td>
                    <td>
                      <span className={`badge badge-${terminal.status}`}>
                        {terminal.status}
                      </span>
                    </td>
                    <td className="actions">
                      <button className="btn-action">Editar</button>
                      <button className="btn-action">Config</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sectors Tab */}
        {tab === "sectors" && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Gestión de Sectores</h2>
              <button className="btn-primary">+ Nuevo Sector</button>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nombre</th>
                  <th>Descripción</th>
                  <th>Colas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {sectors.map((sector) => (
                  <tr key={sector.id}>
                    <td className="code">{sector.id}</td>
                    <td className="name">{sector.name}</td>
                    <td>{sector.description || "—"}</td>
                    <td>{queues.filter((q) => q.sectorId === sector.id).length}</td>
                    <td className="actions">
                      <button className="btn-action">Editar</button>
                      <button className="btn-action">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Stats Tab */}
        {tab === "stats" && statsData && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Estadísticas - {getQueueName(selectedQueueId)}</h2>
              <button className="btn-primary" onClick={() => setTab("queues")}>
                ← Volver
              </button>
            </div>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Total Creados Hoy</div>
                <div className="stat-value">{statsData.totalTodayCreated}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Esperando</div>
                <div className="stat-value">{statsData.waitingCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Llamados</div>
                <div className="stat-value">{statsData.calledCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Atendiendo</div>
                <div className="stat-value">{statsData.attendingCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Finalizados</div>
                <div className="stat-value">{statsData.finishedCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">No Presentados</div>
                <div className="stat-value">{statsData.noShowCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Cancelados</div>
                <div className="stat-value">{statsData.cancelledCount}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Espera Promedio</div>
                <div className="stat-value">{statsData.avgWaitTimeSeconds}s</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Roboto+Mono:wght@400;600&display=swap');

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        .admin-view {
          width: 100%;
          height: 100vh;
          background: linear-gradient(135deg, #f5f7fb 0%, #e3e9f3 100%);
          display: flex;
          flex-direction: column;
          font-family: 'Outfit', sans-serif;
          overflow: hidden;
        }

        /* Header */
        .admin-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 2rem 3rem;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }

        .admin-header h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 1.5rem;
          letter-spacing: 0.5px;
        }

        .tab-nav {
          display: flex;
          gap: 1rem;
        }

        .tab-btn {
          padding: 0.8rem 1.5rem;
          border: 2px solid rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          border-color: white;
          background: rgba(255, 255, 255, 0.15);
        }

        .tab-btn.active {
          border-color: white;
          background: rgba(255, 255, 255, 0.25);
        }

        /* Content */
        .admin-content {
          flex: 1;
          padding: 2rem 3rem;
          overflow-y: auto;
        }

        .tab-content {
          animation: fade-in 0.3s ease;
        }

        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .section-header h2 {
          font-size: 1.8rem;
          color: #333;
          font-weight: 700;
        }

        .btn-primary {
          padding: 0.8rem 1.5rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
        }

        /* Table */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        }

        .data-table thead {
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.05), rgba(118, 75, 162, 0.05));
          border-bottom: 2px solid rgba(102, 126, 234, 0.1);
        }

        .data-table th {
          padding: 1rem 1.5rem;
          text-align: left;
          font-weight: 600;
          color: #667eea;
          font-size: 0.9rem;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .data-table td {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
          color: #333;
        }

        .data-table tbody tr:hover {
          background: rgba(102, 126, 234, 0.02);
        }

        .code {
          font-family: 'Roboto Mono', monospace;
          font-size: 0.85rem;
          color: #764ba2;
          font-weight: 600;
        }

        .name {
          font-weight: 600;
          color: #333;
        }

        .badge {
          display: inline-block;
          padding: 0.4rem 0.8rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.3px;
        }

        .badge-priority {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
        }

        .badge-normal {
          background: rgba(102, 126, 234, 0.2);
          color: #667eea;
        }

        .badge-enabled {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }

        .badge-disabled {
          background: rgba(158, 158, 158, 0.2);
          color: #9e9e9e;
        }

        .badge-info {
          background: rgba(33, 150, 243, 0.2);
          color: #2196f3;
        }

        .badge-available {
          background: rgba(76, 175, 80, 0.2);
          color: #4caf50;
        }

        .badge-offline {
          background: rgba(255, 107, 107, 0.2);
          color: #ff6b6b;
        }

        .actions {
          display: flex;
          gap: 0.8rem;
        }

        .btn-action {
          padding: 0.5rem 1rem;
          background: rgba(102, 126, 234, 0.1);
          border: 1px solid #667eea;
          color: #667eea;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.2s;
        }

        .btn-action:hover {
          background: #667eea;
          color: white;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .stat-card {
          background: white;
          border-radius: 12px;
          padding: 2rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          text-align: center;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #999;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }

        .stat-value {
          font-size: 3rem;
          font-weight: 700;
          color: #667eea;
          line-height: 1;
        }

        /* Scrollbar */
        .admin-content::-webkit-scrollbar {
          width: 8px;
        }

        .admin-content::-webkit-scrollbar-track {
          background: transparent;
        }

        .admin-content::-webkit-scrollbar-thumb {
          background: rgba(102, 126, 234, 0.3);
          border-radius: 4px;
        }

        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .admin-header {
            padding: 1.5rem;
          }

          .admin-header h1 {
            font-size: 1.5rem;
            margin-bottom: 1rem;
          }

          .tab-nav {
            flex-wrap: wrap;
          }

          .admin-content {
            padding: 1.5rem;
          }

          .data-table {
            font-size: 0.85rem;
          }

          .data-table th,
          .data-table td {
            padding: 0.7rem;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
