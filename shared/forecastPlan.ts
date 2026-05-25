import { forecastLinear, linearRegression } from './calculations.js';
import {
  pickWindowKeys,
  validMonthKeysFromRows,
} from './analysisWindow.js';
import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import type { ForecastPoint, ProcessedMonthRow } from './types.js';

function incrementMonthKey(key: number): number {
  const year = Math.floor(key / 100);
  const month = key % 100;
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + month + 1;
}

export const PROJECAO_METODO_RESUMO =
  'Tendência calculada só com meses válidos na janela escolhida (ex.: últimos 8 ou 12). A linha roxa no gráfico é regressão linear nessa janela — o mesmo recorte usado em Distribuir mês. Não confundir com a soma das médias por equipamento (só referência na divisão).';

export interface ProjecaoMeta {
  janelaMeses: number | null;
  mesesNaJanela: string[];
  mesesValidosTotal: number;
  mediaJanela: number;
  proximoMesPrevisto: number | null;
  inclinacaoPorMes: number;
  anoAlvo: number;
  ultimoMesHistorico: string;
}

function sliceValidRows(
  rows: ProcessedMonthRow[],
  windowMonths: number | null | undefined,
): ProcessedMonthRow[] {
  const valid = rows.filter((r) => r.usoNoModelo === 'Sim');
  if (windowMonths == null || windowMonths <= 0) return valid;
  return valid.slice(-windowMonths);
}

/** Próximo mês após o último observado, usando a mesma janela da tendência. */
export function forecastNextMonth(
  rows: ProcessedMonthRow[],
  windowMonths: number | null | undefined,
): { valor: number | null; meta: Omit<ProjecaoMeta, 'anoAlvo' | 'ultimoMesHistorico'> & Partial<ProjecaoMeta> } {
  const allValidKeys = validMonthKeysFromRows(rows);
  const windowRows = sliceValidRows(rows, windowMonths);
  if (windowRows.length < 2) {
    return {
      valor: windowRows.length === 1 ? windowRows[0].total : null,
      meta: {
        janelaMeses: windowMonths ?? null,
        mesesNaJanela: windowRows.map((r) => r.mes),
        mesesValidosTotal: allValidKeys.length,
        mediaJanela: windowRows[0]?.total ?? 0,
        proximoMesPrevisto: null,
        inclinacaoPorMes: 0,
      },
    };
  }

  const xs = windowRows.map((_, i) => i + 1);
  const ys = windowRows.map((r) => r.total);
  const { slope } = linearRegression(xs, ys);
  const media = ys.reduce((a, b) => a + b, 0) / ys.length;
  const nextVal = Math.max(0, Math.round(forecastLinear(xs.length + 1, xs, ys)));

  return {
    valor: nextVal,
    meta: {
      janelaMeses: windowMonths ?? null,
      mesesNaJanela: windowRows.map((r) => r.mes),
      mesesValidosTotal: allValidKeys.length,
      mediaJanela: media,
      proximoMesPrevisto: nextVal,
      inclinacaoPorMes: slope,
    },
  };
}

/** Previsão mês a mês até dezembro do ano alvo. */
export function computeForecastUntilYearEnd(
  rows: ProcessedMonthRow[],
  options?: { endYear?: number; windowMonths?: number | null },
): { pontos: ForecastPoint[]; meta: ProjecaoMeta | null } {
  const windowMonths = options?.windowMonths;
  const windowRows = sliceValidRows(rows, windowMonths);
  if (windowRows.length < 2) {
    return { pontos: [], meta: null };
  }

  const xs = windowRows.map((_, i) => i + 1);
  const ys = windowRows.map((r) => r.total);
  const { slope } = linearRegression(xs, ys);
  const media = ys.reduce((a, b) => a + b, 0) / ys.length;

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
    const valor = Math.max(0, Math.round(forecastLinear(x, xs, ys)));
    pontos.push({
      mes: formatMonthKeyPt(cursor),
      valor,
      tipo: 'projecao',
    });
    cursor = incrementMonthKey(cursor);
    if (pontos.length > 18) break;
  }

  const { valor: proximo } = forecastNextMonth(rows, windowMonths);

  const validKeys = validMonthKeysFromRows(rows);
  const picked = pickWindowKeys(validKeys, windowMonths);

  return {
    pontos,
    meta: {
      janelaMeses: windowMonths ?? null,
      mesesNaJanela: picked.map(formatMonthKeyPt),
      mesesValidosTotal: validKeys.length,
      mediaJanela: media,
      proximoMesPrevisto: proximo,
      inclinacaoPorMes: slope,
      anoAlvo: targetYear,
      ultimoMesHistorico: formatMonthKeyPt(lastObserved),
    },
  };
}
