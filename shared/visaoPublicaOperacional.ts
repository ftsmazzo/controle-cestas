import { computeServiceStats } from './allocation.js';
import {
  COTA_FIXA_BASE,
  SERVICOS_FIXOS_NOMES,
  subtrairFixosERatearProporcional,
  tetoCicloOperacional,
} from './cicloOperacionalAllocation.js';
import {
  getCotaFixaDinamica,
  isServicoCotaMensalUnica,
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
import { filtrarHistoricoReferencia } from './processoEmergencial.js';
import { limiteSemanaCicloOperacional } from './projecaoOperacionalCiclo.js';
import { consumptionUnits } from './serviceFamilies.js';
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

function alocacaoCicloPorEquipamento(
  payload: ServicesPayload,
  ciclo: number,
): Map<string, number> {
  const teto = tetoCicloOperacional(ciclo);
  const mon = payload.emergencial.monitoramento;
  const history = filtrarHistoricoReferencia(payload);
  const units = consumptionUnits(payload.services);
  const stats = computeServiceStats(history, units.map((u) => u.id));
  const fixosReais: Record<string, number> = {};
  for (const nome of SERVICOS_FIXOS_NOMES) {
    fixosReais[nome] = getCotaFixaDinamica(
      nome,
      ciclo,
      mon.fixosReaisPorCiclo as Record<number, Record<string, number>>,
    );
  }
  const medias = stats
    .filter((s) => {
      const u = units.find((x) => x.id === s.servicoId);
      return u && !isServicoCotaMensalUnica(u);
    })
    .map((s) => ({
      servicoId: s.servicoId,
      media: s.mediaHistorica,
    }));
  const { alocacoes } = subtrairFixosERatearProporcional({
    totalCiclo: teto,
    fixosReais,
    mediasHistoricas: medias,
    servicosFixos: [...SERVICOS_FIXOS_NOMES],
    perdasAjuste: mon.perdaAjuste ?? 0,
  });
  const byId = new Map<string, number>();
  for (const u of units) {
    byId.set(u.id, alocacoes.get(u.nome) ?? alocacoes.get(u.id) ?? 0);
  }
  return byId;
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

  const idxAtual = indiceOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  if (idxAtual == null) return null;

  const cicloInfo = enviadoCicloOperacionalAte(
    cfg.monitoramento,
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  const ciclo = cicloInfo.ciclo;
  const tetoPeriodo = tetoMaximoCicloOperacional(ciclo);
  const enviadoPeriodo = cicloInfo.enviado;
  const restantePeriodo = Math.max(0, tetoPeriodo - enviadoPeriodo);
  const pctPeriodo =
    tetoPeriodo > 0 ? (enviadoPeriodo / tetoPeriodo) * 100 : 0;

  const consumidoProcesso = totalEnviadoOperacionalAte(
    cfg.monitoramento,
    idxAtual,
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

  const prox = proximaSemanaOperacional(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  const resumoPedidos = prox
    ? buildMonitoramentoResumo(payload, {
        mesReferencia: prox.mes,
        semanaReferencia: prox.semana,
        usarCicloOperacional: true,
        now,
      })
    : null;

  const refPedidos = prox
    ? refSemanaOperacionalCivil(prox.mes, prox.semana, empenhoMeses)
    : null;

  const alocCiclo = alocacaoCicloPorEquipamento(payload, ciclo);
  const enviadoEquip = enviadoPorEquipamentoCiclo(
    payload,
    ciclo,
    idxAtual,
    empenhoMeses,
  );

  const semanasRestantes =
    resumoPedidos?.semanasRestantesCiclo ??
    Math.max(1, SEMANAS_POR_CICLO_OPERACIONAL - (refFechada?.semanaNoCiclo ?? 1));

  const limiteSem = prox
    ? limiteSemanaCicloOperacional(
        payload,
        prox.mes,
        prox.semana,
        enviadoPeriodo,
        tetoPeriodo,
        empenhoMeses,
      )
    : null;

  const cotasSemana: CotasSemanaEquipamento[] = consumptionUnits(
    payload.services,
  ).map((u) => {
    const cotaMensalCiclo = alocCiclo.get(u.id) ?? 0;
    const enviadoCicloEq = enviadoEquip.get(u.id) ?? 0;
    const fixo = isServicoCotaMensalUnica(u);

    if (fixo) {
      const jaLancou = enviadoCicloEq > 0;
      const cota = jaLancou ? 0 : cotaMensalCiclo;
      return {
        servicoId: u.id,
        servicoNome: u.nome,
        familiaCodigo: u.familiaCodigo ?? undefined,
        cotaSemana: cota,
        cotaMensalCiclo,
        enviadoCiclo: enviadoCicloEq,
        tipo: 'fixo_mensal' as const,
        observacao: jaLancou
          ? 'Cota do período já lançada'
          : 'Entrega única no período',
      };
    }

    const cotaSemanalBase = Math.round(
      cotaMensalCiclo / SEMANAS_POR_CICLO_OPERACIONAL,
    );
    const restanteEquip = Math.max(0, cotaMensalCiclo - enviadoCicloEq);
    const cotaSemana = Math.min(
      cotaSemanalBase,
      Math.ceil(restanteEquip / semanasRestantes),
    );

    return {
      servicoId: u.id,
      servicoNome: u.nome,
      familiaCodigo: u.familiaCodigo ?? undefined,
      cotaSemana,
      cotaMensalCiclo,
      enviadoCiclo: enviadoCicloEq,
      tipo: 'rateio' as const,
      observacao:
        resumoPedidos?.planejadoSemanaFlex != null
          ? `Plano flex: ${resumoPedidos.planejadoSemanaFlex}`
          : null,
    };
  });

  const totalCotaBruto = cotasSemana.reduce((s, c) => s + c.cotaSemana, 0);

  const gorduraUsada =
    ciclo === 1 ? Math.max(0, enviadoPeriodo - TETO_MENSAL_OPERACIONAL) : 0;
  const gorduraRestante = Math.max(0, 200 - gorduraUsada);

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
    totalCotaSemanaPedidos: limiteSem
      ? Math.min(limiteSem.limite, totalCotaBruto)
      : totalCotaBruto,
    cotasSemana: cotasSemana.sort((a, b) =>
      a.servicoNome.localeCompare(b.servicoNome, 'pt'),
    ),
    labelPeriodoLeigo: LABEL_PERIODO_LEIGO,
    cicloNumero: ciclo,
    cicloLabel: labelCicloOperacional(ciclo),
    tetoPeriodo,
    enviadoPeriodo,
    restantePeriodo,
    pctPeriodo,
    semaforoPeriodo: semaforoDePct(pctPeriodo, enviadoPeriodo > tetoPeriodo),
    ciclo1Excecao: ciclo === 1 && tetoPeriodo > TETO_MENSAL_OPERACIONAL,
    gorduraUsada,
    gorduraRestante,
    totalProcesso,
    consumidoProcesso,
    saldoProcesso,
    pctProcesso:
      totalProcesso > 0 ? (consumidoProcesso / totalProcesso) * 100 : 0,
    ciclosTotal: TOTAL_CICLOS_OPERACIONAIS,
    indiceOperacionalAtual: idxAtual,
    semanaNoCiclo: refFechada?.semanaNoCiclo ?? 1,
    semanasRestantesCiclo: semanasRestantes,
    atualizadoEm: cfg.monitoramento.saldoAtualizadoEm,
  };
}
