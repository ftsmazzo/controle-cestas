/** Definição de um serviço/unidade que recebe cestas */
export interface ServiceDef {
  id: string;
  nome: string;
  /** Não pode ter alocação reduzida abaixo da cota */
  fixo: boolean;
  /** Cota mensal explícita (opcional; se fixo e vazio, usa média histórica) */
  cotaFixa: number | null;
}

/** Consumo histórico: um serviço em um mês */
export interface ServiceMonthRecord {
  mes: string;
  servicoId: string;
  servicoNome: string;
  total: number;
}

/** Meta de cestas disponíveis para um mês futuro */
export interface MonthlyPlan {
  mes: string;
  totalDisponivel: number;
}

export interface ServiceStats {
  servicoId: string;
  servicoNome: string;
  mediaHistorica: number;
  participacaoPct: number;
  mesesConsiderados: number;
}

export interface ServiceAllocationLine {
  servicoId: string;
  servicoNome: string;
  fixo: boolean;
  cotaFixa: number | null;
  mediaHistorica: number;
  participacaoHistoricaPct: number;
  alocado: number;
  minimoGarantido: number;
  observacao: string;
}

export interface MonthAllocationResult {
  mes: string;
  totalDisponivel: number;
  totalDemandaReferencia: number;
  linhas: ServiceAllocationLine[];
  totalAlocado: number;
  sobra: number;
  alerta: string | null;
}

import type {
  ProcessoEmergencialConfig,
  ProcessoRegularConfig,
} from './processTypes.js';

export interface ServicesMeta {
  /** Nome do arquivo importado por equipamento */
  sourceFile?: string;
  /** Anos presentes no histórico (ex.: 2022–2026) */
  yearsDetected?: number[];
}

export interface ServicesPayload {
  services: ServiceDef[];
  history: ServiceMonthRecord[];
  /** @deprecated use emergencial.plans — mantido para compatibilidade */
  plans: MonthlyPlan[];
  emergencial: ProcessoEmergencialConfig;
  regular: ProcessoRegularConfig;
  updatedAt: string;
  meta?: ServicesMeta;
}

