import {
  getCotaFixaDinamica,
  isServicoCotaMensalUnica,
  TOTAL_RESERVA_COTA_MENSAL_UNICA,
} from './coderpRequisitanteRules.js';
import {
  buildMonitoramentoResumo,
  ultimoLancamentoSemanal,
} from './emergencyMonitoring.js';
import { suggestEmpenhoMeses } from './empenhoControle.js';
import {
  EMPENHO_TOTAL_CESTAS,
  LABEL_PERIODO_LEIGO,
  SEMANAS_POR_CICLO_OPERACIONAL,
  TETO_MENSAL_OPERACIONAL,
  TOTAL_CICLOS_OPERACIONAIS,
} from './monitorConstants.js';
import {
  cicloOperacionalDeIndice,
  civilPorIndiceOperacional,
  enviadoCicloOperacionalAte,
  formatSemanaOperacionalCurta,
  indiceOperacionalCivil,
  labelCicloOperacional,
  proximaSemanaOperacional,
  refSemanaOperacionalCivil,
  tetoMaximoCicloOperacional,
  totalEnviadoOperacionalAte,
} from './operationalWeeks.js';
import { planoJunSemana } from './planoAprovadoCiclo1.js';
import {
  planoCotaSemanalParaUnidade,
  TOTAL_FLEX_PERIODO_4SEM,
  TOTAL_FLEX_SEMANAL_PADRAO,
  usaPlanoSemanalPadrao,
} from './planoCotaSemanalPadrao.js';
import { parseMonthKey } from './monthUtils.js';
import { consumptionUnits } from './serviceFamilies.js';
import type { ServiceDef } from './serviceTypes.js';
import type { ServicesPayload } from './serviceTypes.js';
import { getWeeklyQty } from './weeklyQty.js';

export type SemaforoStatus = 'verde' | 'amarelo' | 'vermelho';

export interface CotasSemanaEquipamento {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  cotaSemana: number;
  cotaMensalCiclo: number;
  enviadoCiclo: number;
  tipo: 'fixo_mensal' | 'rateio';
  observacao: string | null;
}

export interface VisaoPublicaOperacional {
  semanaFechadaLabel: string;
  semanaFechadaPeriodo: string;
  enviadoSemanaFechada: number;
  semanaPedidosLabel: string;
  semanaPedidosPeriodo: string;
  totalCotaSemanaPedidos: number;
  totalCotaFlexSemana: number;
  cotasSemana: CotasSemanaEquipamento[];
  labelPeriodoLeigo: string;
  cicloNumero: number;
  cicloLabel: string;
  tetoPeriodo: number;
  enviadoPeriodo: number;
  restantePeriodo: number;
  pctPeriodo: number;
  semaforoPeriodo: SemaforoStatus;
  ciclo1Excecao: boolean;
  gorduraUsada: number;
  gorduraRestante: number;
  totalProcesso: number;
  consumidoProcesso: number;
  saldoProcesso: number;
  pctProcesso: number;
  ciclosTotal: number;
  indiceOperacionalAtual: number | null;
  semanaNoCiclo: number;
  semanasRestantesCiclo: number;
  atualizadoEm: string | null;
}

function semaforoDePct(pct: number, estourou: boolean): SemaforoStatus {
  if (estourou || pct > 100) return 'vermelho';
  if (pct >= 90) return 'amarelo';
  return 'verde';
}

function enviadoPorEquipamentoCiclo(
  payload: ServicesPayload,
  ciclo: number,
  ateIndice: number,
  empenhoMeses: string[],
): Map<string, number> {
  const mon = payload.emergencial.monitoramento;
  const inicio = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const out = new Map<string, number>();
  for (const u of consumptionUnits(payload.services)) {
    let t = 0;
    for (let i = inicio; i <= ateIndice; i++) {
      const civil = civilPorIndiceOperacional(i, empenhoMeses);
      if (!civil) continue;
      t += getWeeklyQty(mon, civil.mes, civil.semana, u.id);
    }
    out.set(u.id, t);
  }
  return out;
}

/** Cota da semana de pedidos — plano aprovado, não rateio dinâmico por restante */
function cotaSemanaPedidos(
  u: ServiceDef,
  cicloPedidos: number,
  mesPedidos: string,
  semanaPedidos: number,
  enviadoNoCiclo: number,
  fixosReaisPorCiclo: ServicesPayload['emergencial']['monitoramento']['fixosReaisPorCiclo'],
): Pick<CotasSemanaEquipamento, 'cotaSemana' | 'cotaMensalCiclo' | 'tipo' | 'observacao'> {
  if (isServicoCotaMensalUnica(u)) {
    const cotaMensal = getCotaFixaDinamica(
      u.nome,
      cicloPedidos,
      fixosReaisPorCiclo as Record<number, Record<string, number>>,
    );
    const jaLancouNoCiclo = enviadoNoCiclo > 0;
    return {
      cotaSemana: jaLancouNoCiclo ? 0 : cotaMensal,
      cotaMensalCiclo: cotaMensal,
      tipo: 'fixo_mensal',
      observacao: jaLancouNoCiclo
        ? 'Entrega única do período já registrada'
        : 'Entrega única no período (fora das 264/semana)',
    };
  }

  if (usaPlanoSemanalPadrao(cicloPedidos)) {
    const cota = planoCotaSemanalParaUnidade(u.nome) ?? 0;
    return {
      cotaSemana: cota,
      cotaMensalCiclo: cota * SEMANAS_POR_CICLO_OPERACIONAL,
      tipo: 'rateio',
      observacao: 'Plano aprovado pós-retomada',
    };
  }

  // Ciclo 1 excepcional: Jun S1/S2 com plano de corte
  const junKey = parseMonthKey('Jun/2026');
  if (
    parseMonthKey(mesPedidos) === junKey &&
    (semanaPedidos === 1 || semanaPedidos === 2)
  ) {
    const cota =
      planoJunSemana(u.nome, semanaPedidos as 1 | 2) ??
      planoCotaSemanalParaUnidade(u.nome) ??
      0;
    return {
      cotaSemana: cota,
      cotaMensalCiclo: cota * SEMANAS_POR_CICLO_OPERACIONAL,
      tipo: 'rateio',
      observacao: `Plano ciclo 1 · Jun S${semanaPedidos}`,
    };
  }

  const padrao = planoCotaSemanalParaUnidade(u.nome) ?? 0;
  return {
    cotaSemana: padrao,
    cotaMensalCiclo: padrao * SEMANAS_POR_CICLO_OPERACIONAL,
    tipo: 'rateio',
    observacao: 'Plano aprovado',
  };
}

export function buildVisaoPublicaOperacional(
  payload: ServicesPayload,
  now: Date = new Date(),
): VisaoPublicaOperacional | null {
  const cfg = payload.emergencial;
  if (!cfg.monitoramento.entradasSemanais.length) return null;

  const empenhoMeses =
    cfg.empenhoMeses?.length
      ? cfg.empenhoMeses
      : suggestEmpenhoMeses(cfg.duracaoMeses ?? 4);

  const ultimo = ultimoLancamentoSemanal(cfg.monitoramento);
  if (!ultimo) return null;

  const idxUltimo = indiceOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  if (idxUltimo == null) return null;

  const prox = proximaSemanaOperacional(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );

  const cicloFechado = cicloOperacionalDeIndice(idxUltimo);
  const cicloPedidos = prox
    ? cicloOperacionalDeIndice(prox.indice)
    : cicloFechado;

  const cicloExibicao = cicloPedidos;
  const tetoPeriodo = tetoMaximoCicloOperacional(cicloExibicao);
  const enviadoPeriodo =
    cicloPedidos > cicloFechado
      ? 0
      : enviadoCicloOperacionalAte(
          cfg.monitoramento,
          ultimo.mes,
          ultimo.semana,
          empenhoMeses,
        ).enviado;
  const restantePeriodo = Math.max(0, tetoPeriodo - enviadoPeriodo);
  const pctPeriodo =
    tetoPeriodo > 0 ? (enviadoPeriodo / tetoPeriodo) * 100 : 0;

  const consumidoProcesso = totalEnviadoOperacionalAte(
    cfg.monitoramento,
    idxUltimo,
    empenhoMeses,
  );
  const totalProcesso = cfg.empenhoTotalCestas ?? EMPENHO_TOTAL_CESTAS;
  const saldoProcesso = Math.max(0, totalProcesso - consumidoProcesso);

  const refFechada = refSemanaOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  const resumoFechada = buildMonitoramentoResumo(payload, {
    mesReferencia: ultimo.mes,
    semanaReferencia: ultimo.semana,
    usarCicloOperacional: true,
    now,
  });

  const refPedidos = prox
    ? refSemanaOperacionalCivil(prox.mes, prox.semana, empenhoMeses)
    : null;

  const idxEnvioCicloPedidos =
    prox && cicloPedidos > cicloFechado
      ? (cicloPedidos - 1) * SEMANAS_POR_CICLO_OPERACIONAL
      : idxUltimo;

  const enviadoEquip = enviadoPorEquipamentoCiclo(
    payload,
    cicloPedidos,
    idxEnvioCicloPedidos,
    empenhoMeses,
  );

  const mesPedidos = prox?.mes ?? ultimo.mes;
  const semanaPedidos = prox?.semana ?? ultimo.semana;

  const cotasSemana: CotasSemanaEquipamento[] = consumptionUnits(
    payload.services,
  ).map((u) => {
    const enviadoCicloEq = enviadoEquip.get(u.id) ?? 0;
    const cotas = cotaSemanaPedidos(
      u,
      cicloPedidos,
      mesPedidos,
      semanaPedidos,
      enviadoCicloEq,
      cfg.monitoramento.fixosReaisPorCiclo,
    );
    return {
      servicoId: u.id,
      servicoNome: u.nome,
      familiaCodigo: u.familiaCodigo ?? undefined,
      enviadoCiclo: enviadoCicloEq,
      ...cotas,
    };
  });

  const totalCotaFlexSemana = cotasSemana
    .filter((c) => c.tipo === 'rateio')
    .reduce((s, c) => s + c.cotaSemana, 0);

  const totalFixosPendentes = cotasSemana
    .filter((c) => c.tipo === 'fixo_mensal')
    .reduce((s, c) => s + c.cotaSemana, 0);

  const gorduraUsada =
    cicloExibicao === 1
      ? Math.max(0, enviadoPeriodo - TETO_MENSAL_OPERACIONAL)
      : 0;
  const gorduraRestante = Math.max(0, 200 - gorduraUsada);

  const semanasRestantesCiclo = prox
    ? SEMANAS_POR_CICLO_OPERACIONAL - (refPedidos?.semanaNoCiclo ?? 1) + 1
    : SEMANAS_POR_CICLO_OPERACIONAL - (refFechada?.semanaNoCiclo ?? 1);

  return {
    semanaFechadaLabel:
      refFechada?.label ??
      formatSemanaOperacionalCurta(ultimo.mes, ultimo.semana, empenhoMeses),
    semanaFechadaPeriodo: refFechada?.periodo ?? '—',
    enviadoSemanaFechada:
      resumoFechada.enviadoSemanaFlex ?? resumoFechada.enviadoSemanaAtual,
    semanaPedidosLabel:
      refPedidos?.label ??
      (prox
        ? formatSemanaOperacionalCurta(prox.mes, prox.semana, empenhoMeses)
        : '—'),
    semanaPedidosPeriodo: refPedidos?.periodo ?? '—',
    totalCotaSemanaPedidos: totalCotaFlexSemana + totalFixosPendentes,
    totalCotaFlexSemana,
    cotasSemana: cotasSemana.sort((a, b) =>
      a.servicoNome.localeCompare(b.servicoNome, 'pt'),
    ),
    labelPeriodoLeigo: LABEL_PERIODO_LEIGO,
    cicloNumero: cicloExibicao,
    cicloLabel: labelCicloOperacional(cicloExibicao),
    tetoPeriodo,
    enviadoPeriodo,
    restantePeriodo,
    pctPeriodo,
    semaforoPeriodo: semaforoDePct(pctPeriodo, enviadoPeriodo > tetoPeriodo),
    ciclo1Excecao: cicloExibicao === 1 && tetoPeriodo > TETO_MENSAL_OPERACIONAL,
    gorduraUsada,
    gorduraRestante,
    totalProcesso,
    consumidoProcesso,
    saldoProcesso,
    pctProcesso:
      totalProcesso > 0 ? (consumidoProcesso / totalProcesso) * 100 : 0,
    ciclosTotal: TOTAL_CICLOS_OPERACIONAIS,
    indiceOperacionalAtual: idxUltimo,
    semanaNoCiclo: refPedidos?.semanaNoCiclo ?? refFechada?.semanaNoCiclo ?? 1,
    semanasRestantesCiclo: Math.max(1, semanasRestantesCiclo),
    atualizadoEm: cfg.monitoramento.saldoAtualizadoEm,
  };
}

export {
  TOTAL_FLEX_PERIODO_4SEM,
  TOTAL_FLEX_SEMANAL_PADRAO,
  TOTAL_RESERVA_COTA_MENSAL_UNICA,
};
