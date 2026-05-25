import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import type { ProcessedMonthRow } from './types.js';
import type { ServiceMonthRecord } from './serviceTypes.js';

/** Meses válidos para análise (ordem cronológica). */
export function validMonthKeysFromRows(rows: ProcessedMonthRow[]): number[] {
  return rows
    .filter((r) => r.usoNoModelo === 'Sim')
    .map((r) => parseMonthKey(r.mes))
    .filter((k) => k > 0)
    .sort((a, b) => a - b);
}

export function pickWindowKeys(
  validKeys: number[],
  windowMonths: number | null | undefined,
  excluirMes?: string,
): number[] {
  let keys = [...validKeys];
  if (excluirMes) {
    const cut = parseMonthKey(excluirMes);
    if (cut > 0) keys = keys.filter((k) => k < cut);
  }
  if (windowMonths != null && windowMonths > 0) {
    return keys.slice(-windowMonths);
  }
  return keys;
}

export function historyForMonthKeys(
  history: ServiceMonthRecord[],
  monthKeys: number[],
): ServiceMonthRecord[] {
  const allowed = new Set(monthKeys);
  return history.filter((h) => allowed.has(parseMonthKey(h.mes)));
}

export function monthKeysToLabels(keys: number[]): string[] {
  return keys.map(formatMonthKeyPt);
}

/** Soma por mês a partir do histórico de equipamentos (deve bater com total importado). */
export function totalsByMonthFromHistory(
  history: ServiceMonthRecord[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const h of history) {
    map.set(h.mes, (map.get(h.mes) ?? 0) + h.total);
  }
  return map;
}

export interface TotalMismatch {
  mes: string;
  somaEquipamentos: number;
  totalPainel: number;
  diff: number;
}

export function findEquipmentTotalMismatches(
  history: ServiceMonthRecord[],
  panelRows: ProcessedMonthRow[],
): TotalMismatch[] {
  const byEquip = totalsByMonthFromHistory(history);
  const out: TotalMismatch[] = [];
  for (const r of panelRows) {
    const soma = byEquip.get(r.mes) ?? 0;
    if (soma <= 0) continue;
    const diff = Math.abs(soma - r.total);
    if (diff > 1) {
      out.push({
        mes: r.mes,
        somaEquipamentos: soma,
        totalPainel: r.total,
        diff,
      });
    }
  }
  return out;
}
