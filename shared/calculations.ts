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
  if (explicit) return explicit;
  const m = mes.toLowerCase();
  const obs = (observacao ?? '').toLowerCase();
  if (m.includes('abr/2026') || m.includes('04/2026') || obs.includes('ruptura')) {
    return 'Ruptura de estoque';
  }
  if (m.includes('mai/2026') || m.includes('05/2026') || obs.includes('parcial')) {
    return 'Parcial';
  }
  return 'Completo';
}

export function processSeries(raw: RawMonthRow[]): ProcessedMonthRow[] {
  const sorted = [...raw].sort((a, b) => {
    const da = parseMonthKey(a.mes);
    const db = parseMonthKey(b.mes);
    return da - db;
  });

  const withStatus = sorted.map((r) => {
    const status = inferStatus(r.mes, r.observacao, r.status);
    return {
      mes: r.mes,
      total: r.total,
      status,
      observacao: r.observacao ?? '',
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

export function parseMonthKey(mes: string): number {
  const s = mes.trim().toLowerCase();
  const months: Record<string, number> = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
  };
  const match = s.match(/(\w{3})\s*\/\s*(\d{2,4})/);
  if (match) {
    const m = months[match[1].slice(0, 3)] ?? 1;
    let y = parseInt(match[2], 10);
    if (y < 100) y += 2000;
    return y * 100 + m;
  }
  const d = Date.parse(mes);
  if (!Number.isNaN(d)) {
    const dt = new Date(d);
    return dt.getFullYear() * 100 + (dt.getMonth() + 1);
  }
  return 0;
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

export function contractScenarios(totalContrato = 18000): ContractScenario[] {
  const niveis = [1500, 1700, 1800, 2000];
  return niveis.map((consumoMensal) => {
    const duracaoMeses = totalContrato / consumoMensal;
    let leitura: string;
    if (consumoMensal <= 1500) leitura = 'Cobre o planejado, sem folga.';
    else if (consumoMensal <= 1700) leitura = 'Risco moderado: contrato acaba antes de 12 meses.';
    else if (consumoMensal <= 1800) leitura = 'Risco alto se o patamar se mantiver.';
    else leitura = 'Risco crítico de insuficiência contratual.';
    return { consumoMensal, duracaoMeses, leitura };
  });
}

export const APRESENTACAO_TEXTO =
  'A análise considera o histórico mensal de consumo, excluindo da modelagem os meses com distorção operacional, como ruptura de estoque e mês parcial. A previsão utiliza tendência histórica, média móvel e controle de anomalias para estimar o comportamento provável da demanda. O volume contratado de 18.000 cestas atende ao cenário de 1.500 cestas/mês, porém apresenta margem reduzida diante de picos recentes e tendência de crescimento, recomendando acompanhamento mensal da autonomia de estoque e gatilhos preventivos de recomposição.';
