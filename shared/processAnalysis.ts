import { buildDashboard } from './buildDashboard.js';
import { computeServiceStats } from './allocation.js';
import { computeForecast } from './calculations.js';
import { allocateMonth } from './allocation.js';
import { parseMonthKey } from './monthUtils.js';
import type {
  ProcessoEmergencialAnalise,
  ProcessoEmergencialConfig,
  ProcessoRegularAnalise,
  ProcessoRegularConfig,
  ProcessoRiscoItem,
} from './processTypes.js';
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
): ProcessoEmergencialAnalise {
  const stats = computeServiceStats(history, services.map((s) => s.id));
  const demandaMensalRef = stats.reduce((s, x) => s + x.mediaHistorica, 0);

  const meses = config.plans.map((plan) => {
    const disp = plan.totalDisponivel || config.cestasPorMes;
    const result = allocateMonth(plan, services, history);
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

  const total4 = config.plans.reduce((s, p) => s + (p.totalDisponivel || config.cestasPorMes), 0);
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
): ProcessoRegularAnalise {
  const rows =
    historicoMensal && historicoMensal.length > 0
      ? historicoMensal
      : aggregateHistoryByMonth(history);

  const dash = buildDashboard(rows, 'Processo regular', config.saldoAtual);
  const { tendencia } = computeForecast(dash.rows, 3);

  const totalPlanejado12 = config.plans.reduce(
    (s, p) => s + (p.totalDisponivel > 0 ? p.totalDisponivel : 0),
    0,
  );

  const media = dash.kpis.mediaMensalValida;
  const mesesCobertos =
    media > 0 ? config.totalContratoAnual / media : 0;

  const alertas: ProcessoRiscoItem[] = [];

  if (totalPlanejado12 > 0 && totalPlanejado12 > config.totalContratoAnual) {
    alertas.push({
      nivel: 'critico',
      titulo: 'Plano 12 meses excede contrato anual',
      descricao: `Soma planejada ${totalPlanejado12} > contrato ${config.totalContratoAnual}.`,
    });
  }

  if (media > config.cestasContratoMensal) {
    alertas.push({
      nivel: 'alto',
      titulo: 'Consumo médio acima do contrato mensal',
      descricao: `Média válida ${Math.round(media)} > ${config.cestasContratoMensal}/mês contratados.`,
    });
  }

  for (const t of tendencia) {
    if (t.valor > config.cestasContratoMensal * 1.1) {
      alertas.push({
        nivel: 'moderado',
        titulo: `Projeção ${t.mes} elevada`,
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
    previsaoProximos3: tendencia.map((t) => t.valor),
    totalPlanejado12,
    totalContratoAnual: config.totalContratoAnual,
    mesesCobertosPeloContrato: mesesCobertos,
    autonomiaMeses: dash.kpis.autonomiaMeses,
    riscoRuptura: dash.kpis.riscoRuptura,
    alertas,
  };
}
