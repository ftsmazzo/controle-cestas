/** Constantes do monitor — módulo sem dependências (evita ciclos de import ESM) */

export const MONITOR_CONTROLE_MES_INICIO = 'Mai/2026';
export const MONITOR_CONTROLE_SEMANA_INICIO = 3;

export const TETO_MENSAL_OPERACIONAL = 1150;
export const TETO_CONTRATUAL_MENSAL = 1200;
export const MARGEM_MITIGACAO_MENSAL =
  TETO_CONTRATUAL_MENSAL - TETO_MENSAL_OPERACIONAL;

export const SEMANAS_POR_CICLO_OPERACIONAL = 4;
export const TETO_CICLO_OPERACIONAL = TETO_MENSAL_OPERACIONAL;

export const CICLO_GORDURA_PERMITIDO = 1;
export const GORDURA_PERIODO_CICLO = MARGEM_MITIGACAO_MENSAL * 4;

export const EMPENHO_DURACAO_MESES_PADRAO = 4;

export const MESES_EMPENHO_PADRAO = [
  'Mai/2026',
  'Jun/2026',
  'Jul/2026',
  'Ago/2026',
] as const;
