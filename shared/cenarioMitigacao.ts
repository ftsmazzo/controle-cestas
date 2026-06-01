import { buildMonitoramentoResumo, somaEnviosSemanas, weekDateRangeLabel } from './emergencyMonitoring.js';
import { computeAutonomiaOperacional, buildEmpenhoControle, enviadoMesMonitoramento, EMPENHO_DURACAO_MESES_PADRAO } from './empenhoControle.js';
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
}

function impactoFromPct(pctReducao: number, corte: number): MitigacaoImpacto {
  if (corte <= 0) return 'nenhum';
  if (pctReducao >= 40) return 'forte';
  if (pctReducao >= 15) return 'moderado';
  return 'leve';
}

function splitSemanas(
  total: number,
  semanas: number[],
  year: number,
  month: number,
): MitigacaoSemanaProposta[] {
  if (!semanas.length) return [];
  const base = Math.floor(total / semanas.length);
  let resto = total - base * semanas.length;
  return semanas.map((semana) => {
    const extra = resto > 0 ? 1 : 0;
    if (resto > 0) resto--;
    const cestas = base + extra;
    return {
      semana,
      periodo: weekDateRangeLabel(year, month, semana),
      cestas,
    };
  });
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
  const resumo = buildMonitoramentoResumo(payload);
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

  const ym = getYearMonth(resumo.mes);
  const year = ym?.year ?? 0;
  const month = ym?.month ?? 0;

  const semanasPlanejadas: number[] = [];
  for (
    let w = resumo.semanaBaseRitmo + 1;
    w <= resumo.semanasNoMes && semanasPlanejadas.length < semanasHorizonte;
    w++
  ) {
    semanasPlanejadas.push(w);
  }

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
    const eq = resumo.equipamentos.find((e) => e.servicoId === s.id);
    const cotaMes = eq?.metaMensal ?? cotaMap.get(s.id) ?? 0;
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
    const demanda = Math.round(ritmo * semanasPlanejadas.length);
    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      fixo: s.fixo,
      enviado,
      cotaMes,
      cotaRestante: Math.max(0, cotaMes - enviado),
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
        propostasSemana: splitSemanas(proposta2sem, semanasPlanejadas, year, month),
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

  const temDados =
    resumo.ultimaSemanaComDados >= resumo.semanaInicioControle &&
    semanasPlanejadas.length > 0;
  const precisaMitigacao =
    demandaInercialTotal > orcOp || fechamentoInercial > TETO_MENSAL_OPERACIONAL;

  let resumoCurto = '';
  if (!temDados) {
    resumoCurto =
      'Lance semanas no Monitor para calcular a proposta das próximas entregas.';
  } else if (!precisaMitigacao && corteTotal === 0) {
    resumoCurto = `Ritmo atual cabe no teto de ${TETO_MENSAL_OPERACIONAL}/mês — proposta mantém ${propostaTotal} cestas nas próximas ${semanasPlanejadas.length} semana(s).`;
  } else {
    resumoCurto = `Corte de ${corteTotal} cestas vs ritmo inercial (${demandaInercialTotal}) para fechar o mês em ${fechamentoMesProjetado} (teto operacional ${TETO_MENSAL_OPERACIONAL}${gorduraUsadaNoPlano > 0 ? `, gordura +${gorduraUsadaNoPlano}` : ''}).`;
  }

  return {
    mes: resumo.mes,
    semanasPlanejadas,
    periodosSemana: semanasPlanejadas.map((w) =>
      weekDateRangeLabel(year, month, w),
    ),
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
    semanaBaseRitmo: resumo.semanaBaseRitmo,
    semanasHorizonte,
    equipamentos,
    familias,
    resumoCurto,
    temDados,
    precisaMitigacao,
  };
}

export function totaisPorSemana(
  cenario: CenarioMitigacao,
): { semana: number; periodo: string; total: number }[] {
  return cenario.semanasPlanejadas.map((semana, i) => ({
    semana,
    periodo: cenario.periodosSemana[i] ?? `S${semana}`,
    total: cenario.equipamentos.reduce(
      (s, e) => s + (e.propostasSemana.find((p) => p.semana === semana)?.cestas ?? 0),
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
