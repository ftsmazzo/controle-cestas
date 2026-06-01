import {
  buildMonitoramentoResumo,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  resolveContextoPainelPublico,
  somaEnviosSemanas,
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
  MARGEM_MITIGACAO_MENSAL,
  TETO_CONTRATUAL_MENSAL,
  TETO_MENSAL_OPERACIONAL,
} from './processoEmergencial.js';
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
  yearByMes: Map<string, { year: number; month: number }>,
): MitigacaoSemanaProposta[] {
  return alvos.map(({ mes, semana }, i) => {
    const ym = yearByMes.get(mes);
    return {
      mes,
      semana,
      labelCurta: formatSemanaCurta(mes, semana),
      periodo: ym
        ? weekDateRangeLabel(ym.year, ym.month, semana)
        : `S${semana}`,
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

function gorduraUsadaPeriodo(payload: ServicesPayload, mesAtual: string): number {
  const meses =
    payload.emergencial.empenhoMeses ??
    payload.emergencial.plans.map((p) => p.mes);
  const mon = payload.emergencial.monitoramento;
  const kAtual = parseMonthKey(mesAtual);
  let total = 0;
  for (const mes of meses) {
    const k = parseMonthKey(mes);
    if (k <= 0 || k > kAtual) continue;
    total += gorduraUsadaNoMes(enviadoMesMonitoramento(mes, mon));
  }
  return total;
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

/** Espaço na cota do mês da semana (mês novo = cota cheia) */
function espacoInicialMes(
  u: DraftUnit,
  mesSemana: string,
  mesFechamento: string,
): number {
  if (parseMonthKey(mesSemana) > parseMonthKey(mesFechamento)) {
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
          units.map((u) => [u.servicoId, espacoInicialMes(u, a.mes, mesFechamento)]),
        ),
      );
    }
  }

  const normalPorSemana: Map<string, number>[] = [];
  for (let wi = 0; wi < numSemanas; wi++) {
    const mes = alvos[wi]?.mes ?? mesFechamento;
    const espaco = espacoPorMes.get(mes)!;
    const alocado = distribuirEnvelopeSemana(units, budgetsSemana[wi] ?? 0, espaco);
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
  });

  const mesFechamento = resumo.mes;
  const alvos = planejarProximasSemanas(
    payload,
    mesFechamento,
    resumo.semanaBaseRitmo,
    semanasHorizonte,
  );

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

  const semanaReferenciaLabel = formatSemanaCurta(
    mesFechamento,
    resumo.semanaBaseRitmo,
  );
  const semanasPlanejadasLabels = alvos.map((a) =>
    formatSemanaCurta(a.mes, a.semana),
  );
  const enviadoMes = resumo.enviadoMesTotal;
  const saldoRestante1150 = margemAteLimite(enviadoMes, TETO_MENSAL_OPERACIONAL);
  const margemAte1200 = margemAteLimite(enviadoMes, TETO_CONTRATUAL_MENSAL);
  const gorduraMesDisponivel = Math.min(
    MARGEM_MITIGACAO_MENSAL,
    Math.max(0, margemAte1200 - saldoRestante1150),
  );
  const gorduraPeriodoUsada = gorduraUsadaPeriodo(payload, mesFechamento);
  const gorduraPeriodoRestante = Math.max(
    0,
    GORDURA_PERIODO_TOTAL - gorduraPeriodoUsada,
  );

  const gorduraNoPlano = gorduraPeriodoRestante;
  const orcamentoDistribuir = Math.min(
    saldoRestante1150 + gorduraNoPlano,
    autonomia.cestasDisponiveis,
  );

  const units = consumptionUnits(payload.services);
  const numSemanas = alvos.length;
  const semanasNoMes = resumo.semanasNoMes;
  const drafts: DraftUnit[] = units.map((s) => {
    const eq = resumo.equipamentos.find((e) => e.servicoId === s.id);
    const cotaMes = eq?.metaMensal ?? cotaMap.get(s.id) ?? 0;
    const cotaSemanal =
      eq?.metaSemanal ??
      (cotaMes > 0 && semanasNoMes > 0 ? Math.round(cotaMes / semanasNoMes) : 0);
    const enviado = eq
      ? somaEnviosSemanas(
          eq.semanas,
          resumo.semanaInicioControle,
          resumo.semanaBaseRitmo,
        )
      : 0;
    const ritmo =
      resumo.semanasNoPeriodoControle > 0
        ? enviado / resumo.semanasNoPeriodoControle
        : eq?.enviadoSemanaAtual ?? 0;
    const demanda = Math.round(ritmo * numSemanas);
    const espacoAteCota = Math.max(0, cotaMes - enviado);
    const mediaHistorica = mediaMap.get(s.id) ?? 0;
    const pctAcimaMedia = pctAcimaReferencia(enviado, mediaHistorica);
    const pctAcimaCota = pctAcimaReferencia(enviado, cotaMes);
    const pctAcimaSemana = eq
      ? mediaExcessoSemanal(
          eq.semanas,
          cotaSemanal,
          resumo.semanaInicioControle,
          resumo.semanaBaseRitmo,
        )
      : 0;
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

  const demandaInercialTotal = drafts.reduce((s, d) => s + d.demanda, 0);
  const resultado = alocarDuasSemanas(
    drafts,
    orcamentoDistribuir,
    numSemanas,
    alvos,
    mesFechamento,
  );
  const semanaPressaoIdx = resultado.semanaPressaoIdx;
  const semanaPressaoLabel =
    alvos[semanaPressaoIdx] != null
      ? cenarioSemanaLabel(alvos[semanaPressaoIdx], yearByMes)
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
        propostasSemana: buildPropostasSemana(semanasVal, alvos, yearByMes),
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
  const gorduraUsadaNoPlano = Math.max(0, fechamentoMesProjetado - TETO_MENSAL_OPERACIONAL);
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
    fechamentoInercial > TETO_MENSAL_OPERACIONAL;

  let resumoCurto = '';
  if (!temDados) {
    resumoCurto = mensagemAjuda || 'Aguardando lançamentos salvos.';
  } else {
    resumoCurto =
      `Referência ${semanaReferenciaLabel}: ${fmt(enviadoMes)} acumulados. ${fmt(orcamentoDistribuir)} nas próximas ${numSemanas} sem.` +
      (semanasPlanejadasLabels.length
        ? ` (${semanasPlanejadasLabels.join(', ')})`
        : '') +
      (semanaPressaoLabel
        ? ` — ${formatSemanaCurta(alvos[semanaPressaoIdx]?.mes ?? mesFechamento, alvos[semanaPressaoIdx]?.semana ?? 0)} com −${REDUCAO_SEMANA_PRESSAO_PCT}%`
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
    periodosSemana: alvos.map((a) => {
      const ym = yearByMes.get(a.mes);
      const curta = formatSemanaCurta(a.mes, a.semana);
      return ym
        ? `${curta} (${weekDateRangeLabel(ym.year, ym.month, a.semana)})`
        : curta;
    }),
    enviadoMesAteAgora: enviadoMes,
    tetoOperacional: TETO_MENSAL_OPERACIONAL,
    tetoComGordura: TETO_CONTRATUAL_MENSAL,
    saldoRestante1150,
    gorduraMesDisponivel,
    gorduraPeriodoTotal: GORDURA_PERIODO_TOTAL,
    gorduraPeriodoUsada,
    gorduraPeriodoRestante,
    gorduraNoPlano,
    orcamentoDistribuir,
    orcamentoRestanteOperacional: saldoRestante1150,
    orcamentoRestanteComGordura: margemAte1200,
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
    semanaInicioControleLabel: formatSemanaCurta(
      MONITOR_CONTROLE_MES_INICIO,
      MONITOR_CONTROLE_SEMANA_INICIO,
    ),
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
  yearByMes: Map<string, { year: number; month: number }>,
): string {
  const curta = formatSemanaCurta(alvo.mes, alvo.semana);
  const ym = yearByMes.get(alvo.mes);
  const periodo = ym
    ? weekDateRangeLabel(ym.year, ym.month, alvo.semana)
    : '';
  return periodo ? `${curta} (${periodo})` : curta;
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
