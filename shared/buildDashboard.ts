import {
  computeForecast,
  computeKpis,
  contractScenarios,
  mediaMovelUltimos3Validos,
  processSeries,
} from './calculations.js';
import type { DashboardState, RawMonthRow } from './types.js';

export function buildDashboard(
  raw: RawMonthRow[],
  fileName: string,
  saldoAtual: number | null,
): DashboardState {
  const rows = processSeries(raw);
  const kpis = computeKpis(rows, saldoAtual);
  const { forecast, tendencia } = computeForecast(rows);
  return {
    rows,
    kpis,
    forecast,
    tendenciaProximos: tendencia,
    mediaMovelUltimos3: mediaMovelUltimos3Validos(rows),
    cenariosContrato: contractScenarios(),
    uploadedAt: new Date().toISOString(),
    fileName,
  };
}
