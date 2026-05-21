import { inferStatus } from './calculations.js';
import { getYearMonth } from './monthUtils.js';
import { aggregateHistoryByMonth } from './processAnalysis.js';
import type { RawMonthRow } from './types.js';
import type { ServiceMonthRecord } from './serviceTypes.js';

/** Totais mensais derivados do histórico por equipamento (fonte única). */
export function rawRowsFromServiceHistory(
  history: ServiceMonthRecord[],
): RawMonthRow[] {
  return aggregateHistoryByMonth(history).map((r) => ({
    mes: r.mes,
    total: r.total,
    status: inferStatus(r.mes),
  }));
}

export function yearsDetectedInHistory(
  history: ServiceMonthRecord[],
): number[] {
  const years = new Set<number>();
  for (const h of history) {
    const ym = getYearMonth(h.mes);
    if (ym) years.add(ym.year);
  }
  return [...years].sort((a, b) => a - b);
}
