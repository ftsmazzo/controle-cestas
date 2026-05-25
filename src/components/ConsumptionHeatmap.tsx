import { useMemo } from 'react';
import {
  formatMonthKeyPt,
  HEATMAP_RANGE_FROM,
  HEATMAP_RANGE_TO,
  isMonthKeyInRange,
  parseMonthKey,
} from '@shared/monthUtils';
import type { ServiceMonthRecord } from '@shared/serviceTypes';
import type { ServiceDef } from '@shared/serviceTypes';
import './ConsumptionHeatmap.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface Props {
  services: ServiceDef[];
  history: ServiceMonthRecord[];
  onlyEquipamento?: boolean;
  /** YYYYMM inclusivo (padrão Mar/2025) */
  rangeFrom?: number;
  /** YYYYMM inclusivo (padrão Mar/2026) */
  rangeTo?: number;
}

export default function ConsumptionHeatmap({
  services,
  history,
  onlyEquipamento = true,
  rangeFrom,
  rangeTo,
}: Props) {
  const from = rangeFrom ?? HEATMAP_RANGE_FROM;
  const to = rangeTo ?? HEATMAP_RANGE_TO;
  const periodLabel = `${formatMonthKeyPt(from)} a ${formatMonthKeyPt(to)}`;

  const units = useMemo(
    () =>
      services.filter(
        (s) => !onlyEquipamento || (s.level ?? 'equipamento') === 'equipamento',
      ),
    [services, onlyEquipamento],
  );

  const { months, matrix, max } = useMemo(() => {
    const monthSet = new Set<string>();
    const map = new Map<string, number>();
    for (const h of history) {
      if (!isMonthKeyInRange(h.mes, from, to)) continue;
      const u = services.find((s) => s.id === h.servicoId);
      if (onlyEquipamento && u && (u.level ?? 'equipamento') !== 'equipamento') {
        continue;
      }
      monthSet.add(h.mes);
      const key = `${h.servicoId}|${h.mes}`;
      map.set(key, (map.get(key) ?? 0) + h.total);
    }
    const months = [...monthSet].sort(
      (a, b) => parseMonthKey(a) - parseMonthKey(b),
    );
    let max = 0;
    const matrix = units.map((u) =>
      months.map((mes) => {
        const v = map.get(`${u.id}|${mes}`) ?? 0;
        if (v > max) max = v;
        return v;
      }),
    );
    return { months, matrix, max };
  }, [history, services, units, onlyEquipamento, from, to]);

  if (!months.length || !units.length) {
    return (
      <p className="hint">
        Sem dados entre {periodLabel} para o mapa de calor.
      </p>
    );
  }

  return (
    <div className="heatmap-block">
      <p className="hint heatmap-period">
        Período: <strong>{periodLabel}</strong> ({months.length} meses)
      </p>
      <div className="heatmap-wrap">
        <table className="heatmap-table">
          <thead>
            <tr>
              <th className="heatmap-corner">Equipamento</th>
              {months.map((m) => (
                <th key={m}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((u, ri) => (
              <tr key={u.id}>
                <td className="heatmap-row-label">{u.nome}</td>
                {matrix[ri].map((v, ci) => {
                  const intensity = max > 0 ? v / max : 0;
                  return (
                    <td
                      key={months[ci]}
                      className="heatmap-cell"
                      style={{
                        background: `rgba(37, 99, 235, ${0.06 + intensity * 0.78})`,
                      }}
                      title={`${u.nome} · ${months[ci]}: ${num(v)}`}
                    >
                      {v > 0 ? num(v) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
