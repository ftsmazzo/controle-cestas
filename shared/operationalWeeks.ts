import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import { weeksInCalendarMonth } from './calendarWeeks.js';
import { getYearMonth, parseMonthKey } from './monthUtils.js';
import {
  CICLO_GORDURA_PERMITIDO,
  GORDURA_PERIODO_CICLO,
  MESES_EMPENHO_PADRAO,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  SEMANAS_POR_CICLO_OPERACIONAL,
  TETO_CICLO_OPERACIONAL,
} from './monitorConstants.js';
import { totalEnviadoNaSemana } from './weeklyQty.js';

export {
  CICLO_GORDURA_PERMITIDO,
  GORDURA_PERIODO_CICLO,
  SEMANAS_POR_CICLO_OPERACIONAL,
  TETO_CICLO_OPERACIONAL,
} from './monitorConstants.js';

/** 1ª semana operacional: quarta 20/05/2026 (relatório qua–ter; entrega seg–ter seguinte) */
export const OPERACIONAL_ANCORAGEM = { year: 2026, month: 5, day: 20 };

export interface CivilWeekKey {
  mes: string;
  semana: number;
}

export interface SemanaOperacionalRef {
  /** Índice global 1-based desde a ancoragem */
  indice: number;
  ciclo: number;
  semanaNoCiclo: number;
  civil: CivilWeekKey;
  label: string;
  labelCurta: string;
  /** Período qua–ter (ex.: 20–26 Mai, 27 Mai–2 Jun) */
  periodo: string;
}

const NUM_TO_PT = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function formatDiaMes(d: Date): string {
  const day = d.getDate();
  const mon = NUM_TO_PT[d.getMonth() + 1] ?? '';
  return `${day} ${mon}`;
}

function formatPeriodoOperacional(start: Date, end: Date): string {
  const sm = start.getMonth();
  const em = end.getMonth();
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  if (sy === ey && sm === em) {
    return `${start.getDate()}–${end.getDate()} ${NUM_TO_PT[sm + 1]}`;
  }
  return `${formatDiaMes(start)} – ${formatDiaMes(end)}`;
}

export function dataInicioSemanaOperacional(indice: number): Date {
  const d = new Date(
    OPERACIONAL_ANCORAGEM.year,
    OPERACIONAL_ANCORAGEM.month - 1,
    OPERACIONAL_ANCORAGEM.day,
  );
  d.setDate(d.getDate() + (indice - 1) * 7);
  return d;
}

export function dataFimSemanaOperacional(indice: number): Date {
  const d = dataInicioSemanaOperacional(indice);
  d.setDate(d.getDate() + 6);
  return d;
}

export function cicloOperacionalDeIndice(indice: number): number {
  if (indice <= 0) return 1;
  return Math.floor((indice - 1) / SEMANAS_POR_CICLO_OPERACIONAL) + 1;
}

export function semanaNoCicloDeIndice(indice: number): number {
  if (indice <= 0) return 1;
  return ((indice - 1) % SEMANAS_POR_CICLO_OPERACIONAL) + 1;
}

/** Semanas civis lançadas no monitor, na ordem do controle (Mai S3…) */
export function listarSemanasCivisControle(
  empenhoMeses?: string[],
): CivilWeekKey[] {
  const meses =
    empenhoMeses?.length ? empenhoMeses : [...MESES_EMPENHO_PADRAO];
  const kInicio = parseMonthKey(MONITOR_CONTROLE_MES_INICIO);
  const out: CivilWeekKey[] = [];

  for (const mes of meses) {
    if (parseMonthKey(mes) < kInicio) continue;
    const ym = getYearMonth(mes);
    if (!ym) continue;
    const maxW = weeksInCalendarMonth(ym.year, ym.month);
    const wStart =
      parseMonthKey(mes) === kInicio ? MONITOR_CONTROLE_SEMANA_INICIO : 1;
    for (let w = wStart; w <= maxW; w++) {
      out.push({ mes, semana: w });
    }
  }
  return out;
}

/** Índice operacional 1-based para o par civil salvo no banco */
export function indiceOperacionalCivil(
  mes: string,
  semana: number,
  empenhoMeses?: string[],
): number | null {
  const lista = listarSemanasCivisControle(empenhoMeses);
  const idx = lista.findIndex((c) => c.mes === mes && c.semana === semana);
  return idx >= 0 ? idx + 1 : null;
}

export function civilPorIndiceOperacional(
  indice: number,
  empenhoMeses?: string[],
): CivilWeekKey | null {
  const lista = listarSemanasCivisControle(empenhoMeses);
  return lista[indice - 1] ?? null;
}

export function refSemanaOperacional(
  indice: number,
  empenhoMeses?: string[],
): SemanaOperacionalRef | null {
  const civil = civilPorIndiceOperacional(indice, empenhoMeses);
  if (!civil) return null;
  const start = dataInicioSemanaOperacional(indice);
  const end = dataFimSemanaOperacional(indice);
  const ciclo = cicloOperacionalDeIndice(indice);
  const semanaNoCiclo = semanaNoCicloDeIndice(indice);
  return {
    indice,
    ciclo,
    semanaNoCiclo,
    civil,
    label: `C${ciclo}·S${semanaNoCiclo}`,
    labelCurta: `Sem ${indice}`,
    periodo: formatPeriodoOperacional(start, end),
  };
}

export function refSemanaOperacionalCivil(
  mes: string,
  semana: number,
  empenhoMeses?: string[],
): SemanaOperacionalRef | null {
  const idx = indiceOperacionalCivil(mes, semana, empenhoMeses);
  if (idx == null) return null;
  return refSemanaOperacional(idx, empenhoMeses);
}

/** Rótulo curto alinhado ao ciclo operacional (substitui Mai S3 quando mapeado) */
export function formatSemanaOperacionalCurta(
  mes: string,
  semana: number,
  empenhoMeses?: string[],
): string {
  const ref = refSemanaOperacionalCivil(mes, semana, empenhoMeses);
  if (ref) return `${ref.label} (${ref.periodo})`;
  const ym = getYearMonth(mes);
  const abrev = ym ? NUM_TO_PT[ym.month] : mes.split(/[/\s-]/)[0];
  return `${abrev} S${semana}`;
}

export function periodoOperacionalCivil(
  mes: string,
  semana: number,
  empenhoMeses?: string[],
): string | null {
  return refSemanaOperacionalCivil(mes, semana, empenhoMeses)?.periodo ?? null;
}

/** Total enviado no ciclo operacional até a semana operacional de referência (inclusive) */
export function enviadoCicloOperacionalAte(
  mon: EmergencialMonitoramento,
  mesRef: string,
  semanaRef: number,
  empenhoMeses?: string[],
): { ciclo: number; enviado: number; semanasNoCiclo: number } {
  const idx = indiceOperacionalCivil(mesRef, semanaRef, empenhoMeses);
  if (idx == null) {
    return { ciclo: 1, enviado: 0, semanasNoCiclo: 0 };
  }
  const ciclo = cicloOperacionalDeIndice(idx);
  const inicioCiclo = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  let enviado = 0;
  let semanasNoCiclo = 0;
  for (let i = inicioCiclo; i <= idx; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    const q = totalEnviadoNaSemana(mon, civil.mes, civil.semana);
    enviado += q;
    if (q > 0) semanasNoCiclo++;
  }
  return { ciclo, enviado, semanasNoCiclo };
}

export function saldoCicloOperacional(enviadoNoCiclo: number): number {
  return saldoAteTetoCiclo(enviadoNoCiclo, TETO_CICLO_OPERACIONAL);
}

/** Teto máximo do ciclo: ciclo 1 = 1.150 + 200 gordura (1.350); demais = 1.150 */
export function tetoMaximoCicloOperacional(ciclo: number): number {
  return ciclo === CICLO_GORDURA_PERMITIDO
    ? TETO_CICLO_OPERACIONAL + GORDURA_PERIODO_CICLO
    : TETO_CICLO_OPERACIONAL;
}

export function saldoAteTetoCiclo(enviadoNoCiclo: number, teto: number): number {
  return Math.max(0, teto - enviadoNoCiclo);
}

export function labelCicloOperacional(ciclo: number): string {
  const ini = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const fim = ini + SEMANAS_POR_CICLO_OPERACIONAL - 1;
  const pIni = refSemanaOperacional(ini);
  const pFim = refSemanaOperacional(fim);
  if (pIni && pFim) {
    return `Ciclo ${ciclo} (${pIni.periodo} – ${pFim.periodo})`;
  }
  return `Ciclo ${ciclo}`;
}

export function proximasSemanasOperacionais(
  aposMes: string,
  aposSemana: number,
  horizonte: number,
  empenhoMeses?: string[],
): Array<CivilWeekKey & { indiceOperacional: number }> {
  return semanasAlvoMitigacao(aposMes, aposSemana, horizonte, empenhoMeses, 'inclusive');
}

/**
 * Semanas-alvo do plano de mitigação.
 * - inclusive: inclui a semana de referência (ex.: planejando Jun S1 → Jun S1 + Jun S2)
 * - apos: começa na semana seguinte (ex.: último dado Mai S4 → Jun S1 + Jun S2)
 */
export function semanasAlvoMitigacao(
  mesRef: string,
  semanaRef: number,
  horizonte: number,
  empenhoMeses?: string[],
  modo: 'inclusive' | 'apos' = 'inclusive',
): Array<CivilWeekKey & { indiceOperacional: number }> {
  const lista = listarSemanasCivisControle(empenhoMeses);
  const idx = indiceOperacionalCivil(mesRef, semanaRef, empenhoMeses);
  if (idx == null) return [];
  const start = modo === 'apos' ? idx + 1 : idx;
  const out: Array<CivilWeekKey & { indiceOperacional: number }> = [];
  for (let i = start; i <= lista.length && out.length < horizonte; i++) {
    const civil = lista[i - 1];
    if (!civil) continue;
    out.push({ ...civil, indiceOperacional: i });
  }
  return out;
}

/** Gordura consumida (acima de 1.150) por ciclo operacional concluído ou em curso */
export function gorduraUsadaPeriodoOperacional(
  mon: EmergencialMonitoramento,
  ateIndiceOperacional: number,
  empenhoMeses?: string[],
): number {
  if (ateIndiceOperacional <= 0) return 0;
  const cicloAtual = cicloOperacionalDeIndice(ateIndiceOperacional);
  let total = 0;
  for (let c = 1; c <= cicloAtual; c++) {
    const ini = (c - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
    const fim =
      c === cicloAtual
        ? ateIndiceOperacional
        : c * SEMANAS_POR_CICLO_OPERACIONAL;
    let enviado = 0;
    for (let i = ini; i <= fim; i++) {
      const civil = civilPorIndiceOperacional(i, empenhoMeses);
      if (!civil) continue;
      enviado += totalEnviadoNaSemana(mon, civil.mes, civil.semana);
    }
    total += Math.max(0, enviado - TETO_CICLO_OPERACIONAL);
  }
  return total;
}

/** Jun S1 ↔ Jun S2: entrega invertida em relação ao plano original */
export function deveInverterJunSemanas(
  alvos: Array<{ mes: string; semana: number }>,
): [number, number] | null {
  const junKey = parseMonthKey('Jun/2026');
  const idx1 = alvos.findIndex(
    (a) => parseMonthKey(a.mes) === junKey && a.semana === 1,
  );
  const idx2 = alvos.findIndex(
    (a) => parseMonthKey(a.mes) === junKey && a.semana === 2,
  );
  if (idx1 >= 0 && idx2 >= 0) return [idx1, idx2];
  return null;
}

export function trocarValoresSemanas<T>(arr: T[], i: number, j: number): T[] {
  if (i === j || i < 0 || j < 0 || i >= arr.length || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
