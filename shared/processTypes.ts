import { suggestNextMonths } from './allocation.js';
import type { MonthlyPlan, ServiceMonthRecord } from './serviceTypes.js';

/** Processo emergencial: ex. 1.200 cestas/mês por 4 meses — distribuição por equipamento */
export interface ProcessoEmergencialConfig {
  ativo: boolean;
  duracaoMeses: number;
  cestasPorMes: number;
  plans: MonthlyPlan[];
  observacao: string;
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
  previsaoProximos3: number[];
  totalPlanejado12: number;
  totalContratoAnual: number;
  mesesCobertosPeloContrato: number;
  autonomiaMeses: number | null;
  riscoRuptura: 'Verde' | 'Amarelo' | 'Vermelho';
  alertas: ProcessoRiscoItem[];
}

export function defaultEmergencialConfig(
  history: ServiceMonthRecord[],
): ProcessoEmergencialConfig {
  const months = suggestNextMonths(history, 4);
  return {
    ativo: true,
    duracaoMeses: 4,
    cestasPorMes: 1200,
    plans: months.map((mes) => ({ mes, totalDisponivel: 1200 })),
    observacao: 'Processo emergencial — distribuir por equipamento para evitar ruptura.',
  };
}

export function defaultRegularConfig(
  history: ServiceMonthRecord[],
): ProcessoRegularConfig {
  const months = suggestNextMonths(history, 12);
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
