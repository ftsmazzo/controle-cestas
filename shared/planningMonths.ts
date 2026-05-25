import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import type { ProcessedMonthRow } from './types.js';

/** Ruptura/parcial fixos (nota técnica) — sempre fora do planejamento, mesmo sem linha no histórico. */
export const PLANNING_BLOCKED_MONTH_KEYS: readonly number[] = [202604, 202605];

function incrementMonthKey(key: number): number {
  const year = Math.floor(key / 100);
  const month = key % 100;
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + month + 1;
}

export function excludedMonthKeysFromRows(rows: ProcessedMonthRow[]): number[] {
  const fromRows = rows
    .filter((r) => r.usoNoModelo === 'Não')
    .map((r) => parseMonthKey(r.mes))
    .filter((k) => k > 0);
  return [...new Set([...PLANNING_BLOCKED_MONTH_KEYS, ...fromRows])];
}

/**
 * Meses futuros para planejar (emergencial, distribuir, registro).
 * Começa após o último mês válido e pula meses excluídos (ruptura/parcial).
 */
export function suggestPlanningMonths(
  validMonthKeys: number[],
  count: number,
  excludedMonthKeys: number[] = [],
): string[] {
  const excluded = new Set([...PLANNING_BLOCKED_MONTH_KEYS, ...excludedMonthKeys]);
  let cursor =
    validMonthKeys.length > 0 ? Math.max(...validMonthKeys) : 0;
  const result: string[] = [];
  let guard = 0;
  while (result.length < count && guard < 48) {
    guard += 1;
    if (cursor <= 0) {
      const now = new Date();
      cursor = now.getFullYear() * 100 + (now.getMonth() + 1);
    } else {
      cursor = incrementMonthKey(cursor);
    }
    if (excluded.has(cursor)) continue;
    result.push(formatMonthKeyPt(cursor));
  }
  return result;
}

export function isExcludedPlanningMonth(
  mes: string,
  excludedMonthKeys: number[],
): boolean {
  const k = parseMonthKey(mes);
  return (
    k > 0 &&
    ((PLANNING_BLOCKED_MONTH_KEYS as readonly number[]).includes(k) ||
      excludedMonthKeys.includes(k))
  );
}
