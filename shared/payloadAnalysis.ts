import { processSeries } from './calculations.js';
import { validMonthKeysFromRows } from './analysisWindow.js';
import { parseMonthKey } from './monthUtils.js';
import { excludedMonthKeysFromRows } from './planningMonths.js';
import { MESES_REQUISICAO_HISTORICO } from './requisicaoHistorico.js';
import type { ProcessedMonthRow } from './types.js';
import type { ServicesPayload } from './serviceTypes.js';
import { rawTotalsFromHistory } from './recalculateSnapshot.js';

export function processedRowsFromPayload(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): ProcessedMonthRow[] {
  const raw = rawTotalsFromHistory(payload);
  return processSeries(raw);
}

export function validMonthKeysForPayload(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): number[] {
  const keys = new Set(validMonthKeysFromRows(processedRowsFromPayload(payload)));
  for (const mes of MESES_REQUISICAO_HISTORICO) {
    const k = parseMonthKey(mes);
    if (k > 0 && payload.history.some((h) => parseMonthKey(h.mes) === k && h.total > 0)) {
      keys.add(k);
    }
  }
  return [...keys].sort((a, b) => a - b);
}

export function excludedMonthKeysForPayload(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): number[] {
  return excludedMonthKeysFromRows(processedRowsFromPayload(payload));
}
