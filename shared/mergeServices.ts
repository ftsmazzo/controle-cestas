import type { ServiceDef, ServiceMonthRecord } from './serviceTypes.js';

export function mergeServiceHistory(
  existing: ServiceMonthRecord[],
  incoming: ServiceMonthRecord[],
): ServiceMonthRecord[] {
  const map = new Map<string, ServiceMonthRecord>();
  for (const h of existing) {
    map.set(`${h.mes}|${h.servicoId}`, h);
  }
  for (const h of incoming) {
    map.set(`${h.mes}|${h.servicoId}`, h);
  }
  return [...map.values()];
}

export function mergeServiceDefs(
  existing: ServiceDef[],
  incoming: ServiceDef[],
): ServiceDef[] {
  const map = new Map<string, ServiceDef>();
  for (const s of existing) map.set(s.id, s);
  for (const s of incoming) {
    const prev = map.get(s.id);
    map.set(s.id, prev ? { ...prev, ...s, nome: s.nome || prev.nome } : s);
  }
  return [...map.values()];
}
