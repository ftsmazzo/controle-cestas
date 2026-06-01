import { allocatePlans } from './allocation.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
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
/** Semana operacional 15–21 (contém 18/mai) — envios 18–22 e 25–29 entram nas semanas 3–4+ */
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
  metaMensal: number;
  metaSemanal: number;
  semanas: Record<number, number>;
  totalEnviado: number;
  pctMes: number;
  /** % do que deveria ter sido enviado até a semana corrente */
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
  metaMesTotal: number;
  enviadoMesTotal: number;
  pctMes: number;
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

/** Semanas operacionais (como planilha SEMAS): 1–7, 8–14, 15–21, 22–28, 29–fim */
export function weekOfMonth(date: Date = new Date()): number {
  const d = date.getDate();
  if (d <= 7) return 1;
  if (d <= 14) return 2;
  if (d <= 21) return 3;
  if (d <= 28) return 4;
  return 5;
}

export function weeksInCalendarMonth(year: number, month: number): number {
  const last = new Date(year, month, 0).getDate();
  return last > 28 ? 5 : 4;
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

function statusFromPct(pctRitmo: number, pctMes: number): MonitorEquipStatus {
  if (pctMes >= 100) return 'ok';
  if (pctRitmo < 70 || pctMes < 50) return 'critico';
  if (pctRitmo < 90 || pctMes < 75) return 'atencao';
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
  const semanaAtual = Math.min(weekOfMonth(now), semanasNoMes);
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
    const metaAcumEquip =
      metaSemanal * semanasNoPeriodoControleVal;
    const pctMes = metaMensal > 0 ? (enviadoNoControle / metaMensal) * 100 : 0;
    const pctRitmo =
      metaAcumEquip > 0 ? (enviadoRitmo / metaAcumEquip) * 100 : 0;
    const status: MonitorEquipStatus =
      metaMensal <= 0 ? 'sem_meta' : statusFromPct(pctRitmo, pctMes);
    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      metaMensal,
      metaSemanal,
      semanas,
      totalEnviado,
      pctMes,
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
  const pctMes = metaMesTotal > 0 ? (enviadoMesTotal / metaMesTotal) * 100 : 0;
  const pctRitmoGeral =
    metaAcumuladaEsperada > 0
      ? (enviadoAcumulado / metaAcumuladaEsperada) * 100
      : 0;

  const ritmoSemanal =
    semanasNoPeriodoControleVal > 0
      ? enviadoAcumulado / semanasNoPeriodoControleVal
      : metaMesTotal / semanasNoMes;
  const saldo = mon.saldoAtual;
  const autonomiaSemanasSaldo =
    saldo != null && ritmoSemanal > 0 ? saldo / ritmoSemanal : null;
  const faltam = Math.max(0, metaMesTotal - enviadoMesTotal);
  const projecaoSemanasAteMeta =
    faltam > 0 && ritmoSemanal > 0 ? faltam / ritmoSemanal : null;

  const alertas: ProcessoRiscoItem[] = [];

  if (pctRitmoGeral < 70 && metaMesTotal > 0) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Ritmo abaixo do esperado na semana',
      descricao: `Desde a semana ${semanaInicioControle} (ponto zero) até a S${semanaAtual} de ${mes}, o enviado (${enviadoAcumulado}) está em ${pctRitmoGeral.toFixed(0)}% do esperado (${metaAcumuladaEsperada}). Risco de não cumprir a meta mensal de ${metaMesTotal} cestas.`,
    });
  } else if (pctRitmoGeral < 90 && metaMesTotal > 0) {
    alertas.push({
      nivel: 'alto',
      titulo: 'Atenção ao ritmo semanal',
      descricao: `Enviado acumulado ${enviadoAcumulado} vs. esperado ${metaAcumuladaEsperada} (${pctRitmoGeral.toFixed(0)}%).`,
    });
  }

  if (pctMes >= 100 && metaMesTotal > 0) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Meta mensal já atingida ou ultrapassada',
      descricao: `Total enviado no mês: ${enviadoMesTotal} (meta ${metaMesTotal}).`,
    });
  }

  const atrasados = equipamentos.filter((e) => e.status === 'critico');
  if (atrasados.length) {
    alertas.push({
      nivel: 'alto',
      titulo: `${atrasados.length} equipamento(s) crítico(s)`,
      descricao: atrasados
        .slice(0, 5)
        .map((e) => `${e.servicoNome} (${e.pctMes.toFixed(0)}% da meta)`)
        .join('; '),
    });
  }

  if (saldo != null) {
    if (saldo < metaMesTotal * 0.25) {
      alertas.push({
        nivel: 'critico',
        titulo: 'Saldo crítico no Banco',
        descricao: `Saldo ${saldo} cobre menos de 25% da meta mensal (${metaMesTotal}). Atualize o estoque ou reduza o ritmo de saída.`,
      });
    } else if (
      autonomiaSemanasSaldo != null &&
      autonomiaSemanasSaldo < semanasNoMes - semanaAtual + 1
    ) {
      alertas.push({
        nivel: 'alto',
        titulo: 'Saldo pode não durar até o fim do mês',
        descricao: `Autonomia estimada: ${autonomiaSemanasSaldo.toFixed(1)} semanas (ritmo médio ${ritmoSemanal.toFixed(0)}/sem).`,
      });
    }
  } else {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Saldo não informado',
      descricao: 'O Banco deve registrar o saldo atual para monitorar ruptura.',
    });
  }

  if (projecaoSemanasAteMeta != null && projecaoSemanasAteMeta > semanasNoMes - semanaAtual) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Projeção: meta mensal em risco',
      descricao: `Ao ritmo atual, faltariam ~${projecaoSemanasAteMeta.toFixed(1)} semanas para completar ${faltam} cestas; restam ${semanasNoMes - semanaAtual} semana(s) no mês.`,
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
    enviadoMesTotal,
    pctMes,
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
  const last = new Date(year, month, 0).getDate();
  const ranges: [number, number][] = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
    [29, last],
  ];
  const r = ranges[semana - 1];
  if (!r) return `Sem. ${semana}`;
  return `${r[0]}–${r[1]}`;
}
