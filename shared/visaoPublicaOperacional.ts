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
  CICLO_INICIO_CONTROLE_ESTOURO,
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
  /** Plano antes do desconto por estouro na semana anterior */
  cotaPlanoOriginal?: number;
  cotaMensalCiclo: number;
  enviadoCiclo: number;
  tipo: 'fixo_mensal' | 'rateio';
  observacao: string | null;
}

export type TipoAlertaEstouro = 'penalidade' | 'compensacao';

export interface AlertaEstouroSemanal {
  servicoId: string;
  servicoNome: string;
  semanaFechadaLabel: string;
  semanaNoCiclo: number;
  cotaSemanaPrevista: number;
  enviadoSemana: number;
  /** Acima da cota só desta semana */
  excessoSemanal: number;
  pctAcimaSemana: number;
  /** Desconto aplicado na próxima semana (0 se compensação) */
  excessoPenalizavel: number;
  enviadoPeriodo: number;
  cotaPeriodo: number;
  saldoPeriodo: number;
  enviadoSemanaAnterior: number | null;
  cotaSemanaAnterior: number | null;
  semanaAnteriorLabel: string | null;
  tipo: TipoAlertaEstouro;
  aplicaDesconto: boolean;
  motivo: string;
  cotaPlanoProximaSemana: number;
  cotaAjustadaProximaSemana: number;
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
  /** Compensação/desconto por estouro — false no ciclo 1 (retomada excepcional) */
  controleEstouroAtivo: boolean;
  alertasEstouroSemana: AlertaEstouroSemanal[];
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

/** Cota semanal do plano (flexível) — sem fixos mensais */
function cotaSemanaPlanoFlex(
  u: ServiceDef,
  ciclo: number,
  mes: string,
  semana: number,
): number {
  if (isServicoCotaMensalUnica(u)) return 0;

  if (usaPlanoSemanalPadrao(ciclo)) {
    return planoCotaSemanalParaUnidade(u.nome) ?? 0;
  }

  const junKey = parseMonthKey('Jun/2026');
  if (parseMonthKey(mes) === junKey && (semana === 1 || semana === 2)) {
    return (
      planoJunSemana(u.nome, semana as 1 | 2) ??
      planoCotaSemanalParaUnidade(u.nome) ??
      0
    );
  }

  return planoCotaSemanalParaUnidade(u.nome) ?? 0;
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

  const padrao = cotaSemanaPlanoFlex(u, cicloPedidos, mesPedidos, semanaPedidos);
  return {
    cotaSemana: padrao,
    cotaMensalCiclo: padrao * SEMANAS_POR_CICLO_OPERACIONAL,
    tipo: 'rateio',
    observacao: 'Plano aprovado',
  };
}

/** Cota total do equipamento no período de 4 semanas */
function cotaPeriodoEquipamento(
  u: ServiceDef,
  ciclo: number,
  empenhoMeses: string[],
): number {
  const inicio = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const fim = ciclo * SEMANAS_POR_CICLO_OPERACIONAL;
  let total = 0;
  for (let i = inicio; i <= fim; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    total += cotaSemanaPlanoFlex(u, ciclo, civil.mes, civil.semana);
  }
  return total;
}

function buildAlertasEstouroSemana(
  payload: ServicesPayload,
  ultimo: { mes: string; semana: number },
  cicloFechado: number,
  idxUltimo: number,
  semanaFechadaLabel: string,
  semanaNoCicloFechada: number,
  cotasPorId: Map<string, CotasSemanaEquipamento>,
  empenhoMeses: string[],
): AlertaEstouroSemanal[] {
  if (cicloFechado < CICLO_INICIO_CONTROLE_ESTOURO) return [];

  const mon = payload.emergencial.monitoramento;
  const alertas: AlertaEstouroSemanal[] = [];
  const inicioCiclo = (cicloFechado - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const enviadoPeriodoMap = enviadoPorEquipamentoCiclo(
    payload,
    cicloFechado,
    idxUltimo,
    empenhoMeses,
  );

  let semanaAnteriorLabel: string | null = null;
  let civilAnterior: { mes: string; semana: number } | null = null;
  if (idxUltimo > inicioCiclo) {
    civilAnterior = civilPorIndiceOperacional(idxUltimo - 1, empenhoMeses);
    const refAnt = civilAnterior
      ? refSemanaOperacionalCivil(
          civilAnterior.mes,
          civilAnterior.semana,
          empenhoMeses,
        )
      : null;
    semanaAnteriorLabel = refAnt?.label ?? null;
  }

  for (const u of consumptionUnits(payload.services)) {
    if (isServicoCotaMensalUnica(u)) continue;

    const cotaPrevista = cotaSemanaPlanoFlex(
      u,
      cicloFechado,
      ultimo.mes,
      ultimo.semana,
    );
    if (cotaPrevista <= 0) continue;

    const enviado = getWeeklyQty(mon, ultimo.mes, ultimo.semana, u.id);
    const excessoSemanal = Math.max(0, enviado - cotaPrevista);
    if (excessoSemanal <= 0) continue;

    const cotaPeriodo = cotaPeriodoEquipamento(u, cicloFechado, empenhoMeses);
    const enviadoPeriodo = enviadoPeriodoMap.get(u.id) ?? 0;
    const saldoPeriodo = cotaPeriodo - enviadoPeriodo;
    const excessoPeriodo = Math.max(0, enviadoPeriodo - cotaPeriodo);

    let enviadoSemanaAnterior: number | null = null;
    let cotaSemanaAnterior: number | null = null;
    if (civilAnterior) {
      enviadoSemanaAnterior = getWeeklyQty(
        mon,
        civilAnterior.mes,
        civilAnterior.semana,
        u.id,
      );
      cotaSemanaAnterior = cotaSemanaPlanoFlex(
        u,
        cicloFechado,
        civilAnterior.mes,
        civilAnterior.semana,
      );
    }

    const cotaPedidos = cotasPorId.get(u.id);
    const cotaPlanoProxima = cotaPedidos?.cotaSemana ?? 0;

    const folgaSemanaAnterior =
      enviadoSemanaAnterior != null && cotaSemanaAnterior != null
        ? Math.max(0, cotaSemanaAnterior - enviadoSemanaAnterior)
        : 0;

    let tipo: TipoAlertaEstouro;
    let excessoPenalizavel: number;
    let aplicaDesconto: boolean;
    let motivo: string;

    if (excessoPeriodo > 0) {
      tipo = 'penalidade';
      excessoPenalizavel = excessoPeriodo;
      aplicaDesconto = true;
      motivo =
        `Estourou o teto do período de 4 semanas (${enviadoPeriodo} de ${cotaPeriodo} cestas). ` +
        `O desconto na próxima semana é de ${excessoPenalizavel} cesta${excessoPenalizavel > 1 ? 's' : ''} (excesso do período, não só desta semana).`;
    } else {
      tipo = 'compensacao';
      excessoPenalizavel = 0;
      aplicaDesconto = false;
      if (folgaSemanaAnterior > 0 && semanaAnteriorLabel) {
        motivo =
          `Pediu ${enviado} nesta semana (cota ${cotaPrevista}, +${excessoSemanal}), mas ` +
          `em ${semanaAnteriorLabel} pediu só ${enviadoSemanaAnterior} (cota ${cotaSemanaAnterior}). ` +
          `No período de 4 semanas vai ${enviadoPeriodo} de ${cotaPeriodo} — compensação dentro do período, sem desconto.`;
      } else {
        motivo =
          `Acima da cota desta semana (+${excessoSemanal}), porém ainda dentro do ` +
          `período de 4 semanas (${enviadoPeriodo} de ${cotaPeriodo} cestas). Sem desconto na próxima semana.`;
      }
    }

    const cotaAjustada = aplicaDesconto
      ? Math.max(0, cotaPlanoProxima - excessoPenalizavel)
      : cotaPlanoProxima;

    alertas.push({
      servicoId: u.id,
      servicoNome: u.nome,
      semanaFechadaLabel,
      semanaNoCiclo: semanaNoCicloFechada,
      cotaSemanaPrevista: cotaPrevista,
      enviadoSemana: enviado,
      excessoSemanal,
      pctAcimaSemana:
        cotaPrevista > 0 ? (excessoSemanal / cotaPrevista) * 100 : 0,
      excessoPenalizavel,
      enviadoPeriodo,
      cotaPeriodo,
      saldoPeriodo,
      enviadoSemanaAnterior,
      cotaSemanaAnterior,
      semanaAnteriorLabel,
      tipo,
      aplicaDesconto,
      motivo,
      cotaPlanoProximaSemana: cotaPlanoProxima,
      cotaAjustadaProximaSemana: cotaAjustada,
    });
  }

  return alertas.sort((a, b) => {
    if (a.aplicaDesconto !== b.aplicaDesconto) {
      return a.aplicaDesconto ? -1 : 1;
    }
    return b.excessoSemanal - a.excessoSemanal;
  });
}

function aplicarAjustesEstouro(
  cotas: CotasSemanaEquipamento[],
  alertas: AlertaEstouroSemanal[],
): CotasSemanaEquipamento[] {
  const porId = new Map(alertas.map((a) => [a.servicoId, a]));
  return cotas.map((c) => {
    const a = porId.get(c.servicoId);
    if (!a || c.tipo !== 'rateio' || !a.aplicaDesconto) return c;
    return {
      ...c,
      cotaPlanoOriginal: a.cotaPlanoProximaSemana,
      cotaSemana: a.cotaAjustadaProximaSemana,
      observacao: `Ajuste −${a.excessoPenalizavel} (período estourado)`,
    };
  });
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

  const semanaFechadaLabel =
    refFechada?.label ??
    formatSemanaOperacionalCurta(ultimo.mes, ultimo.semana, empenhoMeses);

  const cotasPorId = new Map(cotasSemana.map((c) => [c.servicoId, c]));
  const alertasEstouroSemana = buildAlertasEstouroSemana(
    payload,
    ultimo,
    cicloFechado,
    idxUltimo,
    semanaFechadaLabel,
    refFechada?.semanaNoCiclo ?? 1,
    cotasPorId,
    empenhoMeses,
  );
  const cotasAjustadas = aplicarAjustesEstouro(cotasSemana, alertasEstouroSemana);

  const totalCotaFlexSemana = cotasAjustadas
    .filter((c) => c.tipo === 'rateio')
    .reduce((s, c) => s + c.cotaSemana, 0);

  const totalFixosPendentes = cotasAjustadas
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
    semanaFechadaLabel,
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
    cotasSemana: cotasAjustadas.sort((a, b) =>
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
    controleEstouroAtivo: cicloFechado >= CICLO_INICIO_CONTROLE_ESTOURO,
    alertasEstouroSemana,
  };
}

export {
  TOTAL_FLEX_PERIODO_4SEM,
  TOTAL_FLEX_SEMANAL_PADRAO,
  TOTAL_RESERVA_COTA_MENSAL_UNICA,
};
