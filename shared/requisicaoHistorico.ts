import type { CoderpParseResult, CoderpRequisitanteRow } from './coderpPdfParser.js';
import {
  detectFamiliaFromName,
  enrichServiceDef,
  ensureFamiliaHierarchy,
  familiaId,
  matchServiceByCanonicalName,
  slugServiceId,
} from './serviceFamilies.js';
import { parseMonthKey } from './monthUtils.js';
import type {
  EmergencialMonitoramento,
  EntradaSemanalEquipamento,
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

function ensureService(
  services: ServiceDef[],
  row: CoderpRequisitanteRow,
): { services: ServiceDef[]; id: string; nome: string } {
  if (row.servicoId) {
    const found = services.find((s) => s.id === row.servicoId);
    if (found) return { services, id: found.id, nome: found.nome };
  }
  const nome = row.canonicalNome ?? row.requisitante.slice(0, 80);
  const id = slugServiceId(nome);
  const existing = services.find((s) => s.id === id);
  if (existing) return { services, id, nome: existing.nome };
  const fam = row.familia ?? detectFamiliaFromName(nome);
  const def = enrichServiceDef({
    id,
    nome,
    fixo: false,
    cotaFixa: null,
    level: 'unidade',
    parentId: fam ? familiaId(fam) : null,
    familiaCodigo: fam,
  });
  return { services: [...services, def], id, nome };
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

  const novosEquipamentos: string[] = [];
  let linhasAplicadas = 0;

  for (const row of parsed.rows) {
    if (row.quantidade <= 0) continue;
    const ensured = ensureService(services, row);
    services = ensureFamiliaHierarchy(ensured.services);
    if (row.match === 'criar') novosEquipamentos.push(ensured.nome);

    const porMes = distributePeriodToMonths(row.quantidade, meses);
    for (const [mes, total] of porMes) {
      if (total <= 0) continue;
      history.push({
        mes,
        servicoId: ensured.id,
        servicoNome: ensured.nome,
        total,
      });
    }
    linhasAplicadas++;
  }

  const mon = clearEntradasMonitoramento(payload.emergencial.monitoramento);

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
          mesAtivo: MES_REFERENCIA_SEGURO,
        },
        plans: payload.emergencial.plans.map((p) =>
          parseMonthKey(p.mes) === parseMonthKey(MES_REFERENCIA_SEGURO)
            ? { ...p, totalDisponivel: TOTAL_MENSAL_EMERGENCIAL_PADRAO }
            : p.totalDisponivel > 0
              ? p
              : { ...p, totalDisponivel: TOTAL_MENSAL_EMERGENCIAL_PADRAO },
        ),
      },
    },
    linhasAplicadas,
    novosEquipamentos,
    mesesPreenchidos: meses,
  };
}

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
