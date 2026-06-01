import {
  detectFamiliaFromName,
  enrichServiceDef,
  ensureFamiliaHierarchy,
  familiaId,
  matchServiceByCanonicalName,
  slugServiceId,
} from './serviceFamilies.js';
import { parseMonthKey } from './monthUtils.js';
import {
  upsertWeeklyQty,
  type EmergencialMonitoramento,
} from './emergencyMonitoring.js';
import type {
  ServiceDef,
  ServiceMonthRecord,
  ServicesPayload,
} from './serviceTypes.js';
import type { WeeklyHistoricParseResult, WeeklyHistoricRow } from './weeklyHistoricParser.js';

export interface WeeklyHistoricImportOptions {
  /** Substituir entradas semanais dos meses importados */
  substituirMesesImportados?: boolean;
  /** Atualizar totais mensais no histórico (soma das semanas) */
  atualizarHistoricoMensal?: boolean;
}

export interface WeeklyHistoricImportResult {
  payload: ServicesPayload;
  linhasAplicadas: number;
  semanasRegistradas: number;
  mesesImportados: string[];
  novosEquipamentos: string[];
}

function ensureUnit(
  services: ServiceDef[],
  nome: string,
): { services: ServiceDef[]; id: string; created: boolean } {
  const found = matchServiceByCanonicalName(services, nome);
  if (found) return { services, id: found.id, created: false };
  const id = slugServiceId(nome);
  if (services.some((s) => s.id === id)) {
    return { services, id, created: false };
  }
  const fam = detectFamiliaFromName(nome);
  const def = enrichServiceDef({
    id,
    nome,
    fixo: false,
    cotaFixa: null,
    level: 'unidade',
    parentId: fam ? familiaId(fam) : null,
    familiaCodigo: fam,
  });
  return { services: [...services, def], id, created: true };
}

export function applyWeeklyHistoricImport(
  payload: ServicesPayload,
  parsed: WeeklyHistoricParseResult,
  options?: WeeklyHistoricImportOptions,
): WeeklyHistoricImportResult {
  const substituir = options?.substituirMesesImportados !== false;
  const atualizarHistorico = options?.atualizarHistoricoMensal !== false;

  let services = ensureFamiliaHierarchy(payload.services);
  let mon: EmergencialMonitoramento = {
    ...payload.emergencial.monitoramento,
    historicoSaldo: payload.emergencial.monitoramento.historicoSaldo ?? [],
  };

  const mesesImportados = [...new Set(parsed.rows.map((r) => r.mes))];
  const mesKeys = new Set(mesesImportados.map((m) => parseMonthKey(m)));

  if (substituir) {
    mon = {
      ...mon,
      entradasSemanais: mon.entradasSemanais.filter(
        (e) => !mesKeys.has(parseMonthKey(e.mes)),
      ),
    };
  }

  let history = [...payload.history];
  const novosEquipamentos: string[] = [];
  let semanasRegistradas = 0;
  let linhasAplicadas = 0;

  const byMesUnit = new Map<string, WeeklyHistoricRow>();

  for (const row of parsed.rows) {
    const key = `${parseMonthKey(row.mes)}|${row.servicoNome}`;
    const prev = byMesUnit.get(key);
    if (prev) {
      const maxLen = Math.max(prev.semanas.length, row.semanas.length);
      const merged: number[] = [];
      for (let i = 0; i < maxLen; i++) {
        merged.push(Math.max(prev.semanas[i] ?? 0, row.semanas[i] ?? 0));
      }
      byMesUnit.set(key, { ...row, semanas: merged });
    } else {
      byMesUnit.set(key, row);
    }
  }

  for (const row of byMesUnit.values()) {
    const ensured = ensureUnit(services, row.servicoNome);
    services = ensureFamiliaHierarchy(ensured.services);
    if (ensured.created) novosEquipamentos.push(row.servicoNome);

    for (let w = 0; w < row.semanas.length; w++) {
      const semana = w + 1;
      const q = row.semanas[w] ?? 0;
      if (q <= 0) continue;
      mon = upsertWeeklyQty(mon, row.mes, semana, ensured.id, q);
      semanasRegistradas++;
    }

    if (atualizarHistorico) {
      const total = row.semanas.reduce((s, n) => s + (n || 0), 0);
      if (total > 0) {
        const ym = parseMonthKey(row.mes);
        const nome =
          services.find((s) => s.id === ensured.id)?.nome ?? row.servicoNome;
        const idx = history.findIndex(
          (h) => h.servicoId === ensured.id && parseMonthKey(h.mes) === ym,
        );
        const rec: ServiceMonthRecord = {
          mes: row.mes,
          servicoId: ensured.id,
          servicoNome: nome,
          total,
        };
        if (idx >= 0) history[idx] = rec;
        else history.push(rec);
      }
    }
    linhasAplicadas++;
  }

  return {
    payload: {
      ...payload,
      services,
      history,
      emergencial: {
        ...payload.emergencial,
        monitoramento: mon,
      },
    },
    linhasAplicadas,
    semanasRegistradas,
    mesesImportados,
    novosEquipamentos,
  };
}
