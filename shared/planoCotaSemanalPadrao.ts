import { TOTAL_RESERVA_COTA_MENSAL_UNICA } from './coderpRequisitanteRules.js';
import { TETO_MENSAL_OPERACIONAL } from './monitorConstants.js';

/** Flexível no período de 4 semanas: 1.150 − fixos (94) = 1.056 */
export const TOTAL_FLEX_PERIODO_4SEM =
  TETO_MENSAL_OPERACIONAL - TOTAL_RESERVA_COTA_MENSAL_UNICA;

/** Cestas flexíveis por semana de pedidos (1.056 ÷ 4) */
export const TOTAL_FLEX_SEMANAL_PADRAO = TOTAL_FLEX_PERIODO_4SEM / 4;

/**
 * Cotas semanais aprovadas — ciclo 2 em diante (pós-retomada 16/06/2026).
 * Soma = 264. Fixos (SAICA/WARAOS/Mãos Dadas) ficam fora — entrega única no período.
 */
export const PLANO_COTA_SEMANAL_PADRAO: Record<string, number> = {
  'CRAS 1': 12,
  'CRAS 2': 18,
  'CRAS 3': 14,
  'CRAS 4': 12,
  'CRAS 5': 22,
  'CRAS 6': 22,
  'CRAS 7': 11,
  'CRAS 8': 15,
  'CRAS 9': 12,
  'CRAS 10': 22,
  'CRAS 11': 19,
  'CRAS 12': 32,
  'CREAS I': 7,
  'CREAS II': 13,
  'CREAS III': 6,
  'CREAS IV': 7,
  'CREAS V': 16,
  NAEM: 4,
};

function normNome(nome: string): string {
  return nome.trim().toUpperCase();
}

export function planoCotaSemanalParaUnidade(nome: string): number | null {
  const n = normNome(nome);
  if (PLANO_COTA_SEMANAL_PADRAO[n] != null) {
    return PLANO_COTA_SEMANAL_PADRAO[n];
  }
  const creas = n.match(/^CREAS\s+([IVX]+|\d+)$/i);
  if (creas) {
    const key = `CREAS ${creas[1].toUpperCase()}`;
    return PLANO_COTA_SEMANAL_PADRAO[key] ?? null;
  }
  const cras = n.match(/^CRAS\s+(\d+)$/i);
  if (cras) return PLANO_COTA_SEMANAL_PADRAO[`CRAS ${cras[1]}`] ?? null;
  return null;
}

/** Períodos normais (ciclo ≥ 2): cotas fixas do plano aprovado */
export function usaPlanoSemanalPadrao(ciclo: number): boolean {
  return ciclo >= 2;
}

export function somaPlanoSemanalPadrao(): number {
  return Object.values(PLANO_COTA_SEMANAL_PADRAO).reduce((s, v) => s + v, 0);
}
