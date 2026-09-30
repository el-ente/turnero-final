import type { HourlyCell, HourlyStats } from "../lib/api";
import { formatDuration, formatShortDate } from "../lib/format";

const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];
const BUSINESS_HOURS = { first: 8, last: 18 };
const CRITICAL_CELL_COUNT = 3;
const HEAT_ALPHA = { min: 0.12, max: 0.9 };

function visibleHours(cells: HourlyCell[]): number[] {
  const hours = cells.map((c) => c.hour);
  const first = Math.min(BUSINESS_HOURS.first, ...hours);
  const last = Math.max(BUSINESS_HOURS.last, ...hours);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

function visibleWeekdays(cells: HourlyCell[]): number[] {
  const withData = new Set(cells.map((c) => c.dayOfWeek));
  return WEEKDAYS_MONDAY_FIRST.filter((day) => withData.has(day));
}

function criticalCellKeys(cells: HourlyCell[]): Set<string> {
  const ranked = cells
    .filter((c) => c.avgWaitTimeSeconds !== null)
    .sort((a, b) => (b.avgWaitTimeSeconds ?? 0) - (a.avgWaitTimeSeconds ?? 0))
    .slice(0, CRITICAL_CELL_COUNT);
  return new Set(ranked.map((c) => `${c.dayOfWeek}-${c.hour}`));
}

function heatBackground(cell: HourlyCell | undefined, maxWait: number): string | undefined {
  if (!cell || cell.avgWaitTimeSeconds === null || maxWait === 0) return undefined;
  const ratio = cell.avgWaitTimeSeconds / maxWait;
  const alpha = HEAT_ALPHA.min + (HEAT_ALPHA.max - HEAT_ALPHA.min) * ratio;
  return `rgba(212, 96, 58, ${alpha.toFixed(2)})`;
}

function cellTooltip(day: number, hour: number, cell: HourlyCell | undefined): string {
  const slot = `${WEEKDAY_LABELS[day]} ${String(hour).padStart(2, "0")}:00`;
  if (!cell) return `${slot} — sin turnos`;
  return `${slot} — ${cell.avgCreatedPerDay} turnos/día · espera ${formatDuration(cell.avgWaitTimeSeconds)} · servicio ${formatDuration(cell.avgServiceTimeSeconds)} · ${cell.created} turnos en total`;
}

function coverageNote(stats: HourlyStats): string {
  const range = `${formatShortDate(stats.from)} al ${formatShortDate(stats.to)}`;
  const partial = stats.firstDate && stats.firstDate > stats.from ? ` (hay datos desde el ${formatShortDate(stats.firstDate)})` : "";
  return `Cubre ${stats.datesCovered} día${stats.datesCovered === 1 ? "" : "s"}, del ${range} (hasta ayer)${partial}.`;
}

export function HourlyHeatmap({ stats }: { stats: HourlyStats }) {
  if (stats.cells.length === 0) {
    return (
      <div className="adm-empty">
        <p className="adm-empty-title">Todavía no hay datos por franja horaria para este período.</p>
        <p className="adm-empty-hint">Se acumulan cada noche a partir de los turnos del día anterior.</p>
      </div>
    );
  }

  const cellsByKey = new Map(stats.cells.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]));
  const hours = visibleHours(stats.cells);
  const weekdays = visibleWeekdays(stats.cells);
  const critical = criticalCellKeys(stats.cells);
  const maxWait = Math.max(0, ...stats.cells.map((c) => c.avgWaitTimeSeconds ?? 0));

  return (
    <div className="adm-heatmap-wrap">
      <table className="adm-heatmap">
        <thead>
          <tr>
            <th />
            {hours.map((h) => <th key={h}>{String(h).padStart(2, "0")}</th>)}
          </tr>
        </thead>
        <tbody>
          {weekdays.map((day) => (
            <tr key={day}>
              <th>{WEEKDAY_LABELS[day]}</th>
              {hours.map((hour) => {
                const key = `${day}-${hour}`;
                const cell = cellsByKey.get(key);
                return (
                  <td
                    key={key}
                    className={`adm-heat-cell ${cell ? "" : "empty"} ${critical.has(key) ? "critical" : ""}`}
                    style={{ background: heatBackground(cell, maxWait) }}
                    title={cellTooltip(day, hour, cell)}
                  >
                    {cell ? Math.round(cell.avgCreatedPerDay) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="adm-heat-legend">
        <span><i className="adm-heat-swatch" /> Color = espera promedio (más oscuro, más espera)</span>
        <span>Número = turnos por día en esa hora</span>
        <span><i className="adm-heat-swatch critical" /> Las {CRITICAL_CELL_COUNT} franjas con más espera</span>
      </div>
      <p className="adm-heat-note">{coverageNote(stats)}</p>
    </div>
  );
}
