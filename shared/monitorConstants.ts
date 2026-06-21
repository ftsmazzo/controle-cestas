/** Constantes do monitor — módulo sem dependências (evita ciclos de import ESM) */

export const MONITOR_CONTROLE_MES_INICIO = 'Mai/2026';
export const MONITOR_CONTROLE_SEMANA_INICIO = 3;

/** Teto do período de 4 semanas (ciclo operacional) — o que leigos chamam "mês" */
export const TETO_MENSAL_OPERACIONAL = 1150;
export const TETO_CONTRATUAL_MENSAL = 1200;
export const MARGEM_MITIGACAO_MENSAL =
  TETO_CONTRATUAL_MENSAL - TETO_MENSAL_OPERACIONAL;

export const SEMANAS_POR_CICLO_OPERACIONAL = 4;
export const TETO_CICLO_OPERACIONAL = TETO_MENSAL_OPERACIONAL;

/** Ciclo 1 pode usar +200 de gordura (teto 1.350) */
export const CICLO_GORDURA_PERMITIDO = 1;
export const GORDURA_CICLO_1 = 200;
export const GORDURA_PERIODO_CICLO = GORDURA_CICLO_1;
export const GORDURA_RESTANTE_MAXIMA = 200;

/** Processo completo: 16 ciclos de 4 semanas */
export const TOTAL_CICLOS_OPERACIONAIS = 16;
export const EMPENHO_TOTAL_CESTAS = 5000;

export const EMPENHO_DURACAO_MESES_PADRAO = 4;

export const MESES_EMPENHO_PADRAO = [
  'Mai/2026',
  'Jun/2026',
  'Jul/2026',
  'Ago/2026',
] as const;

/** Rótulo para leigos: ciclo de 4 semanas = "mês" operacional de 1.150 cestas */
export const LABEL_PERIODO_LEIGO = 'Período de 4 semanas (1.150 cestas)';
