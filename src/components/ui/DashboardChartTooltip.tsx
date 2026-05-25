import type { TooltipProps } from 'recharts';
import './DashboardChartTooltip.css';

function fmt(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export default function DashboardChartTooltip({
  active,
  payload,
  label,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const entries = payload.filter(
    (p) => p.value != null && p.value !== '' && !Number.isNaN(Number(p.value)),
  );
  if (!entries.length) return null;

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip__label">{label}</p>
      <ul className="chart-tooltip__list">
        {entries.map((entry) => (
          <li key={String(entry.dataKey)} className="chart-tooltip__row">
            <span
              className="chart-tooltip__dot"
              style={{ background: entry.color ?? '#94a3b8' }}
            />
            <span className="chart-tooltip__name">{entry.name}</span>
            <strong className="chart-tooltip__val">{fmt(entry.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
