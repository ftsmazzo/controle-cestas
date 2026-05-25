import { processSeries } from './calculations.js';
import { validMonthKeysFromRows } from './analysisWindow.js';
import { excludedMonthKeysFromRows } from './planningMonths.js';
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
  return validMonthKeysFromRows(processedRowsFromPayload(payload));
}

export function excludedMonthKeysForPayload(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): number[] {
  return excludedMonthKeysFromRows(processedRowsFromPayload(payload));
}
