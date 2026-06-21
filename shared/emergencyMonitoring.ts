import { allocatePlans } from './allocation.js';
import {
  computeAutonomiaOperacional,
  suggestEmpenhoMeses,
  EMPENHO_DURACAO_MESES_PADRAO,
} from './empenhoControle.js';
import {
  SEMANAS_POR_CICLO_OPERACIONAL,
  TETO_CICLO_OPERACIONAL,
  cicloOperacionalDeIndice,
  civilPorIndiceOperacional,
  enviadoCicloOperacionalAte,
  indiceOperacionalCivil,
  labelCicloOperacional,
  refSemanaOperacionalCivil,
  tetoMaximoCicloOperacional,
} from './operationalWeeks.js';
import {
  labelFonteProjecao,
  limiteSemanaCicloOperacional,
  projecaoEquipamentoCiclo,
  projecaoFimCicloOperacional,
  type FonteProjecaoOperacional,
} from './projecaoOperacionalCiclo.js';
import {
  buildSaudeEmpenhoProcesso,
  type SaudeEmpenhoProcesso,
} from './saudeEmpenhoProcesso.js';
import {
  estouroAcimaLimite,
  margemAteLimite,
  pctUsoLimite,
  projecaoFimMes,
  semanasAteLimite,
} from './limitesControle.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
import { formatMonthKeyPt, getYearMonth, parseMonthKey } from './monthUtils.js';
import { getWeeklyQty } from './weeklyQty.js';
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
import { isServicoCotaMensalUnica } from './coderpRequisitanteRules.js';
import {
  planejadoFlexJunSemana,
  totalFlexSemana,
} from './conformidadePlano.js';

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

export {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
} from './monitorConstants.js';
export {
  calendarWeekRangesInMonth,
  weeksInCalendarMonth,
} from './calendarWeeks.js';
export { totalEnviadoNaSemana } from './weeklyQty.js';

import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
} from './monitorConstants.js';
import {
  calendarWeekRangesInMonth,
  weeksInCalendarMonth,
} from './calendarWeeks.js';
import { totalEnviadoNaSemana } from './weeklyQty.js';

export interface FixosReaisPorCiclo {
  SAICA?: number;
  WARAOS?: number;
  'MÃOS DADAS'?: number;
}

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
  /** Ajuste de saldo por perdas (positivo = perda real a descontar do rateio) */
  perdaAjuste?: number | null;
  /** Valores reais lançados dos fixos por ciclo (captura sobras quando pediram menos) */
  fixosReaisPorCiclo?: Record<number, FixosReaisPorCiclo>;
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
  /** Projeção de envio até fim do mês ao ritmo recente */
  projecaoMes: number;
  pctProjecaoMes: number;
  estouroProjetadoMes: number;
  /** Texto curto para decisão na próxima semana */
  alertaEquip: string | null;
  status: MonitorEquipStatus;
  /** SAICA, WARAOS, Mãos Dadas — sem teto semanal */
  cotaMensalUnica: boolean;
}

export interface MonitoramentoResumo {
  mes: string;
  /** Semana civil de hoje no mês monitorado */
  semanaAtual: number;
  /** Semana escolhida no painel (registro / análise) */
  semanaAnalise: number;
  /** Última semana do mês com envio lançado */
  ultimaSemanaComDados: number;
  /** Semana usada no ritmo e projeção (histórico até aqui) */
  semanaBaseRitmo: number;
  /** Analisando semana futura em relação ao histórico */
  modoPlanejamento: boolean;
  enviadoAteBaseRitmo: number;
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
  /** Projeção total do mês ao ritmo médio recente */
  projecaoMesTotal: number;
  pctProjecaoMes: number;
  estouroProjetadoMes: number;
  ritmoSemanalMedio: number;
  semanasRestantesNoMes: number;
  /** Semana civil em que o teto mensal estoura (projeção) */
  semanaProjetadaEstouro: number | null;
  autonomiaDiasSaldo: number | null;
  /** Ritmo pessimista: max(média, semana atual) */
  ritmoSemanalReferencia: number;
  cestasDisponiveisEmpenho: number;
  semanasPeriodoRestantes: number;
  semanasPeriodoTotal: number;
  empenhoAcabaAntesDoPeriodo: boolean;
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
  /** Métricas alinhadas ao ciclo operacional (4 sem. qua–ter, teto 1.150) */
  usaCicloOperacional?: boolean;
  cicloAtual?: number;
  labelCiclo?: string;
  labelSemanaAnalise?: string;
  semanaNoCiclo?: number;
  /** Mês civil exibido na grade (pode diferir do mês de análise) */
  mesExibicao?: string;
  /** Plano/teto operacional — não ritmo inercial */
  projecaoFonte?: FonteProjecaoOperacional;
  usaPlanoOperacional?: boolean;
  ritmoOperacionalForward?: number;
  novoCicloPlanejamento?: boolean;
  /** Semanas restantes no ciclo (inclui a atual) */
  semanasRestantesCiclo?: number;
  /** Plano flexível para a semana em análise */
  planejadoSemanaAtual?: number | null;
  /** Lançamento flexível da semana (sem SAICA/WARAOS/Mãos Dadas) */
  enviadoSemanaFlex?: number;
  /** Plano flexível Jun S1/S2 quando aplicável */
  planejadoSemanaFlex?: number | null;
  limiteSemanaFonte?: 'plano' | 'margem_ciclo';
  /** Empenho cumulativo 16 sem. / 5.000 — não zera ao mudar ciclo */
  saudeEmpenho?: SaudeEmpenhoProcesso;
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
    perdaAjuste:
      partial.perdaAjuste !== undefined ? partial.perdaAjuste : base.perdaAjuste,
    fixosReaisPorCiclo:
      partial.fixosReaisPorCiclo !== undefined
        ? partial.fixosReaisPorCiclo
        : base.fixosReaisPorCiclo,
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

export { getWeeklyQty } from './weeklyQty.js';

/** Maior número de semana com quantidade > 0 no mês */
export function ultimaSemanaComDadosNoMes(
  mon: EmergencialMonitoramento,
  mes: string,
  desdeSemana: number = 1,
): number {
  const mesKey = parseMonthKey(mes);
  let max = 0;
  for (const e of mon.entradasSemanais) {
    if (
      parseMonthKey(e.mes) === mesKey &&
      e.semana >= desdeSemana &&
      (e.quantidade || 0) > 0
    ) {
      max = Math.max(max, e.semana);
    }
  }
  return max;
}

export function clampSemanaMes(semana: number, semanasNoMes: number): number {
  return Math.max(1, Math.min(semana, Math.max(1, semanasNoMes)));
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

function alertaEquipamentoTexto(
  pctMes: number,
  pctSemana: number,
  pctProjecao: number,
  estouroProj: number,
  semanasRestantes: number,
): string | null {
  if (pctMes > 100 || pctSemana > 100) {
    return 'Já acima do teto — reduzir na próxima semana.';
  }
  if (pctProjecao > 100 || estouroProj > 0) {
    return `Ritmo atual estoura o teto do mês antes do fim (projeção ${pctProjecao.toFixed(0)}%). Ajustar na próxima semana.`;
  }
  if (pctSemana > 90) {
    return 'Semana perto do teto — não repetir este volume.';
  }
  if (pctProjecao > 88) {
    return `Projeção ${pctProjecao.toFixed(0)}% do teto — ajustar já na próxima semana.`;
  }
  if (pctMes > 85 && pctSemana > 70) {
    return 'Uso mensal e semanal altos — monitorar de perto.';
  }
  return null;
}

function statusFromLimites(
  pctMes: number,
  pctSemana: number,
  pctProjecao: number,
): MonitorEquipStatus {
  if (pctMes > 100 || pctSemana > 100 || pctProjecao > 100) return 'critico';
  if (pctProjecao > 92 || pctMes > 90 || pctSemana > 90) return 'atencao';
  return 'ok';
}

export interface UltimoLancamentoSemanal {
  mes: string;
  semana: number;
  totalCestas: number;
}

/** Último par mês+semana com envio lançado (qualquer quantidade > 0). */
export function ultimoLancamentoSemanal(
  mon: EmergencialMonitoramento,
): UltimoLancamentoSemanal | null {
  let bestKey = -1;
  let bestSem = 0;
  let bestMes = '';
  for (const e of mon.entradasSemanais) {
    if ((e.quantidade || 0) <= 0) continue;
    const mk = parseMonthKey(e.mes);
    if (mk <= 0) continue;
    if (mk > bestKey || (mk === bestKey && e.semana > bestSem)) {
      bestKey = mk;
      bestSem = e.semana;
      bestMes = e.mes;
    }
  }
  if (!bestMes) return null;
  const totalCestas = mon.entradasSemanais
    .filter(
      (e) => parseMonthKey(e.mes) === bestKey && e.semana === bestSem,
    )
    .reduce((s, e) => s + (e.quantidade || 0), 0);
  return { mes: bestMes, semana: bestSem, totalCestas };
}

/**
 * Posição operacional para KPIs e mitigação.
 * KPIs ficam no último lançamento salvo, exceto quando a grade aponta uma semana à frente (planejamento).
 */
export function resolveContextoOperacionalAnalise(
  mon: EmergencialMonitoramento,
  mesTabela: string,
  semanaTabela: number,
  empenhoMeses?: string[],
): { mes: string; semana: number; indiceOperacional: number | null } {
  const ultimo = ultimoLancamentoSemanal(mon);
  if (ultimo) {
    const idxUltimo = indiceOperacionalCivil(
      ultimo.mes,
      ultimo.semana,
      empenhoMeses,
    );
    const idxTabela = indiceOperacionalCivil(
      mesTabela,
      semanaTabela,
      empenhoMeses,
    );
    if (idxTabela != null && idxUltimo != null && idxTabela > idxUltimo) {
      return {
        mes: mesTabela,
        semana: semanaTabela,
        indiceOperacional: idxTabela,
      };
    }
    return {
      mes: ultimo.mes,
      semana: ultimo.semana,
      indiceOperacional: idxUltimo,
    };
  }
  const mesIni = mon.mesInicioControle ?? MONITOR_CONTROLE_MES_INICIO;
  const semIni = mon.semanaInicioControle ?? MONITOR_CONTROLE_SEMANA_INICIO;
  const idx =
    indiceOperacionalCivil(mesTabela, semanaTabela, empenhoMeses) ??
    indiceOperacionalCivil(mesIni, semIni, empenhoMeses);
  return {
    mes: mesTabela || mesIni,
    semana: semanaTabela || semIni,
    indiceOperacional: idx,
  };
}

/** Painel público: sempre ancora no último lançamento salvo (linha do tempo operacional). */
export function resolveContextoPainelPublico(
  cfg: ProcessoEmergencialConfig,
  now: Date = new Date(),
): { mes: string; semanaReferencia?: number; ultimoLancamento: UltimoLancamentoSemanal | null } {
  const mon = mergeEmergencialMonitoring(cfg.monitoramento);
  const ultimo = ultimoLancamentoSemanal(mon);
  if (ultimo) {
    return {
      mes: ultimo.mes,
      semanaReferencia: ultimo.semana,
      ultimoLancamento: ultimo,
    };
  }
  const mesAtivo = resolveMesMonitoramento(cfg, now);
  const semIni = semanaInicioControleEfetiva(mesAtivo, mon);
  return { mes: mesAtivo, semanaReferencia: semIni, ultimoLancamento: null };
}

export interface BuildMonitorOptions {
  now?: Date;
  /** Força mês monitorado (ex.: último lançamento salvo no painel público) */
  mesReferencia?: string;
  /** Semana selecionada no painel (importação / leitura); mantém histórico nas projeções */
  semanaReferencia?: number;
  /** Mês da grade de lançamentos (quando diferente do mês de análise) */
  mesExibicao?: string;
  /** KPIs e alertas pelo ciclo operacional de 4 semanas (padrão: true) */
  usarCicloOperacional?: boolean;
  allocateOptions?: Parameters<typeof allocatePlans>[3];
}

export function buildMonitoramentoResumo(
  payload: ServicesPayload,
  options?: BuildMonitorOptions,
): MonitoramentoResumo {
  const now = options?.now ?? new Date();
  const cfg = payload.emergencial;
  const mon = mergeEmergencialMonitoring(cfg.monitoramento);
  const mes =
    options?.mesReferencia?.trim() || resolveMesMonitoramento(cfg, now);
  const ym = parseMonthKey(mes);
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  const semanasNoMes =
    year > 0 && month > 0 ? weeksInCalendarMonth(year, month) : 4;
  const semanaAtual = semanaAtualParaMes(mes, now);
  const semanaAnalise = clampSemanaMes(
    options?.semanaReferencia ?? semanaAtual,
    semanasNoMes,
  );
  const semanaInicioControle = semanaInicioControleEfetiva(mes, mon);
  const ultimaSemanaComDados = ultimaSemanaComDadosNoMes(
    mon,
    mes,
    semanaInicioControle,
  );
  const analiseTemDados = totalEnviadoNaSemana(mon, mes, semanaAnalise) > 0;
  const semanaBaseRitmo =
    analiseTemDados
      ? semanaAnalise
      : ultimaSemanaComDados > 0
        ? ultimaSemanaComDados
        : semanaAnalise;
  const modoPlanejamento =
    ultimaSemanaComDados > 0 &&
    semanaAnalise > ultimaSemanaComDados &&
    !analiseTemDados;
  let semanasNoPeriodoControleVal = semanasNoPeriodoControle(
    semanaBaseRitmo,
    semanaInicioControle,
  );

  const planMes =
    cfg.plans.find((p) => parseMonthKey(p.mes) === ym) ??
    cfg.plans.find((p) => parseMonthKey(p.mes) === parseMonthKey(MES_REFERENCIA_SEGURO));
  let metaMesTotal =
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

  let semanasRestantesNoMes = Math.max(0, semanasNoMes - semanaBaseRitmo);

  const usarCiclo =
    options?.usarCicloOperacional !== false;
  const empenhoMesesAnalise =
    cfg.empenhoMeses?.length
      ? cfg.empenhoMeses
      : suggestEmpenhoMeses(
          cfg.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );

  const units = consumptionUnits(payload.services);
  let equipamentos: EquipamentoMonitorRow[] = units.map((s) => {
    const metaMensal = metaPorEquip.get(s.id) ?? 0;
    const cotaMensalUnica = isServicoCotaMensalUnica(s);
    const metaSemanal =
      cotaMensalUnica || metaMensal <= 0
        ? 0
        : Math.round(metaMensal / semanasNoMes);
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
      semanaBaseRitmo,
    );
    const enviadoSemanaAtual = semanas[semanaAnalise] ?? 0;
    const metaAcumEquip =
      metaSemanal * semanasNoPeriodoControleVal;
    const pctMes = pctUsoLimite(enviadoNoControle, metaMensal);
    const pctSemana = cotaMensalUnica
      ? 0
      : pctUsoLimite(enviadoSemanaAtual, metaSemanal);
    const pctRitmo =
      metaAcumEquip > 0 ? (enviadoRitmo / metaAcumEquip) * 100 : 0;
    const ritmoEquip =
      semanasNoPeriodoControleVal > 0
        ? enviadoRitmo / semanasNoPeriodoControleVal
        : enviadoSemanaAtual;
    const projecaoMes = projecaoFimMes(
      enviadoNoControle,
      ritmoEquip,
      semanasRestantesNoMes,
    );
    const pctProjecaoMes = pctUsoLimite(projecaoMes, metaMensal);
    const estouroProjetadoMes = estouroAcimaLimite(projecaoMes, metaMensal);
    const alertaEquip =
      metaMensal <= 0
        ? null
        : cotaMensalUnica
          ? pctMes > 100 || pctProjecaoMes > 100
            ? 'Acima da cota mensal do ciclo — conferir lançamento único.'
            : pctProjecaoMes > 88
              ? 'Projeção do ciclo alta — cota mensal única.'
              : null
          : alertaEquipamentoTexto(
              pctMes,
              pctSemana,
              pctProjecaoMes,
              estouroProjetadoMes,
              semanasRestantesNoMes,
            );
    const status: MonitorEquipStatus =
      metaMensal <= 0
        ? 'sem_meta'
        : cotaMensalUnica
          ? statusFromLimites(pctMes, 0, pctProjecaoMes)
          : statusFromLimites(pctMes, pctSemana, pctProjecaoMes);
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
      projecaoMes,
      pctProjecaoMes,
      estouroProjetadoMes,
      alertaEquip,
      status,
      cotaMensalUnica,
    };
  });

  let enviadoMesTotal = equipamentos.reduce(
    (s, e) =>
      s +
      somaEnviosSemanas(e.semanas, semanaInicioControle, semanasNoMes),
    0,
  );
  let metaAcumuladaEsperada = Math.round(
    (metaMesTotal / semanasNoMes) * semanasNoPeriodoControleVal,
  );
  let enviadoAteBaseRitmo = equipamentos.reduce(
    (s, e) =>
      s + somaEnviosSemanas(e.semanas, semanaInicioControle, semanaBaseRitmo),
    0,
  );
  let enviadoAcumulado = enviadoAteBaseRitmo;
  let limiteSemanal =
    semanasNoMes > 0 ? Math.round(metaMesTotal / semanasNoMes) : 0;
  let enviadoSemanaAtual = totalEnviadoNaSemana(mon, mes, semanaAnalise);
  let pctMes = pctUsoLimite(enviadoMesTotal, metaMesTotal);
  let pctLimiteSemana = pctUsoLimite(enviadoSemanaAtual, limiteSemanal);
  let estouroMes = estouroAcimaLimite(enviadoMesTotal, metaMesTotal);
  let estouroSemana = estouroAcimaLimite(enviadoSemanaAtual, limiteSemanal);
  let margemMes = margemAteLimite(enviadoMesTotal, metaMesTotal);
  let margemSemana = margemAteLimite(enviadoSemanaAtual, limiteSemanal);
  let pctRitmoGeral =
    metaAcumuladaEsperada > 0
      ? (enviadoAcumulado / metaAcumuladaEsperada) * 100
      : 0;

  let ritmoSemanalMedio =
    semanasNoPeriodoControleVal > 0
      ? enviadoAcumulado / semanasNoPeriodoControleVal
      : enviadoSemanaAtual > 0
        ? enviadoSemanaAtual
        : 0;
  let projecaoMesTotal = projecaoFimMes(
    enviadoAteBaseRitmo,
    ritmoSemanalMedio,
    semanasRestantesNoMes,
  );
  let pctProjecaoMes = pctUsoLimite(projecaoMesTotal, metaMesTotal);
  let estouroProjetadoMes = estouroAcimaLimite(projecaoMesTotal, metaMesTotal);
  const semanasAteTeto = semanasAteLimite(margemMes, ritmoSemanalMedio);
  let semanaProjetadaEstouro =
    semanasAteTeto != null && semanasAteTeto < semanasRestantesNoMes + 0.5
      ? Math.min(
          semanasNoMes,
          semanaBaseRitmo + Math.max(1, Math.ceil(semanasAteTeto)),
        )
      : null;

  const ritmoSemanal = ritmoSemanalMedio || limiteSemanal;
  const saldo = mon.saldoAtual;
  const autonomiaOp = computeAutonomiaOperacional(
    payload,
    ritmoSemanalMedio,
    enviadoSemanaAtual,
    mes,
    semanaAnalise,
  );
  let autonomiaSemanasSaldo = autonomiaOp.autonomiaSemanas;
  let autonomiaDiasSaldo = autonomiaOp.autonomiaDias;
  let ritmoSemanalReferencia = autonomiaOp.ritmoReferencia;
  let cestasDisponiveisEmpenho = autonomiaOp.cestasDisponiveis;
  const semanasPeriodoRestantes = autonomiaOp.semanasPeriodoRestantes;
  const semanasPeriodoTotal = autonomiaOp.semanasPeriodoTotal;
  let empenhoAcabaAntesDoPeriodo = autonomiaOp.empenhoAcabaAntesDoPeriodo;
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

  if (modoPlanejamento && ultimaSemanaComDados > 0) {
    alertas.push({
      nivel: 'moderado',
      titulo: `Planejando S${semanaAnalise} (sem lançamento ainda)`,
      descricao: `Projeções e ritmo com base no histórico até S${ultimaSemanaComDados} (${enviadoAteBaseRitmo} cestas no mês). Importe o PDF ou lance os envios da S${semanaAnalise}.`,
    });
  }

  if (estouroSemana > 0) {
    alertas.push({
      nivel: 'critico',
      titulo: `Estouro na semana ${semanaAnalise}`,
      descricao: `S${semanaAnalise}: ${enviadoSemanaAtual} cestas — ${estouroSemana} acima do teto semanal (~${limiteSemanal}, ${pctLimiteSemana.toFixed(0)}%).`,
    });
  } else if (pctLimiteSemana > 90 && limiteSemanal > 0) {
    alertas.push({
      nivel: 'alto',
      titulo: `Semana ${semanaAnalise} perto do teto`,
      descricao: `${enviadoSemanaAtual}/${limiteSemanal} cestas (${pctLimiteSemana.toFixed(0)}%). Margem semanal: ${margemSemana}.`,
    });
  }

  const ritmoAltoProjecao = equipamentos.filter(
    (e) =>
      e.metaMensal > 0 &&
      e.pctMes <= 100 &&
      e.pctSemana <= 95 &&
      e.pctProjecaoMes > 95,
  );
  if (ritmoAltoProjecao.length) {
    alertas.push({
      nivel: 'alto',
      titulo: `${ritmoAltoProjecao.length} unidade(s) verdes mas com ritmo perigoso`,
      descricao: `${ritmoAltoProjecao
        .slice(0, 4)
        .map((e) => `${e.servicoNome} (proj. ${e.pctProjecaoMes.toFixed(0)}%)`)
        .join('; ')} — se mantiver o ritmo da semana, estoura o teto do mês.`,
    });
  }

  if (pctProjecaoMes > 100 && estouroProjetadoMes > 0 && estouroMes === 0) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Projeção: teto mensal antes do fim do mês',
      descricao: `Ritmo ~${ritmoSemanalMedio.toFixed(0)}/sem projeta ${projecaoMesTotal} cestas (teto ${metaMesTotal})${semanaProjetadaEstouro != null ? ` — estouro previsto na S${semanaProjetadaEstouro}` : ''}. Ajuste já na próxima semana.`,
    });
  }

  if (empenhoAcabaAntesDoPeriodo && autonomiaSemanasSaldo != null) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Empenho não chega ao fim do período',
      descricao: `Com ~${ritmoSemanalReferencia.toFixed(0)} cestas/sem, as ${cestasDisponiveisEmpenho} restantes duram ~${autonomiaSemanasSaldo.toFixed(1)} semana(s) (${autonomiaDiasSaldo ?? '—'} dias); o contrato prevê ~${semanasPeriodoRestantes} semana(s) ainda (${semanasPeriodoTotal} no total). Reduza já na próxima semana.`,
    });
  } else if (
    autonomiaSemanasSaldo != null &&
    autonomiaSemanasSaldo < semanasRestantesNoMes + 1
  ) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Ritmo estoura o mês civil antes do fim',
      descricao: `Ao ritmo ~${ritmoSemanalReferencia.toFixed(0)}/sem, as cestas do mês acabam em ~${autonomiaSemanasSaldo.toFixed(1)} semana(s); faltam ${semanasRestantesNoMes} no mês.`,
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
          if (e.pctSemana > 100) partes.push(`S${semanaAnalise} ${e.pctSemana.toFixed(0)}%`);
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
      autonomiaSemanasSaldo < semanasNoMes - semanaBaseRitmo + 1 &&
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
    projecaoSemanasAteMeta < semanasNoMes - semanaBaseRitmo &&
    pctMes < 100
  ) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Margem mensal apertada',
      descricao: `Ao ritmo atual (~${ritmoSemanal.toFixed(0)}/sem), a margem de ${margemMes} cestas pode acabar antes do fim do mês.`,
    });
  }

  let cicloAtual = 1;
  let labelCiclo = '';
  let labelSemanaAnalise = '';
  let semanaNoCiclo = semanaAnalise;
  const mesExibicao = options?.mesExibicao?.trim() || mes;
  let projecaoFonte: FonteProjecaoOperacional | undefined;
  let usaPlanoOperacional = false;
  let ritmoOperacionalForward: number | undefined;
  let novoCicloPlanejamento = false;
  let semanasRestantesCiclo: number | undefined;
  let planejadoSemanaAtual: number | null | undefined;
  let enviadoSemanaFlex: number | undefined;
  let planejadoSemanaFlex: number | null | undefined;
  let limiteSemanaFonte: 'plano' | 'margem_ciclo' | undefined;

  if (usarCiclo) {
    const idxAnalise = indiceOperacionalCivil(
      mes,
      semanaAnalise,
      empenhoMesesAnalise,
    );
    const idxBase = indiceOperacionalCivil(
      mes,
      semanaBaseRitmo,
      empenhoMesesAnalise,
    );
    novoCicloPlanejamento =
      modoPlanejamento &&
      idxAnalise != null &&
      idxBase != null &&
      cicloOperacionalDeIndice(idxAnalise) > cicloOperacionalDeIndice(idxBase);
    const semanaRefCiclo = novoCicloPlanejamento
      ? semanaAnalise
      : semanaBaseRitmo;

    const cicloInfo = enviadoCicloOperacionalAte(
      mon,
      mes,
      semanaRefCiclo,
      empenhoMesesAnalise,
    );
    const refAnalise = refSemanaOperacionalCivil(
      mes,
      semanaAnalise,
      empenhoMesesAnalise,
    );
    const refBase = refSemanaOperacionalCivil(
      mes,
      semanaBaseRitmo,
      empenhoMesesAnalise,
    );
    cicloAtual = cicloInfo.ciclo;
    labelCiclo = labelCicloOperacional(cicloAtual);
    labelSemanaAnalise = refAnalise?.label ?? `S${semanaAnalise}`;
    semanaNoCiclo = refAnalise?.semanaNoCiclo ?? semanaAnalise;

    const indiceBase = indiceOperacionalCivil(
      mes,
      semanaBaseRitmo,
      empenhoMesesAnalise,
    );
    const inicioCicloOp =
      (cicloAtual - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
    const semanasCicloComDado =
      indiceBase != null ? indiceBase - inicioCicloOp + 1 : cicloInfo.semanasNoCiclo;

    metaMesTotal = tetoMaximoCicloOperacional(cicloAtual);
    enviadoMesTotal = cicloInfo.enviado;
    enviadoAteBaseRitmo = cicloInfo.enviado;
    enviadoAcumulado = cicloInfo.enviado;
    semanasNoPeriodoControleVal = Math.max(1, semanasCicloComDado);
    semanasRestantesNoMes = Math.max(
      0,
      SEMANAS_POR_CICLO_OPERACIONAL - (refBase?.semanaNoCiclo ?? semanaNoCiclo),
    );
    metaAcumuladaEsperada = Math.round(
      (metaMesTotal / SEMANAS_POR_CICLO_OPERACIONAL) * semanasNoPeriodoControleVal,
    );

    pctMes = pctUsoLimite(enviadoMesTotal, metaMesTotal);
    estouroMes = estouroAcimaLimite(enviadoMesTotal, metaMesTotal);
    margemMes = margemAteLimite(enviadoMesTotal, metaMesTotal);

    const limiteSem = limiteSemanaCicloOperacional(
      payload,
      mes,
      semanaAnalise,
      enviadoMesTotal,
      metaMesTotal,
      empenhoMesesAnalise,
    );
    limiteSemanal = limiteSem.limite;
    semanasRestantesCiclo = limiteSem.semanasRestantes;
    planejadoSemanaAtual = limiteSem.planejadoSemana;
    limiteSemanaFonte = limiteSem.fonte;

    enviadoSemanaFlex = totalFlexSemana(
      mon,
      mes,
      semanaAnalise,
      payload.services,
    );
    const junKey = parseMonthKey('Jun/2026');
    planejadoSemanaFlex =
      parseMonthKey(mes) === junKey &&
      (semanaAnalise === 1 || semanaAnalise === 2)
        ? planejadoFlexJunSemana(
            payload.services,
            semanaAnalise as 1 | 2,
          )
        : null;

    enviadoSemanaAtual = enviadoSemanaFlex;
    if (planejadoSemanaFlex != null) {
      planejadoSemanaAtual = planejadoSemanaFlex;
      if (limiteSemanaFonte === 'plano') {
        limiteSemanal = Math.min(limiteSem.margemCiclo, planejadoSemanaFlex);
      }
    }

    pctLimiteSemana = pctUsoLimite(enviadoSemanaAtual, limiteSemanal);
    estouroSemana = estouroAcimaLimite(enviadoSemanaAtual, limiteSemanal);
    margemSemana = margemAteLimite(enviadoSemanaAtual, limiteSemanal);
    pctRitmoGeral =
      metaAcumuladaEsperada > 0
        ? (enviadoAcumulado / metaAcumuladaEsperada) * 100
        : 0;

    const projecaoOp = projecaoFimCicloOperacional(
      payload,
      mes,
      semanaRefCiclo,
      empenhoMesesAnalise,
    );
    projecaoMesTotal = projecaoOp.fechamentoProjetado;
    pctProjecaoMes = pctUsoLimite(projecaoMesTotal, metaMesTotal);
    estouroProjetadoMes = projecaoOp.estouroProjetado;
    semanaProjetadaEstouro = projecaoOp.semanaProjetadaEstouro;
    projecaoFonte = projecaoOp.fonte;
    usaPlanoOperacional = projecaoOp.usaPlanoAprovado;
    ritmoOperacionalForward = projecaoOp.ritmoOperacionalForward;
    ritmoSemanalMedio =
      enviadoSemanaAtual > 0
        ? enviadoSemanaAtual
        : projecaoOp.ritmoOperacionalForward ?? 0;

    for (let i = alertas.length - 1; i >= 0; i--) {
      const titulo = alertas[i].titulo;
      if (
        titulo === 'Projeção: teto mensal antes do fim do mês' ||
        titulo === 'Margem mensal apertada' ||
        titulo === 'Empenho não chega ao fim do período' ||
        (titulo === 'Ritmo estoura o mês civil antes do fim' &&
          projecaoOp.dentroDoTeto)
      ) {
        alertas.splice(i, 1);
      }
    }
    if (projecaoOp.dentroDoTeto && projecaoOp.usaPlanoAprovado) {
      alertas.unshift({
        nivel: 'moderado',
        titulo: 'Controle operacional no trilho',
        descricao: `Fechamento projetado ${projecaoOp.fechamentoProjetado} cestas no teto ${metaMesTotal} (${labelFonteProjecao(projecaoOp.fonte)}).`,
      });
    } else if (projecaoOp.estouroProjetado > 0) {
      alertas.unshift({
        nivel: 'critico',
        titulo: 'Plano operacional acima do teto do ciclo',
        descricao: `Fechamento ${projecaoOp.fechamentoProjetado} vs teto ${metaMesTotal} (+${projecaoOp.estouroProjetado}). Ajuste o plano aprovado.`,
      });
    }

    equipamentos = equipamentos.map((eq) => {
      if (indiceBase == null) return eq;
      let enviadoCicloEq = 0;
      let semanasEq = 0;
      const semanasCiclo: Record<number, number> = {};
      for (let op = inicioCicloOp; op <= indiceBase; op++) {
        const civil = civilPorIndiceOperacional(op, empenhoMesesAnalise);
        if (!civil) continue;
        const q = getWeeklyQty(mon, civil.mes, civil.semana, eq.servicoId);
        semanasCiclo[op - inicioCicloOp + 1] = q;
        enviadoCicloEq += q;
        if (q > 0) semanasEq++;
      }
      const metaSemanalCiclo =
        eq.cotaMensalUnica || eq.metaMensal <= 0
          ? 0
          : Math.round(eq.metaMensal / SEMANAS_POR_CICLO_OPERACIONAL);
      const enviadoSemanaEq =
        refAnalise != null
          ? getWeeklyQty(
              mon,
              mes,
              semanaAnalise,
              eq.servicoId,
            )
          : eq.enviadoSemanaAtual;
      const pctMesEq = pctUsoLimite(enviadoCicloEq, eq.metaMensal);
      const pctSemanaEq = eq.cotaMensalUnica
        ? 0
        : pctUsoLimite(enviadoSemanaEq, metaSemanalCiclo);
      const projEq = projecaoEquipamentoCiclo(
        mon,
        eq.servicoId,
        eq.servicoNome,
        eq.metaMensal,
        enviadoCicloEq,
        mes,
        semanaRefCiclo,
        empenhoMesesAnalise,
        projecaoOp,
      );
      const pctProjEq = pctUsoLimite(projEq, eq.metaMensal);
      return {
        ...eq,
        metaSemanal: metaSemanalCiclo,
        semanas: semanasCiclo,
        totalEnviado: enviadoCicloEq,
        enviadoSemanaAtual: enviadoSemanaEq,
        pctMes: pctMesEq,
        pctSemana: pctSemanaEq,
        projecaoMes: projEq,
        pctProjecaoMes: pctProjEq,
        estouroProjetadoMes: estouroAcimaLimite(projEq, eq.metaMensal),
        status:
          eq.metaMensal <= 0
            ? eq.status
            : eq.cotaMensalUnica
              ? statusFromLimites(pctMesEq, 0, pctProjEq)
              : statusFromLimites(pctMesEq, pctSemanaEq, pctProjEq),
      };
    });
  }

  const familias = groupByFamilia(equipamentos, payload.services);

  const saudeEmpenho = usarCiclo
    ? buildSaudeEmpenhoProcesso(
        payload,
        mes,
        semanaAnalise,
        empenhoMesesAnalise,
      )
    : undefined;
  if (saudeEmpenho) {
    empenhoAcabaAntesDoPeriodo = !saudeEmpenho.noTrilho;
    cestasDisponiveisEmpenho = saudeEmpenho.restante;
    ritmoSemanalReferencia = saudeEmpenho.ritmoSustentavel;
    autonomiaSemanasSaldo = saudeEmpenho.semanasRestantes;
    autonomiaDiasSaldo = Math.round(saudeEmpenho.semanasRestantes * 7);
  }

  return {
    mes,
    semanaAtual,
    semanaAnalise,
    ultimaSemanaComDados,
    semanaBaseRitmo,
    modoPlanejamento,
    enviadoAteBaseRitmo,
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
    projecaoMesTotal,
    pctProjecaoMes,
    estouroProjetadoMes,
    ritmoSemanalMedio,
    semanasRestantesNoMes,
    semanaProjetadaEstouro,
    autonomiaDiasSaldo,
    ritmoSemanalReferencia,
    cestasDisponiveisEmpenho,
    semanasPeriodoRestantes,
    semanasPeriodoTotal,
    empenhoAcabaAntesDoPeriodo,
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
    usaCicloOperacional: usarCiclo,
    cicloAtual,
    labelCiclo,
    labelSemanaAnalise,
    semanaNoCiclo,
    mesExibicao,
    projecaoFonte,
    usaPlanoOperacional,
    ritmoOperacionalForward,
    novoCicloPlanejamento,
    semanasRestantesCiclo,
    planejadoSemanaAtual,
    enviadoSemanaFlex,
    planejadoSemanaFlex,
    limiteSemanaFonte,
    saudeEmpenho,
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
