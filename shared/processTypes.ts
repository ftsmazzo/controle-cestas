import {
  defaultEmergencialMonitoring,
  MONITOR_CONTROLE_MES_INICIO,
  type EmergencialMonitoramento,
} from './emergencyMonitoring.js';
import {
  EMPENHO_CESTAS_TOTAL_PADRAO,
  EMPENHO_DURACAO_MESES_PADRAO,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import { suggestPlanningMonths, excludedMonthKeysFromRows } from './planningMonths.js';
import { processedRowsFromPayload, validMonthKeysForPayload } from './payloadAnalysis.js';
import type { MonthlyPlan, ServicesPayload } from './serviceTypes.js';

export type { EmergencialMonitoramento, EntradaSemanalEquipamento } from './emergencyMonitoring.js';

/** Processo emergencial: ex. 1.200 cestas/mês por 4 meses — distribuição por equipamento */
export interface ProcessoEmergencialConfig {
  ativo: boolean;
  duracaoMeses: number;
  cestasPorMes: number;
  plans: MonthlyPlan[];
  observacao: string;
  /** Total do empenho do período (ex. 4.800 em 4 meses) */
  empenhoTotalCestas?: number;
  /** Meses cobertos pelo empenho (ex. Mai–Ago/2026) */
  empenhoMeses?: string[];
  /** Acompanhamento semanal em produção (envios por equipamento + saldo Banco) */
  monitoramento: EmergencialMonitoramento;
}

/** Processo regular: registro/leito de 12 meses — totais mensais, previsão e risco contratual */
export interface ProcessoRegularConfig {
  ativo: boolean;
  duracaoMeses: number;
  cestasContratoMensal: number;
  totalContratoAnual: number;
  plans: MonthlyPlan[];
  saldoAtual: number | null;
  observacao: string;
}

export interface ProcessoRiscoItem {
  nivel: 'baixo' | 'moderado' | 'alto' | 'critico';
  titulo: string;
  descricao: string;
}

export interface ProcessoEmergencialAnalise {
  processo: 'emergencial';
  meses: {
    mes: string;
    disponivel: number;
    demandaReferencia: number;
    gap: number;
    risco: ProcessoRiscoItem['nivel'];
  }[];
  alertas: ProcessoRiscoItem[];
}

export interface ProcessoRegularAnalise {
  processo: 'regular';
  consumoMedioValido: number;
  previsaoProximoMes: number | null;
  mediaPrevisaoFutura: number | null;
  previsaoProximos3: number[];
  totalPlanejado12: number;
  totalContratoAnual: number;
  mesesCobertosPeloContrato: number;
  mesesCobertosPelaPrevisao: number | null;
  autonomiaMeses: number | null;
  riscoRuptura: 'Verde' | 'Amarelo' | 'Vermelho';
  alertas: ProcessoRiscoItem[];
}

function planningContext(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): { valid: number[]; excluded: number[] } {
  const rows = processedRowsFromPayload(payload);
  return {
    valid: validMonthKeysForPayload(payload),
    excluded: excludedMonthKeysFromRows(rows),
  };
}

export function defaultEmergencialConfig(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): ProcessoEmergencialConfig {
  const { valid, excluded } = planningContext(payload);
  const empenhoMeses = suggestEmpenhoMeses(
    EMPENHO_DURACAO_MESES_PADRAO,
    MONITOR_CONTROLE_MES_INICIO,
  );
  return {
    ativo: true,
    duracaoMeses: EMPENHO_DURACAO_MESES_PADRAO,
    cestasPorMes: 1150,
    empenhoTotalCestas: EMPENHO_CESTAS_TOTAL_PADRAO,
    empenhoMeses,
    plans: empenhoMeses.map((mes) => ({ mes, totalDisponivel: 1150 })),
    observacao: 'Processo emergencial — distribuir por equipamento para evitar ruptura.',
    monitoramento: defaultEmergencialMonitoring(),
  };
}

export function defaultRegularConfig(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): ProcessoRegularConfig {
  const { valid, excluded } = planningContext(payload);
  const months = suggestPlanningMonths(valid, 12, excluded);
  return {
    ativo: true,
    duracaoMeses: 12,
    cestasContratoMensal: 1200,
    totalContratoAnual: 14400,
    plans: months.map((mes) => ({ mes, totalDisponivel: 0 })),
    saldoAtual: null,
    observacao: 'Processo regular — levantamento mensal e análise de risco em 12 meses.',
  };
}
