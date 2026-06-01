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
import { margemAteLimite, projecaoFimMes } from './limitesControle.js';
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
  cotaRestante: number;
  mediaHistorica: number;
  participacaoPct: number;
  ritmoSemanal: number;
  demandaInercial2sem: number;
  proposta2sem: number;
  corte2sem: number;
  propostasSemana: MitigacaoSemanaProposta[];
  fechamentoMes: number;
  fechamentoInercial: number;
  vsCotaMesPct: number;
  pctReducaoRitmo: number;
  impacto: MitigacaoImpacto;
}

export interface CenarioMitigacao {
  mes: string;
  semanasPlanejadas: number[];
  periodosSemana: string[];
  enviadoMesAteAgora: number;
  tetoOperacional: number;
  tetoComGordura: number;
  gorduraMesDisponivel: number;
  gorduraPeriodoTotal: number;
  gorduraPeriodoUsada: number;
  gorduraPeriodoRestante: number;
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
  semanasHorizonte: number;
  equipamentos: MitigacaoEquipamentoRow[];
  familias: FamiliaGroup<MitigacaoEquipamentoRow>[];
  resumoCurto: string;
  temDados: boolean;
  precisaMitigacao: boolean;
  motivoVazio: 'sem_lancamentos' | 'mes_fechado' | 'sem_semanas_futuras' | null;
  mensagemAjuda: string;
  ultimoLancamentoLabel: string | null;
  proximoMesSugerido: string | null;
}

function impactoFromPct(pctReducao: number, corte: number): MitigacaoImpacto {
  if (corte <= 0) return 'nenhum';
  if (pctReducao >= 40) return 'forte';
  if (pctReducao >= 15) return 'moderado';
  return 'leve';
}

function splitSemanas(
  total: number,
  alvos: { mes: string; semana: number }[],
  yearByMes: Map<string, { year: number; month: number }>,
): MitigacaoSemanaProposta[] {
  if (!alvos.length) return [];
  const base = Math.floor(total / alvos.length);
  let resto = total - base * alvos.length;
  return alvos.map(({ mes, semana }) => {
    const extra = resto > 0 ? 1 : 0;
    if (resto > 0) resto--;
    const cestas = base + extra;
    const ym = yearByMes.get(mes);
    return {
      mes,
      semana,
      periodo: ym
        ? weekDateRangeLabel(ym.year, ym.month, semana)
        : `S${semana}`,
      cestas,
    };
  });
}

interface AlvoSemanaMitigacao {
  mes: string;
  semana: number;
}

function planejarProximasSemanas(
  payload: ServicesPayload,
  mes: string,
  aposSemana: number,
  horizonte: number,
): AlvoSemanaMitigacao[] {
  const meses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );
  let idx = meses.findIndex((m) => parseMonthKey(m) === parseMonthKey(mes));
  if (idx < 0) idx = 0;
  const out: AlvoSemanaMitigacao[] = [];
  let curMes = meses[idx] ?? mes;
  let w = aposSemana + 1;

  while (out.length < horizonte && idx < meses.length) {
    const ym = getYearMonth(curMes);
    if (!ym) break;
    const maxW = weeksInCalendarMonth(ym.year, ym.month);
    while (w <= maxW && out.length < horizonte) {
      out.push({ mes: curMes, semana: w });
      w++;
    }
    idx += 1;
    if (idx >= meses.length) break;
    curMes = meses[idx];
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
  const next = meses.find((m) => parseMonthKey(m) > k);
  return next ?? null;
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
    const enviado = enviadoMesMonitoramento(mes, mon);
    total += gorduraUsadaNoMes(enviado);
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
  cotaRestante: number;
  mediaHistorica: number;
  participacaoPct: number;
  ritmo: number;
  demanda: number;
}

/** Rateio proporcional com tetos — corta primeiro quem já estourou a cota mensal */
function alocarComMenorImpacto(units: DraftUnit[], budget: number): Map<string, number> {
  const out = new Map<string, number>();
  if (budget <= 0 || !units.length) {
    for (const u of units) out.set(u.servicoId, 0);
    return out;
  }

  const under = units.filter((u) => u.enviado < u.cotaMes);
  const over = units.filter((u) => u.enviado >= u.cotaMes);

  for (const u of over) out.set(u.servicoId, 0);

  let restante = budget;
  const caps = new Map<string, number>();
  for (const u of under) {
    caps.set(u.servicoId, Math.max(0, u.cotaRestante));
  }

  const pesoTotal = under.reduce(
    (s, u) => s + (u.participacaoPct > 0 ? u.participacaoPct : u.cotaRestante),
    0,
  );

  for (const u of under) {
    const cap = caps.get(u.servicoId) ?? 0;
    const peso = u.participacaoPct > 0 ? u.participacaoPct : u.cotaRestante;
    const bruto =
      pesoTotal > 0
        ? (budget * peso) / pesoTotal
        : cap / Math.max(1, under.length);
    const alocado = Math.min(cap, Math.round(bruto));
    out.set(u.servicoId, alocado);
    restante -= alocado;
  }

  if (restante > 0) {
    const ordenados = [...under].sort((a, b) => {
      const roomA = (caps.get(a.servicoId) ?? 0) - (out.get(a.servicoId) ?? 0);
      const roomB = (caps.get(b.servicoId) ?? 0) - (out.get(b.servicoId) ?? 0);
      return roomB - roomA;
    });
    for (const u of ordenados) {
      if (restante <= 0) break;
      const cur = out.get(u.servicoId) ?? 0;
      const cap = caps.get(u.servicoId) ?? 0;
      const add = Math.min(restante, cap - cur);
      if (add > 0) {
        out.set(u.servicoId, cur + add);
        restante -= add;
      }
    }
  }

  if (restante < 0) {
    let excesso = -restante;
    const ordenadosCorte = [...under]
      .filter((u) => (out.get(u.servicoId) ?? 0) > 0)
      .sort((a, b) => {
        const pressA = a.enviado / Math.max(1, a.cotaMes);
        const pressB = b.enviado / Math.max(1, b.cotaMes);
        return pressB - pressA;
      });
    for (const u of ordenadosCorte) {
      if (excesso <= 0) break;
      if (u.fixo) continue;
      const cur = out.get(u.servicoId) ?? 0;
      const cut = Math.min(excesso, cur);
      out.set(u.servicoId, cur - cut);
      excesso -= cut;
    }
    if (excesso > 0) {
      for (const u of ordenadosCorte) {
        if (excesso <= 0) break;
        const cur = out.get(u.servicoId) ?? 0;
        const cut = Math.min(excesso, cur);
        out.set(u.servicoId, cur - cut);
        excesso -= cut;
      }
    }
  }

  return out;
}

export function buildCenarioMitigacao(
  payload: ServicesPayload,
  semanasHorizonte = 2,
): CenarioMitigacao {
  const ctx = resolveContextoPainelPublico(payload.emergencial);
  const resumoRitmo = buildMonitoramentoResumo(payload, {
    mesReferencia: ctx.mes,
    semanaReferencia: ctx.semanaReferencia,
  });

  const alvos = planejarProximasSemanas(
    payload,
    resumoRitmo.mes,
    resumoRitmo.semanaBaseRitmo,
    semanasHorizonte,
  );
  const mesOrcamento = alvos[0]?.mes ?? resumoRitmo.mes;
  const resumo =
    parseMonthKey(mesOrcamento) === parseMonthKey(resumoRitmo.mes)
      ? resumoRitmo
      : buildMonitoramentoResumo(payload, {
          mesReferencia: mesOrcamento,
          semanaReferencia: 1,
        });

  const empenho = buildEmpenhoControle(payload);
  const autonomia = computeAutonomiaOperacional(
    payload,
    resumoRitmo.ritmoSemanalMedio,
    resumoRitmo.enviadoSemanaAtual,
    resumoRitmo.mes,
    resumoRitmo.semanaAnalise,
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
  if (!yearByMes.has(resumo.mes)) {
    const ym = getYearMonth(resumo.mes);
    if (ym) yearByMes.set(resumo.mes, ym);
  }

  const semanasPlanejadas = alvos.map((a) => a.semana);
  const enviadoMes = resumo.enviadoMesTotal;
  const orcOp = margemAteLimite(enviadoMes, TETO_MENSAL_OPERACIONAL);
  const orcGordura = margemAteLimite(enviadoMes, TETO_CONTRATUAL_MENSAL);
  const gorduraMesDisponivel = Math.min(
    MARGEM_MITIGACAO_MENSAL,
    Math.max(0, orcGordura - orcOp),
  );
  const gorduraPeriodoUsada = gorduraUsadaPeriodo(payload, resumo.mes);
  const gorduraPeriodoRestante = Math.max(
    0,
    GORDURA_PERIODO_TOTAL - gorduraPeriodoUsada,
  );

  const orcamentoMax = Math.min(
    orcGordura,
    orcOp + Math.min(gorduraMesDisponivel, gorduraPeriodoRestante),
    autonomia.cestasDisponiveis,
  );

  const units = consumptionUnits(payload.services);
  const drafts: DraftUnit[] = units.map((s) => {
    const eqRitmo = resumoRitmo.equipamentos.find((e) => e.servicoId === s.id);
    const eqOrc = resumo.equipamentos.find((e) => e.servicoId === s.id);
    const cotaMes = eqOrc?.metaMensal ?? cotaMap.get(s.id) ?? 0;
    const enviadoRitmo = eqRitmo
      ? somaEnviosSemanas(
          eqRitmo.semanas,
          resumoRitmo.semanaInicioControle,
          resumoRitmo.semanaBaseRitmo,
        )
      : 0;
    const enviadoOrc = eqOrc
      ? somaEnviosSemanas(
          eqOrc.semanas,
          resumo.semanaInicioControle,
          resumo.semanaBaseRitmo,
        )
      : 0;
    const ritmo =
      resumoRitmo.semanasNoPeriodoControle > 0
        ? enviadoRitmo / resumoRitmo.semanasNoPeriodoControle
        : eqRitmo?.enviadoSemanaAtual ?? 0;
    const demanda = Math.round(ritmo * alvos.length);
    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      fixo: s.fixo,
      enviado: enviadoOrc,
      cotaMes,
      cotaRestante: Math.max(0, cotaMes - enviadoOrc),
      mediaHistorica: mediaMap.get(s.id) ?? 0,
      participacaoPct: pctMap.get(s.id) ?? 0,
      ritmo,
      demanda,
    };
  });

  const demandaInercialTotal = drafts.reduce((s, d) => s + d.demanda, 0);
  const budgetFinal =
    demandaInercialTotal <= orcamentoMax
      ? demandaInercialTotal
      : orcamentoMax;

  const aloc = alocarComMenorImpacto(drafts, budgetFinal);

  const equipamentos: MitigacaoEquipamentoRow[] = drafts
    .map((d) => {
      const proposta2sem = aloc.get(d.servicoId) ?? 0;
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
        cotaRestante: d.cotaRestante,
        mediaHistorica: d.mediaHistorica,
        participacaoPct: d.participacaoPct,
        ritmoSemanal: d.ritmo,
        demandaInercial2sem: d.demanda,
        proposta2sem,
        corte2sem,
        propostasSemana: splitSemanas(proposta2sem, alvos, yearByMes),
        fechamentoMes,
        fechamentoInercial,
        vsCotaMesPct: d.cotaMes > 0 ? (fechamentoMes / d.cotaMes) * 100 : 0,
        pctReducaoRitmo,
        impacto: impactoFromPct(pctReducaoRitmo, corte2sem),
      };
    })
    .filter((r) => r.demandaInercial2sem > 0 || r.proposta2sem > 0 || r.enviadoAteAgora > 0);

  const propostaTotal = equipamentos.reduce((s, r) => s + r.proposta2sem, 0);
  const corteTotal = equipamentos.reduce((s, r) => s + r.corte2sem, 0);
  const fechamentoMesProjetado = enviadoMes + propostaTotal;
  const fechamentoInercial = enviadoMes + demandaInercialTotal;
  const gorduraUsadaNoPlano = gorduraUsadaNoMes(fechamentoMesProjetado);
  const saldoEmpenhoPosPlano = Math.max(0, empenho.restante - propostaTotal);

  const familias = groupByFamilia(equipamentos, payload.services);

  const temLancamentos = (ctx.ultimoLancamento?.totalCestas ?? 0) > 0;
  const temDadosRitmo =
    resumoRitmo.ultimaSemanaComDados >= resumoRitmo.semanaInicioControle;
  const temSemanasFuturas = alvos.length > 0;
  const temDados = temLancamentos && temDadosRitmo && temSemanasFuturas;
  const proximoMesSugerido = proximoMesEmpenho(payload, resumoRitmo.mes);

  let motivoVazio: CenarioMitigacao['motivoVazio'] = null;
  let mensagemAjuda = '';
  if (!temLancamentos) {
    motivoVazio = 'sem_lancamentos';
    mensagemAjuda =
      'No Admin → Monitor, importe o PDF da semana e clique em **Salvar** (botão no topo). Depois atualize esta página (F5). O painel público só lê o que está gravado no banco.';
  } else if (!temDadosRitmo) {
    motivoVazio = 'sem_lancamentos';
    mensagemAjuda = `Há rascunho no mês ${ctx.mes}, mas nada no período de controle (desde S${resumoRitmo.semanaInicioControle}). Confira mês/semana no Monitor e salve.`;
  } else if (!temSemanasFuturas) {
    motivoVazio = 'mes_fechado';
    mensagemAjuda = proximoMesSugerido
      ? `Semanas futuras esgotadas em ${resumoRitmo.mes}. Selecione **${proximoMesSugerido}** no Monitor para planejar S1–S2.`
      : `Sem semanas futuras no mês ${resumoRitmo.mes}.`;
  }

  const ultimoLancamentoLabel = ctx.ultimoLancamento
    ? `${ctx.ultimoLancamento.mes} S${ctx.ultimoLancamento.semana} (${num(ctx.ultimoLancamento.totalCestas)} cestas)`
    : null;

  const precisaMitigacao =
    demandaInercialTotal > orcOp || fechamentoInercial > TETO_MENSAL_OPERACIONAL;

  let resumoCurto = '';
  if (!temDados) {
    resumoCurto = mensagemAjuda || 'Aguardando lançamentos salvos no Monitor.';
  } else if (!precisaMitigacao && corteTotal === 0) {
    resumoCurto = `Ritmo atual cabe no teto de ${TETO_MENSAL_OPERACIONAL}/mês — proposta mantém ${propostaTotal} cestas nas próximas ${alvos.length} semana(s).`;
  } else {
    resumoCurto = `Corte de ${corteTotal} cestas vs ritmo inercial (${demandaInercialTotal}) para fechar ${mesOrcamento} em ${fechamentoMesProjetado} (teto ${TETO_MENSAL_OPERACIONAL}${gorduraUsadaNoPlano > 0 ? `, gordura +${gorduraUsadaNoPlano}` : ''}).`;
  }

  return {
    mes: mesOrcamento,
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
    gorduraMesDisponivel,
    gorduraPeriodoTotal: GORDURA_PERIODO_TOTAL,
    gorduraPeriodoUsada,
    gorduraPeriodoRestante,
    orcamentoRestanteOperacional: orcOp,
    orcamentoRestanteComGordura: orcGordura,
    demandaInercialTotal,
    propostaTotal,
    corteTotal,
    gorduraUsadaNoPlano,
    fechamentoMesProjetado,
    fechamentoInercial,
    saldoEmpenhoRestante: empenho.restante,
    saldoEmpenhoPosPlano,
    semanaBaseRitmo: resumoRitmo.semanaBaseRitmo,
    semanasHorizonte,
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

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
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

export function projecaoInercialFimMes(cenario: CenarioMitigacao): number {
  const semRestantesMes = Math.max(
    0,
    cenario.semanasPlanejadas.length > 0
      ? cenario.semanasPlanejadas[cenario.semanasPlanejadas.length - 1] -
        cenario.semanaBaseRitmo
      : 0,
  );
  const ritmo =
    cenario.semanasHorizonte > 0
      ? cenario.demandaInercialTotal / cenario.semanasHorizonte
      : 0;
  return projecaoFimMes(
    cenario.enviadoMesAteAgora,
    ritmo,
    Math.max(0, semRestantesMes - cenario.semanasHorizonte),
  );
}
