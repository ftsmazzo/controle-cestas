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
  /** Gordura que entra neste plano (mês + período, respeitando 1.200) */
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
  espacoAteCota: number;
  mediaHistorica: number;
  participacaoPct: number;
  ritmo: number;
  demanda: number;
}

/**
 * Distribui o orçamento restante do mês para reequilibrar:
 * quem já estourou a cota não recebe mais; o restante rateia por déficit até a cota.
 */
function alocarReequilibrio(units: DraftUnit[], budget: number): Map<string, number> {
  const out = new Map<string, number>();
  if (budget <= 0 || !units.length) {
    for (const u of units) out.set(u.servicoId, 0);
    return out;
  }

  const elegiveis = units.filter((u) => u.espacoAteCota > 0);
  for (const u of units.filter((u) => u.espacoAteCota <= 0)) {
    out.set(u.servicoId, 0);
  }

  if (!elegiveis.length) {
    return out;
  }

  const totalEspaco = elegiveis.reduce((s, u) => s + u.espacoAteCota, 0);
  let restante = budget;

  if (totalEspaco <= budget) {
    for (const u of elegiveis) {
      out.set(u.servicoId, u.espacoAteCota);
      restante -= u.espacoAteCota;
    }
  } else {
    const pesoTotal = elegiveis.reduce(
      (s, u) => s + (u.participacaoPct > 0 ? u.participacaoPct : u.espacoAteCota),
      0,
    );
    for (const u of elegiveis) {
      const peso = u.participacaoPct > 0 ? u.participacaoPct : u.espacoAteCota;
      const bruto =
        pesoTotal > 0
          ? (budget * peso) / pesoTotal
          : budget / elegiveis.length;
      const alocado = Math.min(u.espacoAteCota, Math.round(bruto));
      out.set(u.servicoId, alocado);
      restante -= alocado;
    }
    if (restante > 0) {
      const ordenados = [...elegiveis].sort(
        (a, b) =>
          b.espacoAteCota - (out.get(b.servicoId) ?? 0) -
          (a.espacoAteCota - (out.get(a.servicoId) ?? 0)),
      );
      for (const u of ordenados) {
        if (restante <= 0) break;
        const cur = out.get(u.servicoId) ?? 0;
        const add = Math.min(restante, u.espacoAteCota - cur);
        if (add > 0) {
          out.set(u.servicoId, cur + add);
          restante -= add;
        }
      }
    }
    if (restante < 0) {
      let excesso = -restante;
      for (const u of [...elegiveis].sort(
        (a, b) => (out.get(b.servicoId) ?? 0) - (out.get(a.servicoId) ?? 0),
      )) {
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

  const gorduraNoPlano = Math.min(
    gorduraMesDisponivel,
    gorduraPeriodoRestante,
    Math.max(0, margemAte1200 - saldoRestante1150),
  );
  const orcamentoDistribuir = Math.min(
    saldoRestante1150 + gorduraNoPlano,
    margemAte1200,
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
    const demanda = Math.round(ritmo * alvos.length);
    const espacoAteCota = Math.max(0, cotaMes - enviado);
    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      fixo: s.fixo,
      enviado,
      cotaMes,
      espacoAteCota,
      mediaHistorica: mediaMap.get(s.id) ?? 0,
      participacaoPct: pctMap.get(s.id) ?? 0,
      ritmo,
      demanda,
    };
  });

  const demandaInercialTotal = drafts.reduce((s, d) => s + d.demanda, 0);
  const aloc = alocarReequilibrio(drafts, orcamentoDistribuir);

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
        espacoAteCota: d.espacoAteCota,
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
      `Já gastou ${fmt(enviadoMes)} em ${mesFechamento}. Restam ${fmt(saldoRestante1150)} até 1.150` +
      (gorduraNoPlano > 0 ? ` + ${fmt(gorduraNoPlano)} gordura` : '') +
      ` → distribuir ${fmt(orcamentoDistribuir)} nas próximas ${alvos.length} semana(s)` +
      (demandaInercialTotal > orcamentoDistribuir
        ? ` (ritmo pediria ${fmt(demandaInercialTotal)} — corte ${fmt(corteTotal)})`
        : '') +
      `. Fecha o mês em ${fmt(fechamentoMesProjetado)}.`;
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
