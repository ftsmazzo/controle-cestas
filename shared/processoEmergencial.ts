import {
  defaultEmergencialMonitoring,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  weekDateRangeLabel,
  weeksInCalendarMonth,
} from './emergencyMonitoring.js';
import {
  EMPENHO_CESTAS_TOTAL_PADRAO,
  EMPENHO_DURACAO_MESES_PADRAO,
  ensureEmpenhoPlans,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import { getYearMonth, parseMonthKey } from './monthUtils.js';
import {
  MESES_CARGA_PLANILHA_REMOVER,
  MESES_REQUISICAO_HISTORICO,
} from './requisicaoHistorico.js';
import type { ServicesPayload } from './serviceTypes.js';
import { mergeAppSettings } from './appSettings.js';
import {
  defaultMethodologySettings,
  mergeMethodologySettings,
} from './methodologyCalendar.js';

/** Empenho total do processo (cestas disponíveis para distribuir) */
export const EMPENHO_OPERACIONAL_TOTAL = EMPENHO_CESTAS_TOTAL_PADRAO;

export {
  MARGEM_MITIGACAO_MENSAL,
  TETO_CONTRATUAL_MENSAL,
  TETO_MENSAL_OPERACIONAL,
} from './monitorConstants.js';
import {
  TETO_CONTRATUAL_MENSAL,
  TETO_MENSAL_OPERACIONAL,
} from './monitorConstants.js';

export const PERIODO_REFERENCIA_INICIO = 'Set/2025';
export const PERIODO_REFERENCIA_FIM = 'Mar/2026';

const REF_KEYS = new Set(
  MESES_REQUISICAO_HISTORICO.map((m) => parseMonthKey(m)),
);

export interface SaldoSemanaRow {
  mes: string;
  semana: number;
  periodo: string;
  enviadoSemana: number;
  enviadoAcumulado: number;
  saldoRestante: number;
}

/** Histórico de referência: apenas Set/2025–Mar/2026, sem cargas legadas */
export function filtrarHistoricoReferencia(
  payload: ServicesPayload,
): ServicesPayload['history'] {
  return payload.history.filter((h) => {
    const k = parseMonthKey(h.mes);
    if (k >= MESES_CARGA_PLANILHA_REMOVER.from && k <= MESES_CARGA_PLANILHA_REMOVER.to) {
      return false;
    }
    return REF_KEYS.has(k);
  });
}

/** Metodologia fixa para rateio — sem seletor manual na operação */
export function metodologiaReferenciaFixa(
  current: ServicesPayload['settings'],
): NonNullable<ServicesPayload['settings']> {
  return mergeAppSettings(
    {
      contratoMensal: TETO_CONTRATUAL_MENSAL,
      contratoAnual: TETO_CONTRATUAL_MENSAL * 12,
      methodology: mergeMethodologySettings(
        current?.methodology ?? defaultMethodologySettings(),
        {
          janelaAnaliseMeses: null,
          periodoEstudoFrom: parseMonthKey(PERIODO_REFERENCIA_INICIO),
          periodoEstudoTo: parseMonthKey(PERIODO_REFERENCIA_FIM),
          excludeYear2023: true,
          exclude2022Q1: true,
          overrides: {},
        },
      ),
    },
    current ?? undefined,
  );
}

/**
 * Zera operação emergencial e prepara para relançamento:
 * Zera operação emergencial e prepara para relançamento:
 * saldo 5.000, ponto zero 20/05/2026, histórico ref. limpo.
 */
export function prepararProcessoEmergencialOperacional(
  payload: ServicesPayload,
): ServicesPayload {
  const empenhoMeses = suggestEmpenhoMeses(
    EMPENHO_DURACAO_MESES_PADRAO,
    MONITOR_CONTROLE_MES_INICIO,
  );
  const monitoramento = {
    ...defaultEmergencialMonitoring(),
    mesAtivo: MONITOR_CONTROLE_MES_INICIO,
    mesInicioControle: MONITOR_CONTROLE_MES_INICIO,
    semanaInicioControle: MONITOR_CONTROLE_SEMANA_INICIO,
    saldoAtual: EMPENHO_OPERACIONAL_TOTAL,
    saldoAtualizadoEm: new Date().toISOString(),
    entradasSemanais: [],
    historicoSaldo: [],
  };

  const settings = metodologiaReferenciaFixa(payload.settings);

  return {
    ...payload,
    history: filtrarHistoricoReferencia(payload),
    plans: empenhoMeses.map((mes) => ({
      mes,
      totalDisponivel: TETO_MENSAL_OPERACIONAL,
    })),
    settings: {
      ...settings,
      saldoEstoque: EMPENHO_OPERACIONAL_TOTAL,
    },
    emergencial: {
      ...payload.emergencial,
      ativo: true,
      duracaoMeses: EMPENHO_DURACAO_MESES_PADRAO,
      cestasPorMes: TETO_MENSAL_OPERACIONAL,
      empenhoTotalCestas: EMPENHO_OPERACIONAL_TOTAL,
      empenhoMeses,
      plans: ensureEmpenhoPlans(
        payload.emergencial.plans,
        empenhoMeses,
        TETO_MENSAL_OPERACIONAL,
      ),
      observacao:
        'Processo emergencial Mai–Ago/2026 · empenho 5.000 · teto 1.150/período · ref. Set/25–Mar/26.',
      monitoramento,
    },
    regular: {
      ...payload.regular,
      saldoAtual: EMPENHO_OPERACIONAL_TOTAL,
    },
  };
}

/** Saldo do empenho caindo semana a semana (a partir do ponto zero) */
export function buildEvolucaoSaldoEmpenho(
  payload: ServicesPayload,
): SaldoSemanaRow[] {
  /** Empenho do processo — 5.000 cestas em 16 semanas (não soma dos tetos 4.800) */
  const total = EMPENHO_OPERACIONAL_TOTAL;
  const mon = payload.emergencial.monitoramento;
  const meses =
    payload.emergencial.empenhoMeses ??
    suggestEmpenhoMeses(
      payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
    );
  const mesInicio = mon.mesInicioControle ?? MONITOR_CONTROLE_MES_INICIO;
  const semInicio = mon.semanaInicioControle ?? MONITOR_CONTROLE_SEMANA_INICIO;
  const kIni = parseMonthKey(mesInicio);

  const rows: SaldoSemanaRow[] = [
    {
      mes: mesInicio,
      semana: 0,
      periodo: 'Saldo inicial',
      enviadoSemana: 0,
      enviadoAcumulado: 0,
      saldoRestante: total,
    },
  ];

  let acumulado = 0;

  for (const mes of meses) {
    const k = parseMonthKey(mes);
    if (k < kIni) continue;
    const ym = getYearMonth(mes);
    if (!ym) continue;
    const semanasNoMes = weeksInCalendarMonth(ym.year, ym.month);

    for (let w = 1; w <= semanasNoMes; w++) {
      if (k === kIni && w < semInicio) continue;

      const enviadoSemana = mon.entradasSemanais
        .filter((e) => parseMonthKey(e.mes) === k && e.semana === w)
        .reduce((s, e) => s + (e.quantidade || 0), 0);

      if (enviadoSemana <= 0 && rows.length === 1) continue;

      acumulado += enviadoSemana;
      rows.push({
        mes,
        semana: w,
        periodo: `S${w} ${weekDateRangeLabel(ym.year, ym.month, w)}`,
        enviadoSemana,
        enviadoAcumulado: acumulado,
        saldoRestante: Math.max(0, total - acumulado),
      });
    }
  }

  return rows;
}
