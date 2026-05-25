import { forecastLinear, linearRegression } from './calculations.js';
import {
  pickWindowKeys,
  validMonthKeysFromRows,
} from './analysisWindow.js';
import { formatMonthKeyPt, getYearMonth, parseMonthKey } from './monthUtils.js';
import type { ForecastPoint, ProcessedMonthRow } from './types.js';

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
  'Para gargalos e contrato, compare com a previsão (próximo mês e média dos meses futuros no gráfico). A média limpa é só o passado observado — não substitui a tendência. Abr/2026 e Mai/2026 não entram no modelo nem na distribuição por equipamento.';

export interface ProjecaoMeta {
  metodo: 'nota_tecnica' | 'janela';
  janelaMeses: number | null;
  mesesNaJanela: string[];
  mesesValidosTotal: number;
  mediaJanela: number;
  mediaLimpaTotal: number;
  desvioPadraoLimpo: number;
  proximoMesPrevisto: number | null;
  inclinacaoPorMes: number;
  somaPrevisaoAno: number;
  /** Média aritmética dos meses previstos (jun–dez) — use para comparar com contrato */
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

/** Base mensal: linear + média limpa + referência 2025 (mesmo mês). */
function forecastBaseNotaTecnica(
  linear: number,
  mediaLimpa: number,
  ref2025: number | null,
): number {
  if (ref2025 != null) {
    return Math.round(linear * 0.5 + mediaLimpa * 0.25 + ref2025 * 0.25);
  }
  return Math.round(linear * 0.6 + mediaLimpa * 0.4);
}

function buildMetaBase(
  validRows: ProcessedMonthRow[],
  windowRows: ProcessedMonthRow[],
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
  | 'desvioPadraoLimpo'
  | 'inclinacaoPorMes'
> {
  const ysAll = validRows.map((r) => r.total);
  const ysWin = windowRows.map((r) => r.total);
  const xsWin = windowRows.map((_, i) => i + 1);
  const { slope } = linearRegression(xsWin, ysWin);
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
    desvioPadraoLimpo: populationStdDev(ysAll),
    inclinacaoPorMes: slope,
  };
}

/** Próximo mês após o último observado. */
export function forecastNextMonth(
  rows: ProcessedMonthRow[],
  windowMonths: number | null | undefined,
): {
  valor: number | null;
  meta: Partial<ProjecaoMeta>;
} {
  const useNota = windowMonths == null || windowMonths <= 0;
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  const windowRows = sliceValidRows(rows, windowMonths);

  if (windowRows.length < 2) {
    return {
      valor: windowRows.length === 1 ? windowRows[0].total : null,
      meta: buildMetaBase(validRows, windowRows, windowMonths ?? null, useNota ? 'nota_tecnica' : 'janela'),
    };
  }

  const xs = windowRows.map((_, i) => i + 1);
  const ys = windowRows.map((r) => r.total);
  const mediaLimpa =
    validRows.reduce((s, r) => s + r.total, 0) / validRows.length;
  const linear = forecastLinear(xs.length + 1, xs, ys);

  const lastKey = Math.max(
    ...rows.map((r) => parseMonthKey(r.mes)).filter((k) => k > 0),
  );
  const nextKey = incrementMonthKey(lastKey);
  const nextMonth = nextKey % 100;
  const ref2025 = useNota ? consumoMesAno(rows, 2025, nextMonth) : null;

  const valor = useNota
    ? forecastBaseNotaTecnica(linear, mediaLimpa, ref2025)
    : Math.max(0, Math.round(linear));

  return {
    valor,
    meta: {
      ...buildMetaBase(
        validRows,
        windowRows,
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
  options?: { endYear?: number; windowMonths?: number | null },
): { pontos: ForecastPoint[]; meta: ProjecaoMeta | null } {
  const windowMonths = options?.windowMonths;
  const useNota = windowMonths == null || windowMonths <= 0;
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  const windowRows = sliceValidRows(rows, windowMonths);

  if (windowRows.length < 2) {
    return { pontos: [], meta: null };
  }

  const xs = windowRows.map((_, i) => i + 1);
  const ys = windowRows.map((r) => r.total);
  const mediaLimpa =
    validRows.reduce((s, r) => s + r.total, 0) / validRows.length;
  const stdLimpa = populationStdDev(validRows.map((r) => r.total));

  const allKeys = rows.map((r) => parseMonthKey(r.mes)).filter((k) => k > 0);
  if (!allKeys.length) return { pontos: [], meta: null };

  const lastObserved = Math.max(...allKeys);
  const targetYear = options?.endYear ?? Math.floor(lastObserved / 100);
  const endKey = targetYear * 100 + 12;

  const pontos: ForecastPoint[] = [];
  let cursor = incrementMonthKey(lastObserved);
  let x = xs.length;

  while (cursor <= endKey) {
    x += 1;
    const linear = forecastLinear(x, xs, ys);
    const monthNum = cursor % 100;
    const ref2025 = useNota ? consumoMesAno(rows, 2025, monthNum) : null;
    const base = useNota
      ? forecastBaseNotaTecnica(linear, mediaLimpa, ref2025)
      : Math.max(0, Math.round(linear));
    const pessimista = Math.max(0, Math.round(base - stdLimpa));
    const otimista = Math.round(base + stdLimpa);

    pontos.push({
      mes: formatMonthKeyPt(cursor),
      valor: base,
      tipo: 'projecao',
      valorPessimista: useNota ? pessimista : undefined,
      valorOtimista: useNota ? otimista : undefined,
    });
    cursor = incrementMonthKey(cursor);
    if (pontos.length > 18) break;
  }

  const { valor: proximo } = forecastNextMonth(rows, windowMonths);
  const somaPrevisaoAno = pontos.reduce((s, p) => s + p.valor, 0);
  const mediaPrevisaoFutura =
    pontos.length > 0 ? somaPrevisaoAno / pontos.length : 0;
  const ultimoValido = validRows.length
    ? validRows[validRows.length - 1].mes
    : formatMonthKeyPt(lastObserved);

  return {
    pontos,
    meta: {
      ...buildMetaBase(
        validRows,
        windowRows,
        windowMonths ?? null,
        useNota ? 'nota_tecnica' : 'janela',
      ),
      proximoMesPrevisto: proximo,
      somaPrevisaoAno,
      mediaPrevisaoFutura,
      anoAlvo: targetYear,
      ultimoMesHistorico: formatMonthKeyPt(lastObserved),
      ultimoMesValido: ultimoValido,
    },
  };
}
