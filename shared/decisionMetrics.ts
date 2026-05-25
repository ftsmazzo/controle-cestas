import type { ForecastPoint, ProcessedMonthRow } from './types.js';
import { parseMonthKey } from './monthUtils.js';

export interface ComparativoContrato {
  contratoMensal: number;
  previsaoProximoMes: number | null;
  mediaPrevisaoFutura: number | null;
  mediaLimpaHistorica: number;
  previsaoVsContrato: number | null;
  mediaPrevisaoVsContrato: number | null;
  mediaLimpaVsContrato: number | null;
  somaPrevisaoFutura: number;
  mesesPrevisao: number;
}

/** Indicadores para decisão: previsão vs contrato (não só média limpa). */
export function comparativoContrato(
  rows: ProcessedMonthRow[],
  contratoMensal: number,
  previsaoProximoMes: number | null,
  pontosPrevisao: ForecastPoint[],
): ComparativoContrato {
  const validos = rows.filter((r) => r.usoNoModelo === 'Sim');
  const mediaLimpa =
    validos.length > 0
      ? validos.reduce((s, r) => s + r.total, 0) / validos.length
      : 0;

  const lastKey =
    validos.length > 0
      ? Math.max(...validos.map((r) => parseMonthKey(r.mes)))
      : 0;
  const ano = lastKey > 0 ? Math.floor(lastKey / 100) : 0;
  const futurosJunDez = pontosPrevisao.filter((p) => {
    if (p.tipo !== 'projecao') return false;
    const k = parseMonthKey(p.mes);
    const m = k % 100;
    return Math.floor(k / 100) === ano && m >= 6 && m <= 12;
  });
  const somaPrevisaoFutura = futurosJunDez.reduce((s, p) => s + p.valor, 0);
  const mediaPrevisaoFutura =
    futurosJunDez.length > 0
      ? somaPrevisaoFutura / futurosJunDez.length
      : null;

  return {
    contratoMensal,
    previsaoProximoMes,
    mediaPrevisaoFutura:
      mediaPrevisaoFutura != null ? Math.round(mediaPrevisaoFutura) : null,
    mediaLimpaHistorica: Math.round(mediaLimpa),
    previsaoVsContrato:
      previsaoProximoMes != null ? previsaoProximoMes - contratoMensal : null,
    mediaPrevisaoVsContrato:
      mediaPrevisaoFutura != null
        ? Math.round(mediaPrevisaoFutura) - contratoMensal
        : null,
    mediaLimpaVsContrato: Math.round(mediaLimpa) - contratoMensal,
    somaPrevisaoFutura,
    mesesPrevisao: futurosJunDez.length,
  };
}

/** Último mês válido (ex.: Mar/2026) — base da tendência projetada. */
export function ultimoMesValidoLabel(rows: ProcessedMonthRow[]): string | null {
  const validos = rows.filter((r) => r.usoNoModelo === 'Sim');
  if (!validos.length) return null;
  const last = validos.reduce((a, b) =>
    parseMonthKey(a.mes) >= parseMonthKey(b.mes) ? a : b,
  );
  return last.mes;
}
