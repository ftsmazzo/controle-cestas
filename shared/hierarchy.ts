import type { ServiceDef, ServiceMonthRecord } from './serviceTypes.js';

/** Agrega histórico de serviços filhos no equipamento pai (fase 3 — 12 CRAS). */
export function aggregateChildrenToParent(
  history: ServiceMonthRecord[],
  services: ServiceDef[],
): ServiceMonthRecord[] {
  const byId = new Map(services.map((s) => [s.id, s]));
  const childRows = history.filter((h) => {
    const u = byId.get(h.servicoId);
    return u?.level === 'servico' && u.parentId;
  });
  if (!childRows.length) return history;

  const parentTotals = new Map<string, ServiceMonthRecord>();
  for (const h of childRows) {
    const u = byId.get(h.servicoId)!;
    const pid = u.parentId!;
    const parent = services.find((s) => s.id === pid);
    const key = `${pid}|${h.mes}`;
    const cur = parentTotals.get(key);
    if (cur) {
      cur.total += h.total;
    } else {
      parentTotals.set(key, {
        mes: h.mes,
        servicoId: pid,
        servicoNome: parent?.nome ?? pid,
        total: h.total,
      });
    }
  }

  const equipHistory = history.filter((h) => {
    const u = byId.get(h.servicoId);
    return (u?.level ?? 'equipamento') === 'equipamento';
  });

  return [...equipHistory, ...parentTotals.values()];
}

export function equipmentUnits(services: ServiceDef[]): ServiceDef[] {
  return services.filter((s) => (s.level ?? 'equipamento') === 'equipamento');
}

export function serviceUnits(
  services: ServiceDef[],
  parentId?: string,
): ServiceDef[] {
  return services.filter(
    (s) =>
      s.level === 'servico' &&
      (parentId == null || s.parentId === parentId),
  );
}
