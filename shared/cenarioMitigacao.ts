import {
  buildMonitoramentoResumo,
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
import { getYearMonth, parseMonthKey } from './monthUtils.js';
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
  periodosSemana: string[];
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

/** Cota semanal da cessão = distribuição normal da semana */
function normalSemanal(u: DraftUnit): number {
  if (u.cotaSemanal > 0) return u.cotaSemanal;
  return Math.max(0, Math.round(u.ritmo));
}

interface ResultadoDuasSemanas {
  porUnidade: Map<string, number[]>;
  semanaPressaoIdx: number;
  totaisNormal: number[];
  totaisProposta: number[];
}

/**
 * 1) Monta a distribuição normal (cota/sem) por equipamento e semana.
 * 2) Aplica −55% na semana de maior pressão (normal acima do orçamento/semana).
 * 3) Se ainda passar do orçamento, corta nos que superaram a média histórica.
 */
function alocarDuasSemanas(
  units: DraftUnit[],
  budget: number,
  numSemanas: number,
): ResultadoDuasSemanas {
  const vazio: ResultadoDuasSemanas = {
    porUnidade: new Map(),
    semanaPressaoIdx: 0,
    totaisNormal: [],
    totaisProposta: [],
  };
  if (budget <= 0 || !units.length || numSemanas <= 0) return vazio;

  const normal = new Map<string, number[]>();
  const espaco = new Map(units.map((u) => [u.servicoId, u.espacoAteCota]));

  for (let wi = 0; wi < numSemanas; wi++) {
    for (const u of units) {
      const restante = espaco.get(u.servicoId) ?? 0;
      const n = Math.min(normalSemanal(u), restante);
      const arr = normal.get(u.servicoId) ?? [];
      arr[wi] = n;
      espaco.set(u.servicoId, restante - n);
      normal.set(u.servicoId, arr);
    }
  }

  const totaisNormal = Array.from({ length: numSemanas }, (_, wi) =>
    units.reduce((s, u) => s + (normal.get(u.servicoId)?.[wi] ?? 0), 0),
  );

  const budgetPorSemana = budget / numSemanas;
  let semanaPressaoIdx = 0;
  let maxPressao = Number.NEGATIVE_INFINITY;
  for (let wi = 0; wi < numSemanas; wi++) {
    const pressao = totaisNormal[wi] - budgetPorSemana;
    if (pressao > maxPressao) {
      maxPressao = pressao;
      semanaPressaoIdx = wi;
    }
  }

  const fatorPressao = 1 - REDUCAO_SEMANA_PRESSAO_PCT / 100;
  const proposta = new Map<string, number[]>();
  for (const u of units) {
    const norm = normal.get(u.servicoId) ?? [];
    proposta.set(
      u.servicoId,
      norm.map((n, wi) =>
        wi === semanaPressaoIdx ? Math.round(n * fatorPressao) : n,
      ),
    );
  }

  const somaProposta = () =>
    units.reduce(
      (s, u) => s + (proposta.get(u.servicoId)?.reduce((a, b) => a + b, 0) ?? 0),
      0,
    );

  let total = somaProposta();
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
        const arr = proposta.get(u.servicoId)!;
        const totalU = arr.reduce((a, b) => a + b, 0);
        if (totalU <= 0) continue;
        const peso = u.pctAcimaMedia > 0 ? u.pctAcimaMedia : 1;
        const cut = Math.min(
          totalU,
          Math.max(1, Math.round((falta * peso) / pesoTot)),
          falta,
        );
        let restCut = cut;
        for (let wi = numSemanas - 1; wi >= 0 && restCut > 0; wi--) {
          const c = Math.min(arr[wi], restCut);
          arr[wi] -= c;
          restCut -= c;
        }
        falta -= cut;
        cortou += cut;
      }
      if (cortou === 0) break;
    }

    total = somaProposta();
    if (total > budget) {
      const fator = budget / total;
      for (const u of units) {
        const arr = proposta.get(u.servicoId)!;
        for (let wi = 0; wi < numSemanas; wi++) {
          arr[wi] = Math.round(arr[wi] * fator);
        }
      }
    }
  }

  const totaisProposta = Array.from({ length: numSemanas }, (_, wi) =>
    units.reduce((s, u) => s + (proposta.get(u.servicoId)?.[wi] ?? 0), 0),
  );

  return {
    porUnidade: proposta,
    semanaPressaoIdx,
    totaisNormal,
    totaisProposta,
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

  const semanasPlanejadas = alvos.map((a) => a.semana);
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
  const resultado = alocarDuasSemanas(drafts, orcamentoDistribuir, numSemanas);
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
      `Já gastou ${fmt(enviadoMes)} em ${mesFechamento}. ${fmt(orcamentoDistribuir)} a distribuir (~${fmt(Math.round(orcamentoDistribuir / Math.max(1, numSemanas)))}/sem)` +
      (semanaPressaoLabel
        ? ` — S${alvos[semanaPressaoIdx]?.semana} com −${REDUCAO_SEMANA_PRESSAO_PCT}% na normal`
        : '') +
      (deficitVsInercial > 0
        ? `; ainda faltam ${fmt(deficitVsInercial)} vs ritmo (não fecha o mês)`
        : '') +
      `. Fecha em ${fmt(fechamentoMesProjetado)}.`;
  }

  return {
    mesFechamento,
    mes: mesFechamento,
    semanasPlanejadas,
    periodosSemana: alvos.map((a) => {
      const ym = yearByMes.get(a.mes);
      return ym
        ? `${a.mes} S${a.semana} (${weekDateRangeLabel(ym.year, ym.month, a.semana)})`
        : `S${a.semana}`;
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
    semanaPressaoIdx,
    semanaPressaoLabel,
    reducaoSemanaPressaoPct: REDUCAO_SEMANA_PRESSAO_PCT,
    totaisNormalPorSemana: resultado.totaisNormal,
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
  const ym = yearByMes.get(alvo.mes);
  return ym
    ? `${alvo.mes} S${alvo.semana} (${weekDateRangeLabel(ym.year, ym.month, alvo.semana)})`
    : `S${alvo.semana}`;
}

export function totaisPorSemana(
  cenario: CenarioMitigacao,
): { semana: number; periodo: string; total: number }[] {
  return cenario.periodosSemana.map((periodo, i) => ({
    semana: cenario.semanasPlanejadas[i] ?? i + 1,
    periodo,
    total: cenario.equipamentos.reduce(
      (s, e) => s + (e.propostasSemana[i]?.cestas ?? 0),
      0,
    ),
  }));
}
