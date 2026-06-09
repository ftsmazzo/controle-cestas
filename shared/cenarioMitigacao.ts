import {
  buildMonitoramentoResumo,
  getWeeklyQty,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  resolveContextoPainelPublico,
  weekDateRangeLabel,
  weeksInCalendarMonth,
} from './emergencyMonitoring.js';
import {
  computeAutonomiaOperacional,
  buildEmpenhoControle,
  enviadoMesMonitoramento,
  EMPENHO_DURACAO_MESES_PADRAO,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import { margemAteLimite } from './limitesControle.js';
import { getYearMonth, parseMonthKey, formatSemanaCurta } from './monthUtils.js';
import {
  SEMANAS_POR_CICLO_OPERACIONAL,
  TETO_CICLO_OPERACIONAL,
  cicloOperacionalDeIndice,
  civilPorIndiceOperacional,
  deveInverterJunSemanas,
  enviadoCicloOperacionalAte,
  formatSemanaOperacionalCurta,
  indiceOperacionalCivil,
  labelCicloOperacional,
  gorduraUsadaPeriodoOperacional,
  proximasSemanasOperacionais,
  refSemanaOperacionalCivil,
  saldoAteTetoCiclo,
  saldoCicloOperacional,
  semanasAlvoMitigacao,
  tetoMaximoCicloOperacional,
  trocarValoresSemanas,
} from './operationalWeeks.js';
import {
  MARGEM_MITIGACAO_MENSAL,
  TETO_CONTRATUAL_MENSAL,
  TETO_MENSAL_OPERACIONAL,
} from './processoEmergencial.js';
import {
  isServicoCotaMensalUnica,
  TOTAL_RESERVA_COTA_MENSAL_UNICA,
} from './coderpRequisitanteRules.js';
import {
  planoJunSemana,
  TOTAL_PLANO_JUN_S1,
  TOTAL_PLANO_JUN_S2,
} from './planoAprovadoCiclo1.js';
import { consumptionUnits, groupByFamilia, type FamiliaGroup } from './serviceFamilies.js';
import { buildTabelaCessaoEmergencial } from './tabelaCessaoEmergencial.js';
import type { ServicesPayload } from './serviceTypes.js';

export const GORDURA_PERIODO_TOTAL =
  MARGEM_MITIGACAO_MENSAL * EMPENHO_DURACAO_MESES_PADRAO;

/** Redução na semana de maior pressão (normal vs orçamento disponível) */
export const REDUCAO_SEMANA_PRESSAO_PCT = 55;

export interface MitigacaoSemanaProposta {
  mes: string;
  semana: number;
  /** Ex.: Mai S4, Jun S1 */
  labelCurta: string;
  periodo: string;
  cestas: number;
}

export type MitigacaoImpacto = 'nenhum' | 'leve' | 'moderado' | 'forte';

export interface MitigacaoEquipamentoRow {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  fixo: boolean;
  /** Cota mensal única (SAICA, WARAOS, Mãos Dadas) — fora do rateio semanal */
  cotaMensalUnica: boolean;
  enviadoAteAgora: number;
  cotaMensal: number;
  /** Teto semanal proporcional (cota ÷ semanas do mês) */
  cotaSemanal: number;
  /** Espaço até a cota mensal (quem já estourou = 0) */
  espacoAteCota: number;
  mediaHistorica: number;
  participacaoPct: number;
  ritmoSemanal: number;
  /** Se mantivesse o ritmo nas próximas semanas (referência) */
  demandaInercial2sem: number;
  /** Quanto enviar nas próximas semanas (parte do orçamento restante) */
  proposta2sem: number;
  corte2sem: number;
  propostasSemana: MitigacaoSemanaProposta[];
  fechamentoMes: number;
  fechamentoInercial: number;
  vsCotaMesPct: number;
  /** % acima da média histórica no que já foi enviado (0 se abaixo) */
  pctAcimaMedia: number;
  /** % acima da cota no que já foi enviado (0 se abaixo) */
  pctAcimaCota: number;
  /** Média de excesso vs cota semanal nas semanas já lançadas */
  pctAcimaSemana: number;
  pctReducaoRitmo: number;
  impacto: MitigacaoImpacto;
}

export interface CenarioMitigacao {
  /** Mês que estamos fechando (onde já houve gasto) */
  mesFechamento: string;
  semanasPlanejadas: number[];
  /** Rótulos curtos das semanas planejadas (Mai S4, Jun S1…) */
  semanasPlanejadasLabels: string[];
  periodosSemana: string[];
  /** Última semana com lançamento (referência do ritmo) */
  semanaReferenciaLabel: string;
  enviadoMesAteAgora: number;
  tetoOperacional: number;
  tetoComGordura: number;
  /** 1.150 − já gasto no mês */
  saldoRestante1150: number;
  gorduraMesDisponivel: number;
  gorduraPeriodoTotal: number;
  gorduraPeriodoUsada: number;
  gorduraPeriodoRestante: number;
  /** Gordura do período (200) aplicada neste plano */
  gorduraNoPlano: number;
  /** Total a distribuir nas próximas semanas = saldo1150 + gorduraNoPlano */
  orcamentoDistribuir: number;
  orcamentoRestanteOperacional: number;
  orcamentoRestanteComGordura: number;
  demandaInercialTotal: number;
  propostaTotal: number;
  corteTotal: number;
  gorduraUsadaNoPlano: number;
  fechamentoMesProjetado: number;
  fechamentoInercial: number;
  saldoEmpenhoRestante: number;
  saldoEmpenhoPosPlano: number;
  semanaBaseRitmo: number;
  semanaInicioControle: number;
  semanasHorizonte: number;
  /** Índice 0-based da semana que recebe o corte de 55% */
  semanaPressaoIdx: number;
  semanaPressaoLabel: string | null;
  reducaoSemanaPressaoPct: number;
  totaisNormalPorSemana: number[];
  /** Envelope por semana (= orçamento ÷ semanas) */
  budgetsSemana: number[];
  /** Quanto falta vs ritmo inercial nas 2 semanas (não resolve o mês inteiro) */
  deficitVsInercial: number;
  equipamentos: MitigacaoEquipamentoRow[];
  familias: FamiliaGroup<MitigacaoEquipamentoRow>[];
  resumoCurto: string;
  temDados: boolean;
  precisaMitigacao: boolean;
  motivoVazio: 'sem_lancamentos' | 'mes_fechado' | 'sem_semanas_futuras' | null;
  mensagemAjuda: string;
  ultimoLancamentoLabel: string | null;
  proximoMesSugerido: string | null;
  /** @deprecated use mesFechamento */
  mes: string;
  semanaInicioControleLabel: string;
  /** Ciclo operacional (4 semanas qua–ter) */
  cicloAtual: number;
  labelCiclo: string;
  enviadoCicloAteAgora: number;
  /** Plano Jun S1/S2 invertido para refletir entrega real */
  entregaInvertidaJun: boolean;
  /** Teto máximo do ciclo (1.350 no ciclo 1, 1.150 nos demais) */
  tetoMaximoCiclo: number;
  /** SAICA + WARAOS + Mãos Dadas reservados no teto (94) */
  reservaCotasFixas: number;
  /** Orçamento flexível (teto − fixas − já enviado flexível) */
  orcamentoFlexivel: number;
  /** Totais do plano aprovado Jun (referência) */
  planoJunS1Total: number;
  planoJunS2Total: number;
}

function impactoFromPct(pctReducao: number, corte: number): MitigacaoImpacto {
  if (corte <= 0) return 'nenhum';
  if (pctReducao >= 40) return 'forte';
  if (pctReducao >= 15) return 'moderado';
  return 'leve';
}

function buildPropostasSemana(
  valores: number[],
  alvos: AlvoSemanaMitigacao[],
  empenhoMeses: string[],
): MitigacaoSemanaProposta[] {
  return alvos.map(({ mes, semana }, i) => {
    const ref = refSemanaOperacionalCivil(mes, semana, empenhoMeses);
    return {
      mes,
      semana,
      labelCurta: ref?.label ?? formatSemanaCurta(mes, semana),
      periodo: ref?.periodo ?? `S${semana}`,
      cestas: valores[i] ?? 0,
    };
  });
}

interface AlvoSemanaMitigacao {
  mes: string;
  semana: number;
}

/** Próximas semanas civis — prioriza concluir o mês do fechamento antes de avançar */
function planejarProximasSemanas(
  payload: ServicesPayload,
  mesFechamento: string,
  aposSemana: number,
  horizonte: number,
): AlvoSemanaMitigacao[] {
  const meses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );
  const idxFech = meses.findIndex(
    (m) => parseMonthKey(m) === parseMonthKey(mesFechamento),
  );
  const idx = idxFech >= 0 ? idxFech : 0;
  const out: AlvoSemanaMitigacao[] = [];
  let curMes = meses[idx] ?? mesFechamento;
  let w = aposSemana + 1;

  while (out.length < horizonte && idx < meses.length) {
    const ym = getYearMonth(curMes);
    if (!ym) break;
    const maxW = weeksInCalendarMonth(ym.year, ym.month);
    while (w <= maxW && out.length < horizonte) {
      out.push({ mes: curMes, semana: w });
      w++;
    }
    const nextIdx = meses.findIndex(
      (m) => parseMonthKey(m) > parseMonthKey(curMes),
    );
    if (nextIdx < 0) break;
    curMes = meses[nextIdx];
    w = 1;
  }
  return out;
}

/** Substitui propostas de Jun S1/S2 pelo plano aprovado (S1 maior, S2 corte drástico) */
function aplicarPlanoAprovadoJun(
  alvos: AlvoSemanaMitigacao[],
  resultado: ResultadoDuasSemanas,
  units: DraftUnit[],
): ResultadoDuasSemanas {
  const junKey = parseMonthKey('Jun/2026');
  const idxS1 = alvos.findIndex(
    (a) => parseMonthKey(a.mes) === junKey && a.semana === 1,
  );
  const idxS2 = alvos.findIndex(
    (a) => parseMonthKey(a.mes) === junKey && a.semana === 2,
  );
  if (idxS1 < 0 || idxS2 < 0) return resultado;

  const porUnidade = new Map<string, number[]>();
  for (const [id, vals] of resultado.porUnidade) {
    porUnidade.set(id, [...vals]);
  }
  for (const u of units) {
    if (isServicoCotaMensalUnica(u.servicoNome)) continue;
    const v1 = planoJunSemana(u.servicoNome, 1);
    const v2 = planoJunSemana(u.servicoNome, 2);
    if (v1 == null && v2 == null) continue;
    const cur = [...(porUnidade.get(u.servicoId) ?? Array(alvos.length).fill(0))];
    if (v1 != null) cur[idxS1] = v1;
    if (v2 != null) cur[idxS2] = v2;
    porUnidade.set(u.servicoId, cur);
  }

  const totaisProposta = [...resultado.totaisProposta];
  let t1 = 0;
  let t2 = 0;
  for (const u of units) {
    if (isServicoCotaMensalUnica(u.servicoNome)) continue;
    t1 += planoJunSemana(u.servicoNome, 1) ?? 0;
    t2 += planoJunSemana(u.servicoNome, 2) ?? 0;
  }
  totaisProposta[idxS1] = t1;
  totaisProposta[idxS2] = t2;

  return { ...resultado, porUnidade, totaisProposta };
}

function aplicarInversaoJun(
  alvos: AlvoSemanaMitigacao[],
  resultado: ResultadoDuasSemanas,
): ResultadoDuasSemanas {
  const swap = deveInverterJunSemanas(alvos);
  if (!swap) return resultado;
  const [i, j] = swap;
  const porUnidade = new Map<string, number[]>();
  for (const [id, vals] of resultado.porUnidade) {
    porUnidade.set(id, trocarValoresSemanas(vals, i, j));
  }
  let pressao = resultado.semanaPressaoIdx;
  if (pressao === i) pressao = j;
  else if (pressao === j) pressao = i;
  return {
    ...resultado,
    porUnidade,
    totaisNormal: trocarValoresSemanas(resultado.totaisNormal, i, j),
    totaisProposta: trocarValoresSemanas(resultado.totaisProposta, i, j),
    budgetsSemana: trocarValoresSemanas(resultado.budgetsSemana, i, j),
    semanaPressaoIdx: pressao,
  };
}

function proximoMesEmpenho(payload: ServicesPayload, mes: string): string | null {
  const meses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );
  const k = parseMonthKey(mes);
  return meses.find((m) => parseMonthKey(m) > k) ?? null;
}

function gorduraUsadaNoMes(enviado: number): number {
  return Math.max(0, enviado - TETO_MENSAL_OPERACIONAL);
}

function gorduraUsadaPeriodo(
  payload: ServicesPayload,
  mesAtual: string,
  semanaRef: number,
  empenhoMeses: string[],
): number {
  const mon = payload.emergencial.monitoramento;
  const idx = indiceOperacionalCivil(mesAtual, semanaRef, empenhoMeses);
  if (idx != null) {
    return gorduraUsadaPeriodoOperacional(mon, idx, empenhoMeses);
  }
  const meses =
    payload.emergencial.empenhoMeses ??
    payload.emergencial.plans.map((p) => p.mes);
  const kAtual = parseMonthKey(mesAtual);
  let total = 0;
  for (const mes of meses) {
    const k = parseMonthKey(mes);
    if (k <= 0 || k > kAtual) continue;
    total += gorduraUsadaNoMes(enviadoMesMonitoramento(mes, mon));
  }
  return total;
}

/** Define as 2 semanas do plano (ex.: Jun S1 + Jun S2 até fechar a dupla) */
function resolverAlvosMitigacao(
  mesFechamento: string,
  resumo: ReturnType<typeof buildMonitoramentoResumo>,
  horizonte: number,
  empenhoMeses: string[],
): Array<{ mes: string; semana: number; indiceOperacional: number }> {
  const idxJunS1 = indiceOperacionalCivil('Jun/2026', 1, empenhoMeses);
  const idxJunS2 = indiceOperacionalCivil('Jun/2026', 2, empenhoMeses);
  const idxBase = indiceOperacionalCivil(
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );

  if (
    idxBase != null &&
    idxJunS1 != null &&
    idxJunS2 != null &&
    idxBase >= idxJunS1 - 1 &&
    idxBase < idxJunS2
  ) {
    return semanasAlvoMitigacao(
      'Jun/2026',
      1,
      horizonte,
      empenhoMeses,
      'inclusive',
    );
  }

  const modo = resumo.modoPlanejamento ? 'inclusive' : 'apos';
  const semanaInicio = resumo.modoPlanejamento
    ? resumo.semanaAnalise
    : resumo.semanaBaseRitmo;
  return semanasAlvoMitigacao(
    mesFechamento,
    semanaInicio,
    horizonte,
    empenhoMeses,
    modo,
  );
}

interface DraftUnit {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  fixo: boolean;
  enviado: number;
  cotaMes: number;
  cotaSemanal: number;
  espacoAteCota: number;
  mediaHistorica: number;
  participacaoPct: number;
  ritmo: number;
  demanda: number;
  pctAcimaMedia: number;
  pctAcimaCota: number;
  pctAcimaSemana: number;
}

function pctAcimaReferencia(enviado: number, ref: number): number {
  if (ref <= 0 || enviado <= ref) return 0;
  return ((enviado - ref) / ref) * 100;
}

function mediaExcessoSemanal(
  semanas: Record<number, number>,
  metaSemanal: number,
  semanaInicio: number,
  semanaFim: number,
): number {
  if (metaSemanal <= 0 || semanaFim < semanaInicio) return 0;
  let soma = 0;
  let n = 0;
  for (let w = semanaInicio; w <= semanaFim; w++) {
    const q = semanas[w] ?? 0;
    if (q > metaSemanal) {
      soma += pctAcimaReferencia(q, metaSemanal);
    }
    n++;
  }
  return n > 0 ? soma / n : 0;
}

function splitBudgetSemanas(budget: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(budget / n);
  let resto = budget - base * n;
  return Array.from({ length: n }, () => {
    const extra = resto > 0 ? 1 : 0;
    if (resto > 0) resto--;
    return base + extra;
  });
}

function pesoDistribuicao(u: DraftUnit): number {
  if (u.cotaSemanal > 0) return u.cotaSemanal;
  if (u.participacaoPct > 0) return u.participacaoPct;
  return u.ritmo > 0 ? u.ritmo : 1;
}

/** Espaço na cota — novo ciclo operacional (4 sem.) reinicia a cota cheia */
function espacoInicialMes(
  u: DraftUnit,
  mesSemana: string,
  semanaSemana: number,
  mesFechamento: string,
  semanaFechamento: number,
  empenhoMeses: string[],
): number {
  const idxS = indiceOperacionalCivil(mesSemana, semanaSemana, empenhoMeses);
  const idxF = indiceOperacionalCivil(mesFechamento, semanaFechamento, empenhoMeses);
  if (
    idxS != null &&
    idxF != null &&
    cicloOperacionalDeIndice(idxS) > cicloOperacionalDeIndice(idxF)
  ) {
    return u.cotaMes;
  }
  return u.espacoAteCota;
}

/**
 * Rateia o envelope semanal entre equipamentos (proporção = cota/sem),
 * respeitando espaço na cota mensal daquele mês.
 */
function distribuirEnvelopeSemana(
  units: DraftUnit[],
  envelope: number,
  espaco: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  if (envelope <= 0 || !units.length) {
    for (const u of units) out.set(u.servicoId, 0);
    return out;
  }

  const pesos = units.map((u) => ({
    u,
    peso: pesoDistribuicao(u),
  }));
  const somaPeso = pesos.reduce((s, p) => s + p.peso, 0);

  const slots = pesos.map(({ u, peso }) => {
    const bruto = somaPeso > 0 ? (envelope * peso) / somaPeso : envelope / units.length;
    const cap = Math.min(
      espaco.get(u.servicoId) ?? envelope,
      u.cotaSemanal > 0 ? u.cotaSemanal : envelope,
    );
    const val = Math.min(cap, Math.max(0, Math.floor(bruto)));
    return { u, val, frac: bruto - val, cap };
  });

  let sum = slots.reduce((s, x) => s + x.val, 0);
  let resto = envelope - sum;
  const ordenados = [...slots].sort((a, b) => b.frac - a.frac);
  for (const slot of ordenados) {
    if (resto <= 0) break;
    if (slot.val < slot.cap) {
      slot.val++;
      resto--;
    }
  }

  for (const slot of slots) out.set(slot.u.servicoId, slot.val);
  return out;
}

function somaMapSemana(m: Map<string, number>): number {
  return [...m.values()].reduce((s, v) => s + v, 0);
}

function mapParaArray(
  units: DraftUnit[],
  porSemana: Map<string, number>[],
): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const u of units) {
    out.set(
      u.servicoId,
      porSemana.map((m) => m.get(u.servicoId) ?? 0),
    );
  }
  return out;
}

interface ResultadoDuasSemanas {
  porUnidade: Map<string, number[]>;
  semanaPressaoIdx: number;
  totaisNormal: number[];
  totaisProposta: number[];
  budgetsSemana: number[];
}

/**
 * 1) Divide o orçamento (~187/sem) — ponto de partida obrigatório.
 * 2) Rateia cada envelope pela cota semanal (distribuição normal).
 * 3) −55% na semana de maior pressão (ritmo vs envelope).
 * 4) Completa até o orçamento total; se passar, corta quem superou a média.
 */
function alocarDuasSemanas(
  units: DraftUnit[],
  budget: number,
  numSemanas: number,
  alvos: AlvoSemanaMitigacao[],
  mesFechamento: string,
  semanaFechamento: number,
  empenhoMeses: string[],
): ResultadoDuasSemanas {
  const vazio: ResultadoDuasSemanas = {
    porUnidade: new Map(),
    semanaPressaoIdx: 0,
    totaisNormal: [],
    totaisProposta: [],
    budgetsSemana: [],
  };
  if (budget <= 0 || !units.length || numSemanas <= 0) return vazio;

  const budgetsSemana = splitBudgetSemanas(budget, numSemanas);
  const espacoPorMes = new Map<string, Map<string, number>>();
  for (const a of alvos) {
    if (!espacoPorMes.has(a.mes)) {
      espacoPorMes.set(
        a.mes,
        new Map(
          units.map((u) => [
            u.servicoId,
            espacoInicialMes(
              u,
              a.mes,
              a.semana,
              mesFechamento,
              semanaFechamento,
              empenhoMeses,
            ),
          ]),
        ),
      );
    }
  }

  const unitsSemanais = units.filter((u) => !isServicoCotaMensalUnica(u.servicoNome));

  const normalPorSemana: Map<string, number>[] = [];
  for (let wi = 0; wi < numSemanas; wi++) {
    const mes = alvos[wi]?.mes ?? mesFechamento;
    const espaco = espacoPorMes.get(mes)!;
    const alocado = distribuirEnvelopeSemana(
      unitsSemanais,
      budgetsSemana[wi] ?? 0,
      espaco,
    );
    for (const u of units) {
      const id = u.servicoId;
      const v = alocado.get(id) ?? 0;
      espaco.set(id, Math.max(0, (espaco.get(id) ?? 0) - v));
    }
    normalPorSemana.push(alocado);
  }

  const totaisNormal = budgetsSemana.slice();

  const ritmoPorSemana = Array.from({ length: numSemanas }, () =>
    units.reduce((s, u) => s + Math.max(0, Math.round(u.ritmo)), 0),
  );
  let semanaPressaoIdx = 0;
  let maxPressao = Number.NEGATIVE_INFINITY;
  for (let wi = 0; wi < numSemanas; wi++) {
    const pressao = ritmoPorSemana[wi] - (budgetsSemana[wi] ?? 0);
    if (pressao > maxPressao) {
      maxPressao = pressao;
      semanaPressaoIdx = wi;
    }
  }

  const fatorPressao = 1 - REDUCAO_SEMANA_PRESSAO_PCT / 100;
  const propostaPorSemana: Map<string, number>[] = normalPorSemana.map((m, wi) => {
    if (wi !== semanaPressaoIdx) return new Map(m);
    const out = new Map<string, number>();
    for (const [id, v] of m) {
      out.set(id, Math.round(v * fatorPressao));
    }
    return out;
  });

  let total = propostaPorSemana.reduce((s, m) => s + somaMapSemana(m), 0);
  let deficit = budget - total;

  if (deficit > 0) {
    for (let wi = 0; wi < numSemanas && deficit > 0; wi++) {
      if (wi === semanaPressaoIdx) continue;
      const mes = alvos[wi]?.mes ?? mesFechamento;
      const espaco = espacoPorMes.get(mes)!;
      const candidatos = [...units]
        .filter((u) => u.pctAcimaMedia <= 0)
        .sort((a, b) => pesoDistribuicao(b) - pesoDistribuicao(a));
      for (const u of candidatos) {
        if (deficit <= 0) break;
        const id = u.servicoId;
        const cur = propostaPorSemana[wi].get(id) ?? 0;
        const cap = Math.min(
          espaco.get(id) ?? 0,
          u.cotaSemanal > 0 ? u.cotaSemanal : deficit,
        );
        const room = Math.max(0, cap - cur);
        if (room <= 0) continue;
        const add = Math.min(deficit, room);
        propostaPorSemana[wi].set(id, cur + add);
        espaco.set(id, (espaco.get(id) ?? 0) - add);
        deficit -= add;
      }
    }
    for (let wi = 0; wi < numSemanas && deficit > 0; wi++) {
      const mes = alvos[wi]?.mes ?? mesFechamento;
      const espaco = espacoPorMes.get(mes)!;
      for (const u of units) {
        if (deficit <= 0) break;
        const id = u.servicoId;
        const cur = propostaPorSemana[wi].get(id) ?? 0;
        const room = espaco.get(id) ?? 0;
        if (room <= 0) continue;
        const add = Math.min(deficit, room);
        propostaPorSemana[wi].set(id, cur + add);
        espaco.set(id, room - add);
        deficit -= add;
      }
    }
  }

  total = propostaPorSemana.reduce((s, m) => s + somaMapSemana(m), 0);
  if (total > budget) {
    let falta = total - budget;
    const estouro = [...units]
      .filter((u) => u.pctAcimaMedia > 0)
      .sort((a, b) => b.pctAcimaMedia - a.pctAcimaMedia);
    while (falta > 0 && estouro.length) {
      const pesoTot =
        estouro.reduce((s, u) => s + u.pctAcimaMedia, 0) || estouro.length;
      let cortou = 0;
      for (const u of estouro) {
        if (falta <= 0) break;
        for (let wi = numSemanas - 1; wi >= 0; wi--) {
          const id = u.servicoId;
          const cur = propostaPorSemana[wi].get(id) ?? 0;
          if (cur <= 0) continue;
          const peso = u.pctAcimaMedia > 0 ? u.pctAcimaMedia : 1;
          const cut = Math.min(
            cur,
            Math.max(1, Math.round((falta * peso) / pesoTot)),
            falta,
          );
          propostaPorSemana[wi].set(id, cur - cut);
          falta -= cut;
          cortou += cut;
          if (falta <= 0) break;
        }
      }
      if (cortou === 0) break;
    }
  }

  const totaisProposta = propostaPorSemana.map((m) => somaMapSemana(m));

  for (const u of units) {
    if (!isServicoCotaMensalUnica(u.servicoNome)) continue;
    for (const m of propostaPorSemana) {
      m.set(u.servicoId, 0);
    }
    for (const m of normalPorSemana) {
      m.set(u.servicoId, 0);
    }
  }

  return {
    porUnidade: mapParaArray(units, propostaPorSemana),
    semanaPressaoIdx,
    totaisNormal,
    totaisProposta,
    budgetsSemana,
  };
}

export function buildCenarioMitigacao(
  payload: ServicesPayload,
  semanasHorizonte = 2,
): CenarioMitigacao {
  const ctx = resolveContextoPainelPublico(payload.emergencial);
  const resumo = buildMonitoramentoResumo(payload, {
    mesReferencia: ctx.mes,
    semanaReferencia: ctx.semanaReferencia,
    usarCicloOperacional: true,
  });

  const mesFechamento = resumo.mes;
  const empenhoMeses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );
  const proximasOp = resolverAlvosMitigacao(
    mesFechamento,
    resumo,
    semanasHorizonte,
    empenhoMeses,
  );
  const alvos: AlvoSemanaMitigacao[] = proximasOp.map((p) => ({
    mes: p.mes,
    semana: p.semana,
  }));

  const empenho = buildEmpenhoControle(payload);
  const autonomia = computeAutonomiaOperacional(
    payload,
    resumo.ritmoSemanalMedio,
    resumo.enviadoSemanaAtual,
    resumo.mes,
    resumo.semanaAnalise,
  );
  const tabela = buildTabelaCessaoEmergencial(payload);
  const mediaMap = new Map(tabela.rows.map((r) => [r.servicoId, r.mediaHistorica]));
  const cotaMap = new Map(tabela.rows.map((r) => [r.servicoId, r.cotaMensal]));
  const pctMap = new Map(
    tabela.rows.map((r) => [
      r.servicoId,
      tabela.somaMedias > 0 ? (r.mediaHistorica / tabela.somaMedias) * 100 : 0,
    ]),
  );

  const yearByMes = new Map<string, { year: number; month: number }>();
  for (const a of alvos) {
    if (!yearByMes.has(a.mes)) {
      const ym = getYearMonth(a.mes);
      if (ym) yearByMes.set(a.mes, ym);
    }
  }
  const ymFech = getYearMonth(mesFechamento);
  if (ymFech && !yearByMes.has(mesFechamento)) {
    yearByMes.set(mesFechamento, ymFech);
  }

  const semanaReferenciaLabel = formatSemanaOperacionalCurta(
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );
  const semanasPlanejadasLabels = alvos.map((a) =>
    formatSemanaOperacionalCurta(a.mes, a.semana, empenhoMeses),
  );
  const cicloInfo = enviadoCicloOperacionalAte(
    payload.emergencial.monitoramento,
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );
  const enviadoCiclo = cicloInfo.enviado;
  const enviadoMes = enviadoCiclo;
  const tetoMaximoCiclo = tetoMaximoCicloOperacional(cicloInfo.ciclo);
  const saldoRestante1150 = saldoAteTetoCiclo(enviadoCiclo, tetoMaximoCiclo);
  const gorduraPeriodoUsada = gorduraUsadaPeriodo(
    payload,
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );
  const gorduraPeriodoRestante = Math.max(
    0,
    GORDURA_PERIODO_TOTAL - gorduraPeriodoUsada,
  );
  const gorduraNoPlano =
    cicloInfo.ciclo === 1 ? Math.min(GORDURA_PERIODO_TOTAL, gorduraPeriodoRestante) : 0;
  const gorduraMesDisponivel = gorduraNoPlano;

  const units = consumptionUnits(payload.services);
  const numSemanas = alvos.length;
  const semanasNoCiclo = SEMANAS_POR_CICLO_OPERACIONAL;
  const inicioCicloOp =
    (cicloInfo.ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const indiceRef = indiceOperacionalCivil(
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );
  const mon = payload.emergencial.monitoramento;
  const drafts: DraftUnit[] = units.map((s) => {
    const eq = resumo.equipamentos.find((e) => e.servicoId === s.id);
    const cotaMes = eq?.metaMensal ?? cotaMap.get(s.id) ?? 0;
    const cotaMensalUnica = isServicoCotaMensalUnica(s);
    const cotaSemanal = cotaMensalUnica
      ? 0
      : cotaMes > 0
        ? Math.round(cotaMes / semanasNoCiclo)
        : eq?.metaSemanal ?? 0;
    let enviado = 0;
    let semanasComDado = 0;
    if (indiceRef != null) {
      for (let op = inicioCicloOp; op <= indiceRef; op++) {
        const civil = civilPorIndiceOperacional(op, empenhoMeses);
        if (!civil) continue;
        const q = getWeeklyQty(mon, civil.mes, civil.semana, s.id);
        enviado += q;
        if (q > 0) semanasComDado++;
      }
    }
    const ritmo = cotaMensalUnica
      ? 0
      : semanasComDado > 0
        ? enviado / semanasComDado
        : eq?.enviadoSemanaAtual ?? 0;
    const demanda = cotaMensalUnica ? 0 : Math.round(ritmo * numSemanas);
    const espacoAteCota = Math.max(0, cotaMes - enviado);
    const mediaHistorica = mediaMap.get(s.id) ?? 0;
    const pctAcimaMedia = pctAcimaReferencia(enviado, mediaHistorica);
    const pctAcimaCota = pctAcimaReferencia(enviado, cotaMes);
    let pctAcimaSemana = 0;
    if (!cotaMensalUnica && indiceRef != null && cotaSemanal > 0) {
      let soma = 0;
      let n = 0;
      for (let op = inicioCicloOp; op <= indiceRef; op++) {
        const civil = civilPorIndiceOperacional(op, empenhoMeses);
        if (!civil) continue;
        const q = getWeeklyQty(mon, civil.mes, civil.semana, s.id);
        if (q > cotaSemanal) soma += pctAcimaReferencia(q, cotaSemanal);
        n++;
      }
      pctAcimaSemana = n > 0 ? soma / n : 0;
    }
    const draft: DraftUnit = {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      fixo: s.fixo,
      enviado,
      cotaMes,
      cotaSemanal,
      espacoAteCota,
      mediaHistorica,
      participacaoPct: pctMap.get(s.id) ?? 0,
      ritmo,
      demanda,
      pctAcimaMedia,
      pctAcimaCota,
      pctAcimaSemana,
    };
    return draft;
  });

  let reservaFixas = 0;
  let enviadoFixasCiclo = 0;
  let enviadoFlexCiclo = 0;
  for (const d of drafts) {
    if (isServicoCotaMensalUnica(d.servicoNome)) {
      reservaFixas += d.cotaMes;
      enviadoFixasCiclo += d.enviado;
    } else {
      enviadoFlexCiclo += d.enviado;
    }
  }
  if (reservaFixas <= 0) reservaFixas = TOTAL_RESERVA_COTA_MENSAL_UNICA;
  const tetoFlex = Math.max(0, tetoMaximoCiclo - reservaFixas);
  const saldoFlex = Math.max(0, tetoFlex - enviadoFlexCiclo);
  const orcamentoDistribuir = Math.min(
    saldoFlex,
    autonomia.cestasDisponiveis,
  );
  const orcamentoFlexivel = saldoFlex;

  const demandaInercialTotal = drafts.reduce((s, d) => s + d.demanda, 0);
  let resultado = alocarDuasSemanas(
    drafts,
    orcamentoDistribuir,
    numSemanas,
    alvos,
    mesFechamento,
    resumo.semanaBaseRitmo,
    empenhoMeses,
  );
  const entregaInvertidaJun = deveInverterJunSemanas(alvos) != null;
  const usaPlanoAprovadoJun = cicloInfo.ciclo === 1 && entregaInvertidaJun;
  if (usaPlanoAprovadoJun) {
    resultado = aplicarPlanoAprovadoJun(alvos, resultado, drafts);
  } else if (entregaInvertidaJun) {
    resultado = aplicarInversaoJun(alvos, resultado);
  }
  const semanaPressaoIdx = resultado.semanaPressaoIdx;
  const semanaPressaoLabel =
    alvos[semanaPressaoIdx] != null
      ? cenarioSemanaLabel(alvos[semanaPressaoIdx], empenhoMeses)
      : null;

  const equipamentos: MitigacaoEquipamentoRow[] = drafts
    .map((d) => {
      const semanasVal = resultado.porUnidade.get(d.servicoId) ?? [];
      const proposta2sem = semanasVal.reduce((a, b) => a + b, 0);
      const corte2sem = Math.max(0, d.demanda - proposta2sem);
      const pctReducaoRitmo =
        d.demanda > 0 ? (corte2sem / d.demanda) * 100 : 0;
      const fechamentoMes = d.enviado + proposta2sem;
      const fechamentoInercial = d.enviado + d.demanda;
      return {
        servicoId: d.servicoId,
        servicoNome: d.servicoNome,
        familiaCodigo: d.familiaCodigo,
        fixo: d.fixo,
        cotaMensalUnica: isServicoCotaMensalUnica(d.servicoNome),
        enviadoAteAgora: d.enviado,
        cotaMensal: d.cotaMes,
        cotaSemanal: d.cotaSemanal,
        espacoAteCota: d.espacoAteCota,
        mediaHistorica: d.mediaHistorica,
        participacaoPct: d.participacaoPct,
        ritmoSemanal: d.ritmo,
        demandaInercial2sem: d.demanda,
        proposta2sem,
        corte2sem,
        propostasSemana: buildPropostasSemana(semanasVal, alvos, empenhoMeses),
        fechamentoMes,
        fechamentoInercial,
        vsCotaMesPct: d.cotaMes > 0 ? (fechamentoMes / d.cotaMes) * 100 : 0,
        pctAcimaMedia: d.pctAcimaMedia,
        pctAcimaCota: d.pctAcimaCota,
        pctAcimaSemana: d.pctAcimaSemana,
        pctReducaoRitmo,
        impacto: impactoFromPct(pctReducaoRitmo, corte2sem),
      };
    })
    .filter((r) => r.demandaInercial2sem > 0 || r.proposta2sem > 0 || r.enviadoAteAgora > 0);

  const propostaTotal = equipamentos.reduce((s, r) => s + r.proposta2sem, 0);
  const corteTotal = equipamentos.reduce((s, r) => s + r.corte2sem, 0);
  const deficitVsInercial = Math.max(0, demandaInercialTotal - propostaTotal);
  const fechamentoMesProjetado = enviadoMes + propostaTotal;
  const fechamentoInercial = enviadoMes + demandaInercialTotal;
  const gorduraUsadaNoPlano = Math.max(
    0,
    fechamentoMesProjetado - TETO_CICLO_OPERACIONAL,
  );
  const saldoEmpenhoPosPlano = Math.max(0, empenho.restante - propostaTotal);

  const familias = groupByFamilia(equipamentos, payload.services);

  const temLancamentos = (ctx.ultimoLancamento?.totalCestas ?? 0) > 0;
  const temDadosRitmo =
    resumo.ultimaSemanaComDados >= resumo.semanaInicioControle;
  const temSemanasFuturas = alvos.length > 0;
  const temDados = temLancamentos && temDadosRitmo && temSemanasFuturas;
  const proximoMesSugerido = proximoMesEmpenho(payload, mesFechamento);

  let motivoVazio: CenarioMitigacao['motivoVazio'] = null;
  let mensagemAjuda = '';
  if (!temLancamentos) {
    motivoVazio = 'sem_lancamentos';
    mensagemAjuda =
      'Importe o PDF no Admin → Monitor, clique em **Salvar** e atualize esta página (F5).';
  } else if (!temDadosRitmo) {
    motivoVazio = 'sem_lancamentos';
    mensagemAjuda = `Nada no período de controle desde S${resumo.semanaInicioControle} em ${mesFechamento}.`;
  } else if (!temSemanasFuturas) {
    motivoVazio = 'mes_fechado';
    mensagemAjuda = proximoMesSugerido
      ? `Sem semanas civis restantes em ${mesFechamento}. Próximo: ${proximoMesSugerido}.`
      : `Sem semanas futuras em ${mesFechamento}.`;
  }

  const ultimoLancamentoLabel = ctx.ultimoLancamento
    ? `${ctx.ultimoLancamento.mes} S${ctx.ultimoLancamento.semana} (${fmt(ctx.ultimoLancamento.totalCestas)} cestas)`
    : null;

  const precisaMitigacao =
    demandaInercialTotal > orcamentoDistribuir ||
    fechamentoInercial > tetoMaximoCiclo;

  let resumoCurto = '';
  if (!temDados) {
    resumoCurto = mensagemAjuda || 'Aguardando lançamentos salvos.';
  } else {
    resumoCurto =
      `${labelCicloOperacional(cicloInfo.ciclo)} · teto ${fmt(tetoMaximoCiclo)}` +
      (cicloInfo.ciclo === 1 ? ' (1.150+200 gordura)' : '') +
      ` · fixas ${fmt(reservaFixas)} no teto · ref. ${semanaReferenciaLabel}: ${fmt(enviadoCiclo)} no ciclo.` +
      (usaPlanoAprovadoJun
        ? ` Plano aprovado Jun: S1 ${fmt(TOTAL_PLANO_JUN_S1)} · S2 ${fmt(TOTAL_PLANO_JUN_S2)}.`
        : ` ${fmt(orcamentoDistribuir)} nas próximas ${numSemanas} sem.` +
          (semanasPlanejadasLabels.length
            ? ` (${semanasPlanejadasLabels.join(', ')})`
            : '')) +
      (entregaInvertidaJun && !usaPlanoAprovadoJun
        ? ' · entrega Jun S1/S2 invertida'
        : '') +
      (semanaPressaoLabel
        ? ` — ${semanaPressaoLabel} com −${REDUCAO_SEMANA_PRESSAO_PCT}%`
        : '') +
      (deficitVsInercial > 0
        ? `; faltam ${fmt(deficitVsInercial)} vs ritmo`
        : '') +
      `.`;
  }

  return {
    mesFechamento,
    mes: mesFechamento,
    semanasPlanejadas: alvos.map((a) => a.semana),
    semanasPlanejadasLabels,
    semanaReferenciaLabel,
    periodosSemana: alvos.map((a) =>
      formatSemanaOperacionalCurta(a.mes, a.semana, empenhoMeses),
    ),
    enviadoMesAteAgora: enviadoCiclo,
    tetoOperacional: TETO_CICLO_OPERACIONAL,
    tetoComGordura: tetoMaximoCiclo,
    tetoMaximoCiclo,
    reservaCotasFixas: reservaFixas,
    orcamentoFlexivel,
    planoJunS1Total: TOTAL_PLANO_JUN_S1,
    planoJunS2Total: TOTAL_PLANO_JUN_S2,
    saldoRestante1150,
    gorduraMesDisponivel,
    gorduraPeriodoTotal: GORDURA_PERIODO_TOTAL,
    gorduraPeriodoUsada,
    gorduraPeriodoRestante,
    gorduraNoPlano,
    orcamentoDistribuir,
    orcamentoRestanteOperacional: saldoRestante1150,
    orcamentoRestanteComGordura: saldoRestante1150,
    demandaInercialTotal,
    propostaTotal,
    corteTotal,
    gorduraUsadaNoPlano,
    fechamentoMesProjetado,
    fechamentoInercial,
    saldoEmpenhoRestante: empenho.restante,
    saldoEmpenhoPosPlano,
    semanaBaseRitmo: resumo.semanaBaseRitmo,
    semanaInicioControle: resumo.semanaInicioControle,
    semanasHorizonte,
    semanaInicioControleLabel: formatSemanaOperacionalCurta(
      MONITOR_CONTROLE_MES_INICIO,
      MONITOR_CONTROLE_SEMANA_INICIO,
      empenhoMeses,
    ),
    cicloAtual: cicloInfo.ciclo,
    labelCiclo: labelCicloOperacional(cicloInfo.ciclo),
    enviadoCicloAteAgora: enviadoCiclo,
    entregaInvertidaJun,
    semanaPressaoIdx,
    semanaPressaoLabel,
    reducaoSemanaPressaoPct: REDUCAO_SEMANA_PRESSAO_PCT,
    totaisNormalPorSemana: resultado.totaisNormal,
    budgetsSemana: resultado.budgetsSemana,
    deficitVsInercial,
    equipamentos,
    familias,
    resumoCurto,
    temDados,
    precisaMitigacao,
    motivoVazio,
    mensagemAjuda,
    ultimoLancamentoLabel,
    proximoMesSugerido,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function cenarioSemanaLabel(
  alvo: AlvoSemanaMitigacao,
  empenhoMeses: string[],
): string {
  return formatSemanaOperacionalCurta(alvo.mes, alvo.semana, empenhoMeses);
}

export function totaisPorSemana(
  cenario: CenarioMitigacao,
): { semana: number; label: string; periodo: string; total: number }[] {
  return cenario.periodosSemana.map((periodo, i) => ({
    semana: cenario.semanasPlanejadas[i] ?? i + 1,
    label: cenario.semanasPlanejadasLabels[i] ?? `S${i + 1}`,
    periodo,
    total: cenario.equipamentos.reduce(
      (s, e) => s + (e.propostasSemana[i]?.cestas ?? 0),
      0,
    ),
  }));
}
