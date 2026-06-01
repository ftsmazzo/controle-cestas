import {
  MONITOR_CONTROLE_MES_INICIO,
  type EmergencialMonitoramento,
} from './emergencyMonitoring.js';
import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import { TOTAL_MENSAL_EMERGENCIAL_PADRAO } from './requisicaoHistorico.js';
import type { MonthlyPlan, ServicesPayload } from './serviceTypes.js';

/** Empenho emergencial padrão (4 meses × ~1.150, ajustável no mês) */
export const EMPENHO_CESTAS_TOTAL_PADRAO = 4800;
export const EMPENHO_DURACAO_MESES_PADRAO = 4;

export function incrementMonthKey(key: number): number {
  const year = Math.floor(key / 100);
  const month = key % 100;
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + month + 1;
}

/** Meses do empenho operacional (inclui Mai/2026 mesmo se excluído da previsão) */
export function suggestEmpenhoMeses(
  count: number = EMPENHO_DURACAO_MESES_PADRAO,
  mesInicio: string = MONITOR_CONTROLE_MES_INICIO,
): string[] {
  let cursor = parseMonthKey(mesInicio);
  if (cursor <= 0) cursor = parseMonthKey(MONITOR_CONTROLE_MES_INICIO);
  const out: string[] = [];
  for (let i = 0; i < count && cursor > 0; i++) {
    out.push(formatMonthKeyPt(cursor));
    cursor = incrementMonthKey(cursor);
  }
  return out;
}

export function enviadoMesMonitoramento(
  mes: string,
  mon: EmergencialMonitoramento,
): number {
  const k = parseMonthKey(mes);
  return mon.entradasSemanais
    .filter((e) => parseMonthKey(e.mes) === k)
    .reduce((s, e) => s + (e.quantidade || 0), 0);
}

export interface EmpenhoMesStatus {
  mes: string;
  metaMensal: number;
  enviado: number;
  saldoMes: number;
}

export interface EmpenhoControleResumo {
  meses: EmpenhoMesStatus[];
  totalEmpenho: number;
  totalConsumido: number;
  restante: number;
  mesesRestantes: number;
  mediaSugeridaProximosMeses: number;
  proximoMes: string | null;
  sugestaoProximoMes: number;
  metaOperacionalPadrao: number;
}

export function buildEmpenhoControle(
  payload: ServicesPayload,
  options?: {
    totalEmpenho?: number;
    mesesEmpenho?: string[];
    metaMensalPadrao?: number;
  },
): EmpenhoControleResumo {
  const totalEmpenho =
    options?.totalEmpenho ??
    payload.emergencial.empenhoTotalCestas ??
    EMPENHO_CESTAS_TOTAL_PADRAO;
  const metaOperacionalPadrao =
    options?.metaMensalPadrao ??
    payload.emergencial.cestasPorMes ??
    TOTAL_MENSAL_EMERGENCIAL_PADRAO;
  const mesesEmpenho =
    options?.mesesEmpenho ??
    payload.emergencial.empenhoMeses ??
    suggestEmpenhoMeses(payload.emergencial.duracaoMeses || EMPENHO_DURACAO_MESES_PADRAO);

  const mon = payload.emergencial.monitoramento;
  const planByMes = new Map(
    payload.emergencial.plans.map((p) => [parseMonthKey(p.mes), p]),
  );

  const meses: EmpenhoMesStatus[] = mesesEmpenho.map((mes) => {
    const plan = planByMes.get(parseMonthKey(mes));
    const metaMensal = plan?.totalDisponivel ?? metaOperacionalPadrao;
    const enviado = enviadoMesMonitoramento(mes, mon);
    return {
      mes,
      metaMensal,
      enviado,
      saldoMes: metaMensal - enviado,
    };
  });

  const totalConsumido = meses.reduce((s, m) => s + m.enviado, 0);
  const restante = Math.max(0, totalEmpenho - totalConsumido);

  const nowKey =
    new Date().getFullYear() * 100 + (new Date().getMonth() + 1);
  const mesesFuturosOuAtual = meses.filter(
    (m) => parseMonthKey(m.mes) >= nowKey || m.enviado > 0,
  );
  const mesesRestantes = Math.max(
    1,
    mesesFuturosOuAtual.filter((m) => parseMonthKey(m.mes) >= nowKey).length,
  );
  const mediaSugeridaProximosMeses = Math.round(restante / mesesRestantes);

  const proximo = meses.find((m) => parseMonthKey(m.mes) >= nowKey && m.enviado === 0)
    ?? meses.find((m) => parseMonthKey(m.mes) >= nowKey)
    ?? null;

  const sugestaoProximoMes = proximo
    ? Math.min(
        proximo.metaMensal + 150,
        Math.max(proximo.metaMensal - 150, mediaSugeridaProximosMeses),
      )
    : mediaSugeridaProximosMeses;

  return {
    meses,
    totalEmpenho,
    totalConsumido,
    restante,
    mesesRestantes,
    mediaSugeridaProximosMeses,
    proximoMes: proximo?.mes ?? null,
    sugestaoProximoMes,
    metaOperacionalPadrao: metaOperacionalPadrao,
  };
}

export function ensureEmpenhoPlans(
  plans: MonthlyPlan[],
  meses: string[],
  metaMensal: number,
): MonthlyPlan[] {
  const map = new Map(plans.map((p) => [parseMonthKey(p.mes), p]));
  return meses.map((mes) => {
    const old = map.get(parseMonthKey(mes));
    return {
      mes,
      totalDisponivel:
        old && old.totalDisponivel > 0 ? old.totalDisponivel : metaMensal,
    };
  });
}
