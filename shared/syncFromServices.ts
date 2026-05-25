import { getYearMonth } from './monthUtils.js';
import {
  applyMethodologyToRawRows,
  defaultMethodologySettings,
  type MethodologySettings,
} from './methodologyCalendar.js';
import { mergeAppSettings } from './appSettings.js';
import { aggregateHistoryByMonth } from './processAnalysis.js';
import type { RawMonthRow } from './types.js';
import type { ServiceMonthRecord, ServicesPayload } from './serviceTypes.js';

/** Totais mensais derivados do histórico por equipamento (fonte única). */
export function rawRowsFromServiceHistory(
  history: ServiceMonthRecord[],
  methodology?: MethodologySettings,
): RawMonthRow[] {
  const agg = aggregateHistoryByMonth(history).map((r) => ({
    mes: r.mes,
    total: r.total,
  }));
  return applyMethodologyToRawRows(agg, methodology ?? defaultMethodologySettings());
}

export function rawRowsFromPayload(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): RawMonthRow[] {
  const settings = mergeAppSettings(payload.settings);
  return rawRowsFromServiceHistory(payload.history, settings.methodology);
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
