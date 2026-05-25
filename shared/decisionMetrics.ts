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

  const futuros = pontosPrevisao.filter((p) => p.tipo === 'projecao');
  const somaPrevisaoFutura = futuros.reduce((s, p) => s + p.valor, 0);
  const mediaPrevisaoFutura =
    futuros.length > 0 ? somaPrevisaoFutura / futuros.length : null;

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
    mesesPrevisao: futuros.length,
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
