import {
  computeForecast,
  computeKpis,
  mediaMovelUltimos3Validos,
  processSeries,
} from './calculations.js';
import { computeForecastUntilYearEnd } from './forecastPlan.js';
import { computeInsights } from './insights.js';
import { contractScenarios } from './simulation.js';
import type { DashboardState, RawMonthRow } from './types.js';

/** Recalcula KPIs/insights se o JSON salvo estiver desatualizado (ex.: sem campo insights). */
export function hydrateDashboardState(
  state: DashboardState,
  saldoAtual: number | null,
  contratoMensal = 1200,
): DashboardState {
  if (
    state.insights?.mesesCompletos != null &&
    state.previsaoAteFimAno &&
    state.previsaoAteFimAno.length > 0
  ) {
    return state;
  }
  const raw = state.rows.map((r) => ({
    mes: r.mes,
    total: r.total,
    status: r.status,
    observacao: r.observacao,
  }));
  return buildDashboard(raw, state.fileName, saldoAtual, contratoMensal);
}

export function buildDashboard(
  raw: RawMonthRow[],
  fileName: string,
  saldoAtual: number | null,
  contratoMensal = 1200,
): DashboardState {
  const rows = processSeries(raw);
  const kpis = computeKpis(rows, saldoAtual);
  const { forecast, tendencia } = computeForecast(rows);
  const { pontos: previsaoAteFimAno } = computeForecastUntilYearEnd(rows);
  const proj1 = tendencia[0]?.valor ?? null;
  const insights = computeInsights(rows, kpis, proj1, contratoMensal);
  return {
    rows,
    kpis,
    insights,
    forecast,
    tendenciaProximos: tendencia,
    previsaoAteFimAno,
    mediaMovelUltimos3: mediaMovelUltimos3Validos(rows),
    cenariosContrato: contractScenarios(contratoMensal * 12, contratoMensal),
    uploadedAt: new Date().toISOString(),
    fileName,
  };
}
