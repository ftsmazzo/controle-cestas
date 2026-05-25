import { forecastLinear, linearRegression } from './calculations.js';
import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import type { ForecastPoint, ProcessedMonthRow } from './types.js';

function incrementMonthKey(key: number): number {
  const year = Math.floor(key / 100);
  const month = key % 100;
  if (month >= 12) return (year + 1) * 100 + 1;
  return year * 100 + month + 1;
}

export const PROJECAO_METODO_RESUMO =
  'Regressão linear sobre os meses marcados como válidos no modelo (exclui COVID/2022-Q1, racionamento/2023, ruptura Abr/2026 e parcial Mai/2026). Cada mês futuro é o valor da reta de tendência, arredondado — não é meta de contrato nem divisão por equipamento.';

export interface ProjecaoMeta {
  mesesValidosUsados: number;
  mediaValida: number;
  inclinacaoPorMes: number;
  anoAlvo: number;
  ultimoMesHistorico: string;
}

/** Previsão mês a mês até dezembro do ano alvo (padrão: ano do último mês no histórico). */
export function computeForecastUntilYearEnd(
  rows: ProcessedMonthRow[],
  endYear?: number,
): { pontos: ForecastPoint[]; meta: ProjecaoMeta | null } {
  const validRows = rows.filter((r) => r.usoNoModelo === 'Sim');
  if (validRows.length < 2) {
    return { pontos: [], meta: null };
  }

  const xs = validRows.map((_, i) => i + 1);
  const ys = validRows.map((r) => r.total);
  const { slope } = linearRegression(xs, ys);
  const media = ys.reduce((a, b) => a + b, 0) / ys.length;

  const keys = rows
    .map((r) => parseMonthKey(r.mes))
    .filter((k) => k > 0);
  if (!keys.length) return { pontos: [], meta: null };

  const lastObserved = Math.max(...keys);
  const targetYear = endYear ?? Math.floor(lastObserved / 100);
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

  return {
    pontos,
    meta: {
      mesesValidosUsados: validRows.length,
      mediaValida: media,
      inclinacaoPorMes: slope,
      anoAlvo: targetYear,
      ultimoMesHistorico: formatMonthKeyPt(lastObserved),
    },
  };
}
