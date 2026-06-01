import { allocatePlans } from './allocation.js';
import {
  estouroAcimaLimite,
  margemAteLimite,
  pctUsoLimite,
} from './limitesControle.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
import { formatMonthKeyPt, getYearMonth, parseMonthKey } from './monthUtils.js';
import { validMonthKeysForPayload } from './payloadAnalysis.js';
import {
  consumptionUnits,
  groupByFamilia,
  type FamiliaGroup,
} from './serviceFamilies.js';
import {
  historyForDistribuicao,
  MES_REFERENCIA_SEGURO,
  TOTAL_MENSAL_EMERGENCIAL_PADRAO,
} from './requisicaoHistorico.js';
import type { ProcessoRiscoItem } from './processTypes.js';
import type { MonthAllocationResult, ServicesPayload } from './serviceTypes.js';
import type { ProcessoEmergencialConfig } from './processTypes.js';

/** Envio semanal por equipamento (Banco de Alimentos) */
export interface EntradaSemanalEquipamento {
  mes: string;
  /** 1–5 (5ª semana quando o mês tem 29–31 dias) */
  semana: number;
  servicoId: string;
  quantidade: number;
}

export interface SaldoSemanalRegistro {
  mes: string;
  semana: number;
  saldo: number;
  registradoEm: string;
}

/** Mês em que começa o controle semanal operacional (ponto zero) */
export const MONITOR_CONTROLE_MES_INICIO = 'Mai/2026';
/** 3ª semana civil do mês (seg–dom); em Mai/2026 = 18–24 (envios ~18–22) */
export const MONITOR_CONTROLE_SEMANA_INICIO = 3;

export interface EmergencialMonitoramento {
  saldoAtual: number | null;
  saldoAtualizadoEm: string | null;
  entradasSemanais: EntradaSemanalEquipamento[];
  /** Mês em acompanhamento; se vazio, usa o 1º plano emergencial ou o mês civil atual */
  mesAtivo: string | null;
  historicoSaldo: SaldoSemanalRegistro[];
  /** Primeira semana (1–5) que entra no ritmo/meta acumulada; anteriores = só registro */
  semanaInicioControle?: number | null;
  /** Mês em que vale semanaInicioControle (meses posteriores contam da S1) */
  mesInicioControle?: string | null;
}

export type MonitorEquipStatus = 'ok' | 'atencao' | 'critico' | 'sem_meta';

export interface EquipamentoMonitorRow {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  /** Teto mensal proporcional (rateio do limite 1.150) */
  metaMensal: number;
  /** Teto semanal proporcional */
  metaSemanal: number;
  semanas: Record<number, number>;
  totalEnviado: number;
  enviadoSemanaAtual: number;
  /** % do limite mensal consumido (>100 = estouro) */
  pctMes: number;
  /** % do limite semanal na semana corrente */
  pctSemana: number;
  /** legado: % acumulado no período de controle — preferir pctMes/pctSemana */
  pctRitmo: number;
  status: MonitorEquipStatus;
}

export interface MonitoramentoResumo {
  mes: string;
  semanaAtual: number;
  semanasNoMes: number;
  /** Primeira semana do mês considerada no ritmo (ponto zero) */
  semanaInicioControle: number;
  semanasNoPeriodoControle: number;
  /** Limite máximo do mês (ex. 1.150) — não é meta a cumprir */
  metaMesTotal: number;
  limiteSemanal: number;
  enviadoMesTotal: number;
  enviadoSemanaAtual: number;
  pctMes: number;
  pctLimiteSemana: number;
  estouroMes: number;
  estouroSemana: number;
  margemMes: number;
  margemSemana: number;
  metaAcumuladaEsperada: number;
  enviadoAcumulado: number;
  pctRitmoGeral: number;
  saldoAtual: number | null;
  saldoAtualizadoEm: string | null;
  /** Saldo ÷ ritmo semanal médio (últimas entradas ou meta/4) */
  autonomiaSemanasSaldo: number | null;
  projecaoSemanasAteMeta: number | null;
  alertas: ProcessoRiscoItem[];
  equipamentos: EquipamentoMonitorRow[];
  familias: FamiliaGroup<EquipamentoMonitorRow>[];
  historicoSaldo: SaldoSemanalRegistro[];
  allocation: MonthAllocationResult | null;
}

export function defaultEmergencialMonitoring(): EmergencialMonitoramento {
  return {
    saldoAtual: null,
    saldoAtualizadoEm: null,
    entradasSemanais: [],
    mesAtivo: MONITOR_CONTROLE_MES_INICIO,
    historicoSaldo: [],
    mesInicioControle: MONITOR_CONTROLE_MES_INICIO,
    semanaInicioControle: MONITOR_CONTROLE_SEMANA_INICIO,
  };
}

export function mergeEmergencialMonitoring(
  partial?: Partial<EmergencialMonitoramento> | null,
  existing?: EmergencialMonitoramento | null,
): EmergencialMonitoramento {
  const base = existing ?? defaultEmergencialMonitoring();
  if (!partial) return { ...base, entradasSemanais: [...base.entradasSemanais] };
  return {
    saldoAtual:
      partial.saldoAtual !== undefined ? partial.saldoAtual : base.saldoAtual,
    saldoAtualizadoEm:
      partial.saldoAtualizadoEm !== undefined
        ? partial.saldoAtualizadoEm
        : base.saldoAtualizadoEm,
    mesAtivo: partial.mesAtivo !== undefined ? partial.mesAtivo : base.mesAtivo,
    entradasSemanais: partial.entradasSemanais ?? base.entradasSemanais,
    historicoSaldo: partial.historicoSaldo ?? base.historicoSaldo ?? [],
    mesInicioControle:
      partial.mesInicioControle !== undefined
        ? partial.mesInicioControle
        : base.mesInicioControle,
    semanaInicioControle:
      partial.semanaInicioControle !== undefined
        ? partial.semanaInicioControle
        : base.semanaInicioControle,
  };
}

/** Semana operacional (1–5) a partir da qual o ritmo e a meta acumulada contam */
export function semanaInicioControleEfetiva(
  mes: string,
  mon: EmergencialMonitoramento,
): number {
  const mesIni = mon.mesInicioControle ?? MONITOR_CONTROLE_MES_INICIO;
  const semIni = mon.semanaInicioControle ?? MONITOR_CONTROLE_SEMANA_INICIO;
  const k = parseMonthKey(mes);
  const k0 = parseMonthKey(mesIni);
  if (k < k0) return 99;
  if (k === k0) return Math.max(1, Math.min(5, semIni));
  return 1;
}

export function semanasNoPeriodoControle(
  semanaAtual: number,
  semanaInicio: number,
): number {
  if (semanaInicio > 99) return 0;
  return Math.max(0, semanaAtual - semanaInicio + 1);
}

export function somaEnviosSemanas(
  semanas: Record<number, number>,
  de: number,
  ate: number,
): number {
  let t = 0;
  for (let w = de; w <= ate; w++) t += semanas[w] ?? 0;
  return t;
}

export function registerSaldoSemanal(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
  saldo: number,
): EmergencialMonitoramento {
  const registradoEm = new Date().toISOString();
  const historico = [...(mon.historicoSaldo ?? [])];
  const mesKey = parseMonthKey(mes);
  const idx = historico.findIndex(
    (h) => parseMonthKey(h.mes) === mesKey && h.semana === semana,
  );
  const entry: SaldoSemanalRegistro = { mes, semana, saldo, registradoEm };
  if (idx >= 0) historico[idx] = entry;
  else historico.push(entry);
  historico.sort(
    (a, b) =>
      parseMonthKey(a.mes) - parseMonthKey(b.mes) || a.semana - b.semana,
  );
  return {
    ...mon,
    saldoAtual: saldo,
    saldoAtualizadoEm: registradoEm,
    historicoSaldo: historico,
  };
}

/** Intervalos seg–dom de cada semana do mês (a partir da 1ª segunda-feira do mês) */
export function calendarWeekRangesInMonth(
  year: number,
  month: number,
): { start: number; end: number }[] {
  const lastDay = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  let firstMonday = 1;
  if (firstDow !== 1) {
    firstMonday = 1 + (firstDow === 0 ? 1 : 8 - firstDow);
  }
  const ranges: { start: number; end: number }[] = [];
  for (let start = firstMonday; start <= lastDay; start += 7) {
    ranges.push({ start, end: Math.min(start + 6, lastDay) });
  }
  return ranges;
}

/** Dias do mês antes da 1ª segunda (ex.: 1–3 em Mai/2026), se houver */
export function leadingDaysBeforeFirstMondayWeek(
  year: number,
  month: number,
): { start: number; end: number } | null {
  const ranges = calendarWeekRangesInMonth(year, month);
  if (!ranges.length || ranges[0].start <= 1) return null;
  return { start: 1, end: ranges[0].start - 1 };
}

export function dayToWeekNumber(
  year: number,
  month: number,
  day: number,
): number {
  const ranges = calendarWeekRangesInMonth(year, month);
  if (!ranges.length) return 1;
  const idx = ranges.findIndex((r) => day >= r.start && day <= r.end);
  if (idx >= 0) return idx + 1;
  if (day < ranges[0].start) return 1;
  return ranges.length;
}

/** Semana civil (seg–dom) do mês em que cai a data */
export function weekOfMonth(date: Date = new Date()): number {
  return dayToWeekNumber(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
}

/** Semana civil dentro do mês monitorado (não usa semana do mês corrente se estiver editando outro mês) */
export function semanaAtualParaMes(mes: string, now: Date = new Date()): number {
  const ym = getYearMonth(mes);
  if (!ym) return weekOfMonth(now);
  const mesKey = ym.year * 100 + ym.month;
  const nowKey = now.getFullYear() * 100 + (now.getMonth() + 1);
  const semanasNoMes = weeksInCalendarMonth(ym.year, ym.month);
  if (mesKey < nowKey) return semanasNoMes;
  if (mesKey > nowKey) return 1;
  return Math.min(weekOfMonth(now), semanasNoMes);
}

export function weeksInCalendarMonth(year: number, month: number): number {
  return calendarWeekRangesInMonth(year, month).length || 4;
}

export function currentMonthLabelPt(date: Date = new Date()): string {
  const key = date.getFullYear() * 100 + (date.getMonth() + 1);
  return formatMonthKeyPt(key);
}

export function resolveMesMonitoramento(
  emergencial: ProcessoEmergencialConfig,
  now: Date = new Date(),
): string {
  const explicit = emergencial.monitoramento?.mesAtivo?.trim();
  if (explicit && parseMonthKey(explicit) > 0) return explicit;
  const planMatch = emergencial.plans.find(
    (p) => parseMonthKey(p.mes) === parseMonthKey(currentMonthLabelPt(now)),
  );
  if (planMatch) return planMatch.mes;
  if (emergencial.plans.length) return emergencial.plans[0].mes;
  return currentMonthLabelPt(now);
}

export function getWeeklyQty(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
  servicoId: string,
): number {
  const mesKey = parseMonthKey(mes);
  return mon.entradasSemanais
    .filter(
      (e) =>
        parseMonthKey(e.mes) === mesKey &&
        e.semana === semana &&
        e.servicoId === servicoId,
    )
    .reduce((s, e) => s + (e.quantidade || 0), 0);
}

export function upsertWeeklyQty(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
  servicoId: string,
  quantidade: number,
): EmergencialMonitoramento {
  const mesKey = parseMonthKey(mes);
  const rest = mon.entradasSemanais.filter(
    (e) =>
      !(
        parseMonthKey(e.mes) === mesKey &&
        e.semana === semana &&
        e.servicoId === servicoId
      ),
  );
  const entradas = [...rest];
  if (quantidade > 0) {
    entradas.push({ mes, semana, servicoId, quantidade });
  }
  return { ...mon, entradasSemanais: entradas };
}

function statusFromLimites(pctMes: number, pctSemana: number): MonitorEquipStatus {
  if (pctMes > 100 || pctSemana > 100) return 'critico';
  if (pctMes > 90 || pctSemana > 90) return 'atencao';
  return 'ok';
}

export interface BuildMonitorOptions {
  now?: Date;
  allocateOptions?: Parameters<typeof allocatePlans>[3];
}

export function buildMonitoramentoResumo(
  payload: ServicesPayload,
  options?: BuildMonitorOptions,
): MonitoramentoResumo {
  const now = options?.now ?? new Date();
  const cfg = payload.emergencial;
  const mon = mergeEmergencialMonitoring(cfg.monitoramento);
  const mes = resolveMesMonitoramento(cfg, now);
  const ym = parseMonthKey(mes);
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  const semanasNoMes =
    year > 0 && month > 0 ? weeksInCalendarMonth(year, month) : 4;
  const semanaAtual = semanaAtualParaMes(mes, now);
  const semanaInicioControle = semanaInicioControleEfetiva(mes, mon);
  const semanasNoPeriodoControleVal = semanasNoPeriodoControle(
    semanaAtual,
    semanaInicioControle,
  );

  const planMes =
    cfg.plans.find((p) => parseMonthKey(p.mes) === ym) ??
    cfg.plans.find((p) => parseMonthKey(p.mes) === parseMonthKey(MES_REFERENCIA_SEGURO));
  const metaMesTotal =
    planMes?.totalDisponivel ?? cfg.cestasPorMes ?? TOTAL_MENSAL_EMERGENCIAL_PADRAO;

  const histDistrib = historyForDistribuicao(payload);

  let allocation: MonthAllocationResult | null = null;
  if (payload.services.length && histDistrib.length && planMes) {
    const janela = resolveJanelaAnaliseMeses(payload.settings?.methodology);
    const validMonthKeys = validMonthKeysForPayload(payload);
    const results = allocatePlans([planMes], payload.services, histDistrib, {
      validMonthKeys,
      mediaWindowMonths: janela,
      excluirMesDistribuicao: true,
      ...options?.allocateOptions,
    });
    allocation = results[0] ?? null;
  }

  const metaPorEquip = new Map<string, number>();
  if (allocation) {
    for (const l of allocation.linhas) {
      metaPorEquip.set(l.servicoId, l.alocado);
    }
  }

  const units = consumptionUnits(payload.services);
  const equipamentos: EquipamentoMonitorRow[] = units.map((s) => {
    const metaMensal = metaPorEquip.get(s.id) ?? 0;
    const metaSemanal =
      metaMensal > 0 ? Math.round(metaMensal / semanasNoMes) : 0;
    const semanas: Record<number, number> = {};
    let totalEnviado = 0;
    for (let w = 1; w <= semanasNoMes; w++) {
      const q = getWeeklyQty(mon, mes, w, s.id);
      semanas[w] = q;
      totalEnviado += q;
    }
    const enviadoNoControle = somaEnviosSemanas(
      semanas,
      semanaInicioControle,
      semanasNoMes,
    );
    const enviadoRitmo = somaEnviosSemanas(
      semanas,
      semanaInicioControle,
      semanaAtual,
    );
    const enviadoSemanaAtual = semanas[semanaAtual] ?? 0;
    const metaAcumEquip =
      metaSemanal * semanasNoPeriodoControleVal;
    const pctMes = pctUsoLimite(enviadoNoControle, metaMensal);
    const pctSemana = pctUsoLimite(enviadoSemanaAtual, metaSemanal);
    const pctRitmo =
      metaAcumEquip > 0 ? (enviadoRitmo / metaAcumEquip) * 100 : 0;
    const status: MonitorEquipStatus =
      metaMensal <= 0 ? 'sem_meta' : statusFromLimites(pctMes, pctSemana);
    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      metaMensal,
      metaSemanal,
      semanas,
      totalEnviado,
      enviadoSemanaAtual,
      pctMes,
      pctSemana,
      pctRitmo,
      status,
    };
  });

  const enviadoMesTotal = equipamentos.reduce(
    (s, e) =>
      s +
      somaEnviosSemanas(e.semanas, semanaInicioControle, semanasNoMes),
    0,
  );
  const metaAcumuladaEsperada = Math.round(
    (metaMesTotal / semanasNoMes) * semanasNoPeriodoControleVal,
  );
  const enviadoAcumulado = equipamentos.reduce(
    (s, e) =>
      s + somaEnviosSemanas(e.semanas, semanaInicioControle, semanaAtual),
    0,
  );
  const limiteSemanal =
    semanasNoMes > 0 ? Math.round(metaMesTotal / semanasNoMes) : 0;
  const enviadoSemanaAtual = equipamentos.reduce(
    (s, e) => s + (e.semanas[semanaAtual] ?? 0),
    0,
  );
  const pctMes = pctUsoLimite(enviadoMesTotal, metaMesTotal);
  const pctLimiteSemana = pctUsoLimite(enviadoSemanaAtual, limiteSemanal);
  const estouroMes = estouroAcimaLimite(enviadoMesTotal, metaMesTotal);
  const estouroSemana = estouroAcimaLimite(enviadoSemanaAtual, limiteSemanal);
  const margemMes = margemAteLimite(enviadoMesTotal, metaMesTotal);
  const margemSemana = margemAteLimite(enviadoSemanaAtual, limiteSemanal);
  const pctRitmoGeral =
    metaAcumuladaEsperada > 0
      ? (enviadoAcumulado / metaAcumuladaEsperada) * 100
      : 0;

  const ritmoSemanal =
    semanasNoPeriodoControleVal > 0
      ? enviadoAcumulado / semanasNoPeriodoControleVal
      : limiteSemanal;
  const saldo = mon.saldoAtual;
  const autonomiaSemanasSaldo =
    saldo != null && ritmoSemanal > 0 ? saldo / ritmoSemanal : null;
  const faltam = margemMes;
  const projecaoSemanasAteMeta =
    ritmoSemanal > 0 && margemMes > 0
      ? margemMes / ritmoSemanal
      : null;

  const alertas: ProcessoRiscoItem[] = [];

  if (estouroMes > 0) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Estouro do limite mensal',
      descricao: `Enviado ${enviadoMesTotal} cestas — ${estouroMes} acima do teto de ${metaMesTotal} (${pctMes.toFixed(0)}% do limite). Reduza envios ou revise lançamentos.`,
    });
  } else if (pctMes > 90 && metaMesTotal > 0) {
    alertas.push({
      nivel: 'alto',
      titulo: 'Próximo do teto mensal',
      descricao: `Uso ${pctMes.toFixed(0)}% do limite (${enviadoMesTotal}/${metaMesTotal}). Margem: ${margemMes} cestas.`,
    });
  }

  if (estouroSemana > 0) {
    alertas.push({
      nivel: 'critico',
      titulo: `Estouro na semana ${semanaAtual}`,
      descricao: `S${semanaAtual}: ${enviadoSemanaAtual} cestas — ${estouroSemana} acima do teto semanal (~${limiteSemanal}, ${pctLimiteSemana.toFixed(0)}%).`,
    });
  } else if (pctLimiteSemana > 90 && limiteSemanal > 0) {
    alertas.push({
      nivel: 'alto',
      titulo: `Semana ${semanaAtual} perto do teto`,
      descricao: `${enviadoSemanaAtual}/${limiteSemanal} cestas (${pctLimiteSemana.toFixed(0)}%). Margem semanal: ${margemSemana}.`,
    });
  }

  const acimaLimite = equipamentos.filter(
    (e) => e.status === 'critico' && e.metaMensal > 0,
  );
  if (acimaLimite.length) {
    alertas.push({
      nivel: 'critico',
      titulo: `${acimaLimite.length} equipamento(s) acima do limite`,
      descricao: acimaLimite
        .slice(0, 5)
        .map((e) => {
          const partes: string[] = [];
          if (e.pctMes > 100) partes.push(`mês ${e.pctMes.toFixed(0)}%`);
          if (e.pctSemana > 100) partes.push(`S${semanaAtual} ${e.pctSemana.toFixed(0)}%`);
          return `${e.servicoNome} (${partes.join(', ')})`;
        })
        .join('; '),
    });
  }

  const pertoLimite = equipamentos.filter((e) => e.status === 'atencao');
  if (pertoLimite.length >= 3) {
    alertas.push({
      nivel: 'moderado',
      titulo: `${pertoLimite.length} equipamento(s) perto do teto`,
      descricao: 'Revise cotas antes do fechamento da semana.',
    });
  }

  if (saldo != null) {
    if (saldo < metaMesTotal * 0.25) {
      alertas.push({
        nivel: 'critico',
        titulo: 'Saldo crítico no Banco',
        descricao: `Saldo ${saldo} cobre menos de 25% do limite mensal (${metaMesTotal}).`,
      });
    } else if (
      autonomiaSemanasSaldo != null &&
      autonomiaSemanasSaldo < semanasNoMes - semanaAtual + 1 &&
      pctMes > 70
    ) {
      alertas.push({
        nivel: 'alto',
        titulo: 'Saldo pode não durar com este ritmo de saída',
        descricao: `Autonomia ~${autonomiaSemanasSaldo.toFixed(1)} sem. ao ritmo ${ritmoSemanal.toFixed(0)}/sem.`,
      });
    }
  } else {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Saldo não informado',
      descricao: 'Registre o saldo para monitorar ruptura de estoque.',
    });
  }

  if (
    projecaoSemanasAteMeta != null &&
    projecaoSemanasAteMeta < semanasNoMes - semanaAtual &&
    pctMes < 100
  ) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Margem mensal apertada',
      descricao: `Ao ritmo atual (~${ritmoSemanal.toFixed(0)}/sem), a margem de ${margemMes} cestas pode acabar antes do fim do mês.`,
    });
  }

  const familias = groupByFamilia(equipamentos, payload.services);

  return {
    mes,
    semanaAtual,
    semanasNoMes,
    semanaInicioControle,
    semanasNoPeriodoControle: semanasNoPeriodoControleVal,
    metaMesTotal,
    limiteSemanal,
    enviadoMesTotal,
    enviadoSemanaAtual,
    pctMes,
    pctLimiteSemana,
    estouroMes,
    estouroSemana,
    margemMes,
    margemSemana,
    metaAcumuladaEsperada,
    enviadoAcumulado,
    pctRitmoGeral,
    saldoAtual: saldo,
    saldoAtualizadoEm: mon.saldoAtualizadoEm,
    autonomiaSemanasSaldo,
    projecaoSemanasAteMeta,
    alertas,
    equipamentos,
    familias,
    historicoSaldo: mon.historicoSaldo ?? [],
    allocation,
  };
}

export function weekDateRangeLabel(
  year: number,
  month: number,
  semana: number,
): string {
  const ranges = calendarWeekRangesInMonth(year, month);
  const r = ranges[semana - 1];
  if (!r) return `Sem. ${semana}`;
  return `${r.start}–${r.end}`;
}
