import { getDefaultObservacao } from './methodology.js';
import { formatMesPt, getYearMonth, parseMonthKey } from './monthUtils.js';
import type {
  AnomalyFlag,
  ContractScenario,
  ForecastPoint,
  Kpis,
  MonthStatus,
  ProcessedMonthRow,
  RawMonthRow,
  RiskLevel,
} from './types.js';

export { formatMesPt, parseMonthKey } from './monthUtils.js';

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function linearRegression(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0 };
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function forecastLinear(x: number, xs: number[], ys: number[]): number {
  const { slope, intercept } = linearRegression(xs, ys);
  return slope * x + intercept;
}

export function inferStatus(
  mes: string,
  observacao?: string,
  explicit?: MonthStatus,
): MonthStatus {
  const obs = (observacao ?? '').toLowerCase();
  if (obs.includes('ruptura')) return 'Ruptura de estoque';
  if (
    obs.includes('parcial') ||
    obs.includes('incompleto') ||
    obs.includes('incomplete')
  ) {
    return 'Parcial';
  }

  const ym = getYearMonth(mes);
  if (ym) {
    if (ym.year === 2026 && ym.month === 4) return 'Ruptura de estoque';
    if (ym.year === 2026 && ym.month === 5) return 'Parcial';
  }

  if (explicit) return explicit;
  return 'Completo';
}

export function processSeries(raw: RawMonthRow[]): ProcessedMonthRow[] {
  const normalized = raw.map((r) => ({
    ...r,
    mes: formatMesPt(r.mes),
  }));

  const sorted = [...normalized].sort((a, b) => {
    const da = parseMonthKey(a.mes);
    const db = parseMonthKey(b.mes);
    if (da !== db) return da - db;
    return a.mes.localeCompare(b.mes, 'pt-BR');
  });

  const withStatus = sorted.map((r) => {
    const status = inferStatus(r.mes, r.observacao, r.status);
    const observacao = getDefaultObservacao(r.mes, status, r.observacao);
    return {
      mes: r.mes,
      total: r.total,
      status,
      observacao,
    };
  });

  const ajustados = withStatus.map((r) =>
    r.status === 'Completo' ? r.total : null,
  );
  const validForStats = ajustados.filter((v): v is number => v !== null);
  const meanValid =
    validForStats.length > 0
      ? validForStats.reduce((a, b) => a + b, 0) / validForStats.length
      : 0;
  const stdValid = populationStdDev(validForStats);

  return withStatus.map((r, i) => {
    const totalAjustado = r.status === 'Completo' ? r.total : null;
    const prev = i > 0 ? withStatus[i - 1].total : null;
    const variacaoMm =
      prev !== null && prev !== 0 ? r.total / prev - 1 : null;

    const windowStart = Math.max(0, i - 1);
    const windowEnd = Math.min(withStatus.length, i + 2);
    const windowTotals = withStatus
      .slice(windowStart, windowEnd)
      .map((x) => x.total);
    const mediaMovel3m =
      windowTotals.length >= 2
        ? windowTotals.reduce((a, b) => a + b, 0) / windowTotals.length
        : null;

    let flagAnomalia: AnomalyFlag;
    if (r.status !== 'Completo') {
      flagAnomalia = 'Excluir modelo';
    } else if (stdValid === 0) {
      flagAnomalia = 'Normal';
    } else {
      const z = Math.abs(r.total - meanValid) / stdValid;
      if (z > 2) flagAnomalia = 'Anomalia';
      else if (z > 1) flagAnomalia = 'Atenção';
      else flagAnomalia = 'Normal';
    }

    return {
      mes: r.mes,
      total: r.total,
      status: r.status,
      observacao: r.observacao,
      totalAjustado,
      variacaoMm,
      mediaMovel3m,
      flagAnomalia,
      usoNoModelo: r.status === 'Completo' ? 'Sim' : 'Não',
    };
  });
}

export function computeKpis(
  rows: ProcessedMonthRow[],
  saldoAtual: number | null,
): Kpis {
  const totals = rows.map((r) => r.total);
  const valid = rows
    .map((r) => r.totalAjustado)
    .filter((v): v is number => v !== null);

  const mediaMensalValida =
    valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;

  const autonomiaMeses =
    saldoAtual !== null && saldoAtual > 0 && mediaMensalValida > 0
      ? saldoAtual / mediaMensalValida
      : null;

  return {
    consumoTotalObservado: totals.reduce((a, b) => a + b, 0),
    consumoTotalValido: valid.reduce((a, b) => a + b, 0),
    mediaMensalValida,
    picoConsumo: totals.length ? Math.max(...totals) : 0,
    menorConsumoValido: valid.length ? Math.min(...valid) : 0,
    desvioPadrao: populationStdDev(valid),
    autonomiaMeses,
    riscoRuptura: riskFromAutonomy(autonomiaMeses),
  };
}

export function riskFromAutonomy(autonomia: number | null): RiskLevel {
  if (autonomia === null) return 'Amarelo';
  if (autonomia > 4) return 'Verde';
  if (autonomia >= 2) return 'Amarelo';
  return 'Vermelho';
}

export function computeForecast(
  rows: ProcessedMonthRow[],
  monthsAhead = 3,
): { forecast: ForecastPoint[]; tendencia: ForecastPoint[] } {
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  const xs = validRows.map((_, i) => i + 1);
  const ys = validRows.map((r) => r.total);

  const historico: ForecastPoint[] = rows.map((r) => ({
    mes: r.mes,
    valor: r.total,
    tipo: 'historico',
  }));

  const tendencia: ForecastPoint[] = [];
  const lastX = xs.length;
  for (let i = 1; i <= monthsAhead; i++) {
    const x = lastX + i;
    const valor = Math.max(0, Math.round(forecastLinear(x, xs, ys)));
    tendencia.push({
      mes: `Projeção +${i}`,
      valor,
      tipo: 'projecao',
    });
  }

  return { forecast: historico, tendencia };
}

export function mediaMovelUltimos3Validos(rows: ProcessedMonthRow[]): number | null {
  const valid = rows.filter((r) => r.usoNoModelo === 'Sim').map((r) => r.total);
  if (valid.length === 0) return null;
  const last = valid.slice(-3);
  return last.reduce((a, b) => a + b, 0) / last.length;
}

export { contractScenarios } from './simulation.js';

export const APRESENTACAO_TEXTO =
  'A análise considera o histórico mensal de consumo, excluindo da modelagem Abr/2026 (parada no fornecimento — ruptura de estoque) e Mai/2026 (mês parcial, retorno gradual e racionamento), para que esses valores não sejam interpretados como queda real da demanda. A previsão utiliza apenas meses completos, tendência histórica, média móvel e controle de anomalias. O volume contratado de 18.000 cestas (1.500/mês) deve ser avaliado à luz da utilização média, picos e projeção, com acompanhamento mensal da autonomia de estoque.';
