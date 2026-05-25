import { buildDashboard } from './buildDashboard.js';
import {
  allocateMonth,
  computeServiceStats,
  type AllocateOptions,
} from './allocation.js';
import { computeForecastUntilYearEnd, forecastNextMonth } from './forecastPlan.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
import { processedRowsFromPayload } from './payloadAnalysis.js';
import { parseMonthKey } from './monthUtils.js';
import type {
  ProcessoEmergencialAnalise,
  ProcessoEmergencialConfig,
  ProcessoRegularAnalise,
  ProcessoRegularConfig,
  ProcessoRiscoItem,
} from './processTypes.js';
import { mergeAppSettings, type AppSettings } from './appSettings.js';
import type { RawMonthRow } from './types.js';
import type { ServiceDef, ServiceMonthRecord } from './serviceTypes.js';

function riscoPorGap(gap: number, disponivel: number): ProcessoRiscoItem['nivel'] {
  if (gap <= 0) return 'baixo';
  const pct = disponivel > 0 ? gap / disponivel : 1;
  if (pct <= 0.1) return 'moderado';
  if (pct <= 0.25) return 'alto';
  return 'critico';
}

/** Soma consumo por mês a partir do histórico por equipamento */
export function aggregateHistoryByMonth(
  history: ServiceMonthRecord[],
): RawMonthRow[] {
  const map = new Map<string, number>();
  for (const h of history) {
    map.set(h.mes, (map.get(h.mes) ?? 0) + h.total);
  }
  return [...map.entries()]
    .sort((a, b) => parseMonthKey(a[0]) - parseMonthKey(b[0]))
    .map(([mes, total]) => ({
      mes,
      total,
      status: 'Completo' as const,
    }));
}

export function analyzeEmergencial(
  config: ProcessoEmergencialConfig,
  services: ServiceDef[],
  history: ServiceMonthRecord[],
  allocateOptions?: AllocateOptions,
): ProcessoEmergencialAnalise {
  const stats = computeServiceStats(history, services.map((s) => s.id));
  const demandaMensalRef = stats.reduce((s, x) => s + x.mediaHistorica, 0);

  const meses = config.plans.map((plan) => {
    const disp = plan.totalDisponivel || config.cestasPorMes;
    const result = allocateMonth(plan, services, history, allocateOptions);
    const demanda = result.totalDemandaReferencia;
    const gap = demanda - disp;
    return {
      mes: plan.mes,
      disponivel: disp,
      demandaReferencia: demanda,
      gap,
      risco: riscoPorGap(gap, disp),
    };
  });

  const alertas: ProcessoRiscoItem[] = [];

  for (const m of meses) {
    if (m.gap > 0) {
      alertas.push({
        nivel: riscoPorGap(m.gap, m.disponivel),
        titulo: `${m.mes}: soma das médias acima do total informado`,
        descricao: `Se cada equipamento recebesse sua média histórica, seriam ${m.demandaReferencia} cestas; você informou ${m.disponivel} (diferença ${m.gap}). A divisão usa só ${m.disponivel}; este aviso é comparativo.`,
      });
    }
  }

  if (demandaMensalRef > config.cestasPorMes) {
    alertas.push({
      nivel: 'alto',
      titulo: 'Emergencial abaixo da média histórica total',
      descricao: `Soma das médias por equipamento (${demandaMensalRef}) supera ${config.cestasPorMes}/mês. Priorize fixos e monitore ruptura nos flexíveis.`,
    });
  }

  const total4 = config.plans.reduce(
    (s, p) => s + (p.totalDisponivel || config.cestasPorMes),
    0,
  );
  if (total4 < demandaMensalRef * config.duracaoMeses) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Volume emergencial insuficiente no período',
      descricao: `${config.duracaoMeses} meses × ~${demandaMensalRef} ≈ ${demandaMensalRef * config.duracaoMeses} necessários vs ${total4} previstos.`,
    });
  }

  return { processo: 'emergencial', meses, alertas };
}

export function analyzeRegular(
  config: ProcessoRegularConfig,
  history: ServiceMonthRecord[],
  historicoMensal?: RawMonthRow[],
  settings?: AppSettings,
): ProcessoRegularAnalise {
  const rows =
    historicoMensal && historicoMensal.length > 0
      ? historicoMensal
      : aggregateHistoryByMonth(history);

  const dash = buildDashboard(
    rows,
    'Processo regular',
    config.saldoAtual,
    config.cestasContratoMensal,
    resolveJanelaAnaliseMeses(settings?.methodology),
  );

  const janela = resolveJanelaAnaliseMeses(settings?.methodology);
  const processed =
    historicoMensal && historicoMensal.length >= 3
      ? dash.rows
      : processedRowsFromPayload({
          history,
          settings: mergeAppSettings(settings),
        });

  const { valor: previsaoProximoMes } = forecastNextMonth(processed, janela);
  const { pontos: previsaoPontos } = computeForecastUntilYearEnd(processed, {
    windowMonths: janela,
  });
  const futuros = previsaoPontos.filter((p) => p.tipo === 'projecao');
  const previsaoProximos3 = futuros.slice(0, 3).map((p) => p.valor);
  const mediaPrevisaoFutura =
    futuros.length > 0
      ? futuros.reduce((s, p) => s + p.valor, 0) / futuros.length
      : null;

  const totalPlanejado12 = config.plans.reduce(
    (s, p) => s + (p.totalDisponivel > 0 ? p.totalDisponivel : 0),
    0,
  );

  const media = dash.kpis.mediaMensalValida;
  const refContrato =
    mediaPrevisaoFutura != null
      ? Math.round(mediaPrevisaoFutura)
      : previsaoProximoMes ?? media;

  const mesesCobertos =
    refContrato > 0 ? config.totalContratoAnual / refContrato : 0;
  const mesesCobertosPelaPrevisao =
    mediaPrevisaoFutura != null && mediaPrevisaoFutura > 0
      ? config.totalContratoAnual / Math.round(mediaPrevisaoFutura)
      : null;

  const alertas: ProcessoRiscoItem[] = [];

  if (totalPlanejado12 > 0 && totalPlanejado12 > config.totalContratoAnual) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Plano 12 meses excede contrato anual',
      descricao: `Soma planejada ${totalPlanejado12} > contrato ${config.totalContratoAnual}.`,
    });
  }

  if (
    previsaoProximoMes != null &&
    previsaoProximoMes > config.cestasContratoMensal
  ) {
    alertas.push({
      nivel: 'alto',
      titulo: 'Previsão do próximo mês acima do contrato',
      descricao: `Previsão ~${Math.round(previsaoProximoMes)} > ${config.cestasContratoMensal}/mês contratados (média limpa histórica: ${Math.round(media)}).`,
    });
  } else if (media > config.cestasContratoMensal) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Média histórica acima do contrato mensal',
      descricao: `Média válida ${Math.round(media)} > ${config.cestasContratoMensal}/mês — use a previsão (${previsaoProximoMes != null ? Math.round(previsaoProximoMes) : '—'}) para decisão.`,
    });
  }

  for (const t of futuros.slice(0, 3)) {
    if (t.valor > config.cestasContratoMensal * 1.1) {
      alertas.push({
        nivel: 'moderado',
        titulo: `Previsão ${t.mes} elevada`,
        descricao: `Tendência ~${t.valor} cestas, acima do ritmo contratual.`,
      });
      break;
    }
  }

  if (dash.kpis.riscoRuptura === 'Vermelho') {
    alertas.push({
      nivel: 'critico',
      titulo: 'Autonomia crítica (estoque)',
      descricao: `Menos de 2 meses de cobertura no ritmo médio atual.`,
    });
  } else if (dash.kpis.riscoRuptura === 'Amarelo') {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Autonomia em atenção',
      descricao: `Entre 2 e 4 meses de autonomia — reforçar reposição.`,
    });
  }

  const plansPreenchidos = config.plans.filter((p) => p.totalDisponivel > 0);
  if (plansPreenchidos.length < 6) {
    alertas.push({
      nivel: 'moderado',
      titulo: 'Levantamento regular incompleto',
      descricao: `Preencha os totais mensais dos ${config.duracaoMeses} meses para previsão e risco mais precisos.`,
    });
  }

  return {
    processo: 'regular',
    consumoMedioValido: media,
    previsaoProximoMes,
    mediaPrevisaoFutura:
      mediaPrevisaoFutura != null ? Math.round(mediaPrevisaoFutura) : null,
    previsaoProximos3,
    totalPlanejado12,
    totalContratoAnual: config.totalContratoAnual,
    mesesCobertosPeloContrato: mesesCobertos,
    mesesCobertosPelaPrevisao,
    autonomiaMeses: dash.kpis.autonomiaMeses,
    riscoRuptura: dash.kpis.riscoRuptura,
    alertas,
  };
}
