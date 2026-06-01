import type { CoderpParseResult } from './coderpPdfParser.js';
import {
  cotaFixaPorUnidade,
  normalizeCoderpImportRows,
} from './coderpRequisitanteRules.js';
import {
  detectFamiliaFromName,
  enrichServiceDef,
  ensureFamiliaHierarchy,
  familiaId,
  isFamiliaLevel,
  matchServiceByCanonicalName,
  normalizeCanonicalUnitName,
  slugServiceId,
} from './serviceFamilies.js';
import { parseMonthKey } from './monthUtils.js';
import { repairServiceCatalog } from './serviceRepair.js';
import type { MonthlyPlan } from './serviceTypes.js';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  type EmergencialMonitoramento,
  type EntradaSemanalEquipamento,
} from './emergencyMonitoring.js';
import type {
  ServiceDef,
  ServiceMonthRecord,
  ServicesPayload,
} from './serviceTypes.js';

/** Período oficial da requisição inicial (sem Abr/2026 — mês instável) */
export const MESES_REQUISICAO_HISTORICO = [
  'Out/2025',
  'Nov/2025',
  'Dez/2025',
  'Jan/2026',
  'Fev/2026',
  'Mar/2026',
] as const;

export const MES_REFERENCIA_SEGURO = 'Mar/2026';
export const TOTAL_MENSAL_EMERGENCIAL_PADRAO = 1150;

/** Meses da carga incorreta (planilha operacional Mar–Set/2025) */
export const MESES_CARGA_PLANILHA_REMOVER = { from: 202503, to: 202509 };

function ensureServiceByUnitName(
  services: ServiceDef[],
  unidadeNome: string,
): { services: ServiceDef[]; id: string; nome: string; criado: boolean } {
  const nomeCanon = normalizeCanonicalUnitName(unidadeNome);
  const cota = cotaFixaPorUnidade(nomeCanon);
  const found = matchServiceByCanonicalName(services, nomeCanon);
  if (found && !isFamiliaLevel(found)) {
    let next = services;
    if (cota != null && (!found.fixo || found.cotaFixa !== cota)) {
      next = services.map((s) =>
        s.id === found.id ? { ...s, fixo: true, cotaFixa: cota } : s,
      );
    }
    return { services: next, id: found.id, nome: found.nome, criado: false };
  }
  const id = slugServiceId(nomeCanon);
  const existing = services.find((s) => s.id === id && !isFamiliaLevel(s));
  if (existing) {
    let next = services;
    if (cota != null && (!existing.fixo || existing.cotaFixa !== cota)) {
      next = services.map((s) =>
        s.id === existing.id ? { ...s, fixo: true, cotaFixa: cota } : s,
      );
    }
    return { services: next, id: existing.id, nome: existing.nome, criado: false };
  }
  const fam = detectFamiliaFromName(nomeCanon);
  const def = enrichServiceDef({
    id,
    nome: nomeCanon,
    fixo: cota != null,
    cotaFixa: cota,
    level: 'unidade',
    parentId: fam ? familiaId(fam) : null,
    familiaCodigo: fam,
  });
  return { services: [...services, def], id, nome: nomeCanon, criado: true };
}

function distributePeriodToMonths(totalPeriodo: number, meses: readonly string[]): Map<string, number> {
  const n = meses.length;
  const base = Math.floor(totalPeriodo / n);
  let rest = totalPeriodo - base * n;
  const out = new Map<string, number>();
  for (const mes of meses) {
    const v = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
    out.set(mes, v);
  }
  return out;
}

/** Remove lançamentos semanais do monitoramento (carga operacional incorreta) */
export function clearEntradasMonitoramento(
  mon: EmergencialMonitoramento,
): EmergencialMonitoramento {
  return {
    ...mon,
    entradasSemanais: [],
  };
}

/** Remove histórico mensal por unidade nos meses indicados (ex. Mar–Set/2025) */
export function purgeHistoricoMonthRange(
  history: ServiceMonthRecord[],
  fromKey: number,
  toKey: number,
): ServiceMonthRecord[] {
  return history.filter((h) => {
    const k = parseMonthKey(h.mes);
    return k < fromKey || k > toKey;
  });
}

export interface CoderpHistoricoImportResult {
  payload: ServicesPayload;
  linhasAplicadas: number;
  novosEquipamentos: string[];
  mesesPreenchidos: string[];
  notasRedistribuicao: string[];
  avisos: string[];
  reparoCadastro?: string[];
}

function ensurePlanoEmergencialMes(
  plans: MonthlyPlan[],
  mes: string,
  total: number,
): MonthlyPlan[] {
  const k = parseMonthKey(mes);
  const next = [...plans];
  const i = next.findIndex((p) => parseMonthKey(p.mes) === k);
  if (i >= 0) {
    next[i] = { ...next[i], totalDisponivel: total };
  } else {
    next.push({ mes, totalDisponivel: total });
  }
  return next;
}

/**
 * Importa totais do PDF Coderp como histórico mensual por unidade (Out/25–Mar/26).
 * Não altera entradasSemanais do monitoramento.
 */
export function applyCoderpHistoricoImport(
  payload: ServicesPayload,
  parsed: CoderpParseResult,
  options?: { substituirMesesRequisicao?: boolean },
): CoderpHistoricoImportResult {
  const substituir = options?.substituirMesesRequisicao !== false;
  const meses = [...MESES_REQUISICAO_HISTORICO];
  const mesKeys = new Set(meses.map((m) => parseMonthKey(m)));

  let services = ensureFamiliaHierarchy(payload.services);
  let history = [...payload.history];

  if (substituir) {
    history = history.filter((h) => !mesKeys.has(parseMonthKey(h.mes)));
  }

  const { unidades, warnings, notas } = normalizeCoderpImportRows(parsed.rows);
  const avisos = [...parsed.warnings, ...warnings];

  const novosEquipamentos: string[] = [];
  let linhasAplicadas = 0;
  const historyByKey = new Map<string, ServiceMonthRecord>();
  for (const h of history) {
    historyByKey.set(`${parseMonthKey(h.mes)}|${h.servicoId}`, h);
  }

  for (const agg of unidades) {
    if (agg.quantidadePeriodo <= 0) continue;
    const ensured = ensureServiceByUnitName(services, agg.unidade);
    services = ensureFamiliaHierarchy(ensured.services);
    if (ensured.criado) novosEquipamentos.push(ensured.nome);

    const porMes = distributePeriodToMonths(agg.quantidadePeriodo, meses);
    for (const [mes, total] of porMes) {
      if (total <= 0) continue;
      const key = `${parseMonthKey(mes)}|${ensured.id}`;
      historyByKey.set(key, {
        mes,
        servicoId: ensured.id,
        servicoNome: ensured.nome,
        total,
      });
    }
    linhasAplicadas++;
  }
  history = [...historyByKey.values()];

  const repaired = repairServiceCatalog(services, history);
  services = ensureFamiliaHierarchy(repaired.services);
  history = repaired.history;
  const reparoCadastro: string[] = [];
  if (repaired.promoted.length) {
    reparoCadastro.push(
      `Unidades reclassificadas: ${repaired.promoted.slice(0, 6).join(', ')}.`,
    );
  }
  if (repaired.removed.length) {
    reparoCadastro.push(
      `Duplicatas removidas: ${repaired.removed.slice(0, 6).join(', ')}.`,
    );
  }

  const mon = clearEntradasMonitoramento(payload.emergencial.monitoramento);
  let plansEmerg = ensurePlanoEmergencialMes(
    payload.emergencial.plans,
    MES_REFERENCIA_SEGURO,
    TOTAL_MENSAL_EMERGENCIAL_PADRAO,
  );
  plansEmerg = ensurePlanoEmergencialMes(
    plansEmerg,
    MONITOR_CONTROLE_MES_INICIO,
    TOTAL_MENSAL_EMERGENCIAL_PADRAO,
  );

  return {
    payload: {
      ...payload,
      services,
      history,
      emergencial: {
        ...payload.emergencial,
        cestasPorMes: TOTAL_MENSAL_EMERGENCIAL_PADRAO,
        monitoramento: {
          ...mon,
          mesAtivo: MONITOR_CONTROLE_MES_INICIO,
          mesInicioControle: MONITOR_CONTROLE_MES_INICIO,
          semanaInicioControle: MONITOR_CONTROLE_SEMANA_INICIO,
        },
        plans: plansEmerg,
      },
    },
    linhasAplicadas,
    novosEquipamentos,
    mesesPreenchidos: meses,
    notasRedistribuicao: notas,
    avisos,
    reparoCadastro,
  };
}

export { normalizeCoderpImportRows } from './coderpRequisitanteRules.js';

/** Limpa monitoramento + histórico da carga planilha (Mar–Set/2025) */
export function revertCargaPlanilhaIncorreta(
  payload: ServicesPayload,
): ServicesPayload {
  const mon = clearEntradasMonitoramento(payload.emergencial.monitoramento);
  const history = purgeHistoricoMonthRange(
    payload.history,
    MESES_CARGA_PLANILHA_REMOVER.from,
    MESES_CARGA_PLANILHA_REMOVER.to,
  );
  return {
    ...payload,
    history,
    emergencial: { ...payload.emergencial, monitoramento: mon },
  };
}

/** Histórico completo (planilha longa + requisição Coderp por unidade) para proporções */
export function historyForDistribuicao(
  payload: ServicesPayload,
): ServiceMonthRecord[] {
  return payload.history;
}

export function entradasFromBadImportRange(
  entradas: EntradaSemanalEquipamento[],
): EntradaSemanalEquipamento[] {
  return entradas.filter((e) => {
    const k = parseMonthKey(e.mes);
    return (
      k >= MESES_CARGA_PLANILHA_REMOVER.from &&
      k <= MESES_CARGA_PLANILHA_REMOVER.to
    );
  });
}
