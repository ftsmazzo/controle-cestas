import { forecastLinear, linearRegression } from './calculations.js';
import {
  pickWindowKeys,
  validMonthKeysFromRows,
} from './analysisWindow.js';
import { formatMonthKeyPt, getYearMonth, parseMonthKey } from './monthUtils.js';
import {
  excludedMonthKeysFromRows,
  PLANNING_BLOCKED_MONTH_KEYS,
} from './planningMonths.js';
import { buildVolumeCenario } from './forecastCenarios.js';
import type { ForecastPoint, ProcessedMonthRow } from './types.js';

/** Mesma base da nota técnica (~1.351): Abr/25 em diante, sem 2023/2024 baixos na regressão. */
export const NOTA_FORECAST_FROM_KEY = 202504;

function incrementMonthKey(key: number): number {
  const year = Math.floor(key / 100);
  const month = key % 100;
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + month + 1;
}

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function consumoMesAno(
  rows: ProcessedMonthRow[],
  year: number,
  month: number,
): number | null {
  const hit = rows.find((r) => {
    if (r.usoNoModelo !== 'Sim') return false;
    const ym = getYearMonth(r.mes);
    return ym?.year === year && ym.month === month;
  });
  return hit?.total ?? null;
}

export const PROJECAO_METODO_RESUMO =
  'Volume de referência: regressão nos últimos 8 meses do período nota (Abr/25+). Volume menor e maior: referência ± desvio padrão do histórico limpo. Planejamento médio: média dos três. Projeção jun–dez não cai mês a mês.';

export interface ProjecaoMeta {
  metodo: 'nota_tecnica' | 'janela';
  janelaMeses: number | null;
  mesesNaJanela: string[];
  mesesValidosTotal: number;
  mediaJanela: number;
  mediaLimpaTotal: number;
  mediaNotaPeriodo: number;
  desvioPadraoLimpo: number;
  proximoMesPrevisto: number | null;
  inclinacaoPorMes: number;
  somaPrevisaoAno: number;
  mediaPrevisaoFutura: number;
  anoAlvo: number;
  ultimoMesHistorico: string;
  ultimoMesValido: string;
}

function sliceValidRows(
  rows: ProcessedMonthRow[],
  windowMonths: number | null | undefined,
): ProcessedMonthRow[] {
  const valid = rows.filter((r) => r.usoNoModelo === 'Sim');
  if (windowMonths == null || windowMonths <= 0) return valid;
  return valid.slice(-windowMonths);
}

/** Janela Abr/25+ para previsão (nota técnica). */
function sliceNotaPeriod(rows: ProcessedMonthRow[]): ProcessedMonthRow[] {
  return rows
    .filter((r) => r.usoNoModelo === 'Sim' && parseMonthKey(r.mes) >= NOTA_FORECAST_FROM_KEY)
    .sort((a, b) => parseMonthKey(a.mes) - parseMonthKey(b.mes));
}

function avgTotals(rows: ProcessedMonthRow[]): number {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + r.total, 0) / rows.length;
}

/** Média recente sem o pior mês (ex. Fev/2026) puxar a previsão para baixo. */
function avgRecentRobust(rows: ProcessedMonthRow[]): number {
  if (rows.length <= 3) return avgTotals(rows);
  const sorted = [...rows].sort((a, b) => a.total - b.total);
  return avgTotals(sorted.slice(1));
}

/** Regressão só na cauda do período nota (evita Jun/25 fraco no início da série). */
function regressionTail(rows: ProcessedMonthRow[], tail = 8): ProcessedMonthRow[] {
  if (rows.length <= tail) return rows;
  return rows.slice(-tail);
}

/**
 * Previsão mensal — não dilui com média limpa total nem com ref. 2025 fraca.
 */
function forecastBaseNotaTecnica(
  linear: number,
  mediaNota: number,
  mediaRecente: number,
  refAnoAnterior: number | null,
): number {
  let v = Math.round(linear * 0.5 + mediaNota * 0.3 + mediaRecente * 0.2);
  if (refAnoAnterior != null && refAnoAnterior >= mediaNota * 0.95) {
    v = Math.round(
      linear * 0.45 + mediaNota * 0.25 + mediaRecente * 0.2 + refAnoAnterior * 0.1,
    );
  }
  return Math.max(
    Math.round(linear),
    Math.round(mediaNota),
    Math.round(mediaRecente),
    v,
  );
}

function buildMetaBase(
  validRows: ProcessedMonthRow[],
  windowRows: ProcessedMonthRow[],
  notaRows: ProcessedMonthRow[],
  windowMonths: number | null,
  metodo: ProjecaoMeta['metodo'],
): Pick<
  ProjecaoMeta,
  | 'metodo'
  | 'janelaMeses'
  | 'mesesNaJanela'
  | 'mesesValidosTotal'
  | 'mediaJanela'
  | 'mediaLimpaTotal'
  | 'mediaNotaPeriodo'
  | 'desvioPadraoLimpo'
  | 'inclinacaoPorMes'
> {
  const ysAll = validRows.map((r) => r.total);
  const ysWin = windowRows.map((r) => r.total);
  const xsWin = windowRows.map((_, i) => i + 1);
  const xsNota = notaRows.map((_, i) => i + 1);
  const ysNota = notaRows.map((r) => r.total);
  const { slope } = linearRegression(
    xsNota.length >= 2 ? xsNota : xsWin,
    ysNota.length >= 2 ? ysNota : ysWin,
  );
  const validKeys = validMonthKeysFromRows(validRows);
  const picked = pickWindowKeys(validKeys, windowMonths);

  return {
    metodo,
    janelaMeses: windowMonths,
    mesesNaJanela: picked.map(formatMonthKeyPt),
    mesesValidosTotal: validKeys.length,
    mediaJanela:
      ysWin.length > 0 ? ysWin.reduce((a, b) => a + b, 0) / ysWin.length : 0,
    mediaLimpaTotal:
      ysAll.length > 0 ? ysAll.reduce((a, b) => a + b, 0) / ysAll.length : 0,
    mediaNotaPeriodo: avgTotals(notaRows),
    desvioPadraoLimpo: populationStdDev(ysAll),
    inclinacaoPorMes: slope,
  };
}

/** Próximo mês de planejamento após o último válido. */
export function forecastNextMonth(
  rows: ProcessedMonthRow[],
  windowMonths: number | null | undefined,
): {
  valor: number | null;
  meta: Partial<ProjecaoMeta>;
} {
  const useNota = windowMonths == null || windowMonths <= 0;
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  const notaRows = sliceNotaPeriod(validRows);
  const recent6 = notaRows.slice(-6);
  const recent3 = notaRows.slice(-3);
  const regRows = useNota ? regressionTail(notaRows, 8) : [];
  const windowRows = useNota
    ? regRows.length >= 2
      ? regRows
      : notaRows.length >= 2
        ? notaRows
        : sliceValidRows(rows, windowMonths)
    : sliceValidRows(rows, windowMonths);

  if (windowRows.length < 2) {
    return {
      valor: windowRows.length === 1 ? windowRows[0].total : null,
      meta: buildMetaBase(
        validRows,
        windowRows,
        notaRows,
        windowMonths ?? null,
        useNota ? 'nota_tecnica' : 'janela',
      ),
    };
  }

  const xs = windowRows.map((_, i) => i + 1);
  const ys = windowRows.map((r) => r.total);
  const mediaNota = avgTotals(notaRows.length ? notaRows : windowRows);
  const mediaRecente = avgRecentRobust(
    recent6.length ? recent6 : windowRows,
  );
  const linear = forecastLinear(xs.length + 1, xs, ys);

  const validKeys = validMonthKeysFromRows(validRows);
  const excluded = new Set([
    ...PLANNING_BLOCKED_MONTH_KEYS,
    ...excludedMonthKeysFromRows(rows),
  ]);
  const lastValid =
    validKeys.length > 0
      ? Math.max(...validKeys)
      : Math.max(...rows.map((r) => parseMonthKey(r.mes)).filter((k) => k > 0));
  let nextKey = incrementMonthKey(lastValid);
  while (excluded.has(nextKey) && nextKey < 203012) {
    nextKey = incrementMonthKey(nextKey);
  }
  const nextMonth = nextKey % 100;
  const ref2025 = useNota ? consumoMesAno(rows, 2025, nextMonth) : null;

  let valor = useNota
    ? forecastBaseNotaTecnica(linear, mediaNota, mediaRecente, ref2025)
    : Math.max(0, Math.round(linear));

  if (useNota) {
    valor = Math.max(
      valor,
      Math.round(mediaNota),
      Math.round(mediaRecente),
      Math.round(mediaNota * 1.02),
    );
    if (recent3.length >= 2) {
      valor = Math.max(valor, Math.round(avgRecentRobust(recent3)));
    }
  }

  return {
    valor,
    meta: {
      ...buildMetaBase(
        validRows,
        windowRows,
        notaRows,
        windowMonths ?? null,
        useNota ? 'nota_tecnica' : 'janela',
      ),
      proximoMesPrevisto: valor,
    },
  };
}

/** Previsão mês a mês até dezembro do ano alvo. */
export function computeForecastUntilYearEnd(
  rows: ProcessedMonthRow[],
  options?: {
    endYear?: number;
    endMonthKey?: number;
    windowMonths?: number | null;
  },
): { pontos: ForecastPoint[]; meta: ProjecaoMeta | null } {
  const windowMonths = options?.windowMonths;
  const useNota = windowMonths == null || windowMonths <= 0;
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  const notaRows = sliceNotaPeriod(validRows);
  const recent6 = notaRows.slice(-6);
  const regRows = useNota ? regressionTail(notaRows, 8) : [];
  const windowRows = useNota
    ? regRows.length >= 2
      ? regRows
      : notaRows.length >= 2
        ? notaRows
        : sliceValidRows(rows, windowMonths)
    : sliceValidRows(rows, windowMonths);

  if (windowRows.length < 2) {
    return { pontos: [], meta: null };
  }

  const mediaLimpa =
    validRows.reduce((s, r) => s + r.total, 0) / validRows.length;
  const stdLimpa = populationStdDev(validRows.map((r) => r.total));
  const mediaNota = avgTotals(notaRows.length ? notaRows : windowRows);

  const validKeys = validMonthKeysFromRows(validRows);
  if (!validKeys.length) return { pontos: [], meta: null };

  const excluded = new Set(excludedMonthKeysFromRows(rows));
  const lastValid = Math.max(...validKeys);
  const targetYear = options?.endYear ?? Math.floor(lastValid / 100);
  const endKey = Math.max(targetYear * 100 + 12, options?.endMonthKey ?? 0);

  const { valor: anchor } = forecastNextMonth(rows, windowMonths);
  if (anchor == null) return { pontos: [], meta: null };

  const tailReg = regressionTail(notaRows.length ? notaRows : windowRows, 8);
  const xsTail = tailReg.map((_, i) => i + 1);
  const ysTail = tailReg.map((r) => r.total);
  const { slope: slopeTail } =
    tailReg.length >= 2
      ? linearRegression(xsTail, ysTail)
      : { slope: 0 };
  const inclinacao = Math.max(0, slopeTail);

  const pontos: ForecastPoint[] = [];
  let cursor = incrementMonthKey(lastValid);
  let step = 0;

  while (cursor <= endKey) {
    if (excluded.has(cursor)) {
      cursor = incrementMonthKey(cursor);
      continue;
    }
    step += 1;
    const base =
      step === 1
        ? anchor
        : Math.max(
            anchor,
            Math.round(anchor + inclinacao * (step - 1)),
          );
    const cenarios = useNota
      ? buildVolumeCenario(base, stdLimpa)
      : null;

    pontos.push({
      mes: formatMonthKeyPt(cursor),
      valor: base,
      tipo: 'projecao',
      cenarioMenor: cenarios?.menor,
      cenarioMaior: cenarios?.maior,
      cenarioMedio: cenarios?.medio,
    });
    cursor = incrementMonthKey(cursor);
    if (!options?.endMonthKey && pontos.length > 18) break;
  }

  const junDez = pontos.filter((p) => {
    const k = parseMonthKey(p.mes);
    const m = k % 100;
    return Math.floor(k / 100) === targetYear && m >= 6 && m <= 12;
  });
  const somaPrevisaoAno = junDez.reduce((s, p) => s + p.valor, 0);
  const mediaPrevisaoFutura =
    junDez.length > 0 ? somaPrevisaoAno / junDez.length : 0;
  const ultimoValido = validRows.length
    ? validRows[validRows.length - 1].mes
    : formatMonthKeyPt(lastValid);

  return {
    pontos,
    meta: {
      ...buildMetaBase(
        validRows,
        windowRows,
        notaRows,
        windowMonths ?? null,
        useNota ? 'nota_tecnica' : 'janela',
      ),
      proximoMesPrevisto: anchor,
      somaPrevisaoAno,
      mediaPrevisaoFutura,
      anoAlvo: targetYear,
      ultimoMesHistorico: formatMonthKeyPt(lastValid),
      ultimoMesValido: ultimoValido,
      mediaLimpaTotal: mediaLimpa,
    },
  };
}
