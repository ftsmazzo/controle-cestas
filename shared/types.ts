export type MonthStatus = 'Completo' | 'Ruptura de estoque' | 'Parcial';

export type AnomalyFlag = 'Normal' | 'Atenção' | 'Anomalia' | 'Excluir modelo';

export type RiskLevel = 'Verde' | 'Amarelo' | 'Vermelho';

export interface RawMonthRow {
  mes: string;
  total: number;
  status?: MonthStatus;
  observacao?: string;
}

export interface ProcessedMonthRow {
  mes: string;
  total: number;
  status: MonthStatus;
  observacao: string;
  totalAjustado: number | null;
  variacaoMm: number | null;
  mediaMovel3m: number | null;
  flagAnomalia: AnomalyFlag;
  usoNoModelo: 'Sim' | 'Não';
}

export interface Kpis {
  consumoTotalObservado: number;
  consumoTotalValido: number;
  mediaMensalValida: number;
  picoConsumo: number;
  menorConsumoValido: number;
  desvioPadrao: number;
  autonomiaMeses: number | null;
  riscoRuptura: RiskLevel;
}

export interface ForecastPoint {
  mes: string;
  /** Volume de referência (estimativa central) */
  valor: number;
  tipo: 'historico' | 'projecao';
  /** Volume menor estimado (referência − desvio limpo) */
  cenarioMenor?: number;
  /** Volume maior estimado (referência + desvio limpo) */
  cenarioMaior?: number;
  /** Média dos três volumes do mês */
  cenarioMedio?: number;
}

export interface ContractScenario {
  consumoMensal: number;
  duracaoMeses: number;
  leitura: string;
}

import type { InsightsKpis } from './insights.js';

export type { InsightsKpis };

export interface DashboardState {
  rows: ProcessedMonthRow[];
  kpis: Kpis;
  insights: InsightsKpis;
  forecast: ForecastPoint[];
  tendenciaProximos: ForecastPoint[];
  /** Previsão até dezembro (meses nomeados, ex. Jun/2026…) */
  previsaoAteFimAno?: ForecastPoint[];
  /** Bump quando o motor de previsão muda (força recálculo no hydrate) */
  forecastModelVersion?: number;
  mediaMovelUltimos3: number | null;
  cenariosContrato: ContractScenario[];
  uploadedAt: string;
  fileName: string;
}
