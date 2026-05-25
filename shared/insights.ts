import { parseMonthKey } from './monthUtils.js';
import type { Kpis, ProcessedMonthRow } from './types.js';

export interface InsightsKpis {
  mesesCompletos: number;
  mesesExcluidos: number;
  /** Média dos últimos 3 meses completos antes da ruptura Abr/2026 */
  demandaReferenciaPreRuptura: number | null;
  /** Consumo observado em meses de ruptura (soma) */
  consumoEmRuptura: number;
  /** Estimativa: o que faltou entregar na ruptura vs referência */
  gapEstimadoRuptura: number | null;
  /** Coeficiente de variação (desvio/média) nos meses válidos */
  indiceVolatilidadePct: number;
  /** Variação % média mês a mês (meses válidos) */
  variacaoMediaMensalPct: number | null;
  /** Tendência: último vs primeiro mês válido */
  tendenciaPeriodoPct: number | null;
  /** Média válida / meta contrato mensal (ex. 1500) */
  utilizacaoContratoPct: number;
  /** Projeção +1 vs meta contrato */
  projecao1VsContrato: number | null;
  /** Pico / média válida */
  indicePicoSobreMedia: number;
}

function linearSlopePct(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  return ((last / first) - 1) * 100;
}

export function computeInsights(
  rows: ProcessedMonthRow[],
  kpis: Kpis,
  projecao1: number | null,
  contratoMensal = 1200,
): InsightsKpis {
  const completos = rows.filter((r) => r.usoNoModelo === 'Sim');
  const excluidos = rows.filter((r) => r.usoNoModelo === 'Não');
  const validTotals = completos.map((r) => r.total);

  const rupturaRows = rows.filter((r) => r.status === 'Ruptura de estoque');
  const consumoEmRuptura = rupturaRows.reduce((s, r) => s + r.total, 0);

  const antesRuptura = completos.filter((r) => {
    const k = parseMonthKey(r.mes);
    return k < 202604;
  });
  const ultimos3 = antesRuptura.slice(-3).map((r) => r.total);
  const demandaReferenciaPreRuptura =
    ultimos3.length > 0
      ? ultimos3.reduce((a, b) => a + b, 0) / ultimos3.length
      : kpis.mediaMensalValida > 0
        ? kpis.mediaMensalValida
        : null;

  const gapEstimadoRuptura =
    demandaReferenciaPreRuptura != null && rupturaRows.length > 0
      ? Math.round(
          rupturaRows.reduce(
            (s, r) => s + Math.max(0, demandaReferenciaPreRuptura - r.total),
            0,
          ) / rupturaRows.length,
        )
      : null;

  const media = kpis.mediaMensalValida;
  const indiceVolatilidadePct =
    media > 0 ? (kpis.desvioPadrao / media) * 100 : 0;

  const variacoes = completos
    .map((r) => r.variacaoMm)
    .filter((v): v is number => v !== null);
  const variacaoMediaMensalPct =
    variacoes.length > 0
      ? (variacoes.reduce((a, b) => a + b, 0) / variacoes.length) * 100
      : null;

  return {
    mesesCompletos: completos.length,
    mesesExcluidos: excluidos.length,
    demandaReferenciaPreRuptura:
      demandaReferenciaPreRuptura != null
        ? Math.round(demandaReferenciaPreRuptura)
        : null,
    consumoEmRuptura,
    gapEstimadoRuptura,
    indiceVolatilidadePct,
    variacaoMediaMensalPct,
    tendenciaPeriodoPct: linearSlopePct(validTotals),
    utilizacaoContratoPct: contratoMensal > 0 ? (media / contratoMensal) * 100 : 0,
    projecao1VsContrato:
      projecao1 != null ? projecao1 - contratoMensal : null,
    indicePicoSobreMedia: media > 0 ? kpis.picoConsumo / media : 0,
  };
}

export interface ChartSeriePoint {
  mes: string;
  observado: number;
  ajustado: number | null;
  referencia: number | null;
  mediaMovel: number | null;
  status: string;
  excluido: boolean;
  fillObservado: string;
}

export function buildChartSerie(
  rows: ProcessedMonthRow[],
  demandaReferencia: number | null,
): ChartSeriePoint[] {
  return rows.map((r) => {
    const excluido = r.usoNoModelo === 'Não';
    let fillObservado = '#2563eb';
    if (r.status === 'Ruptura de estoque') fillObservado = '#f87171';
    if (r.status === 'Parcial') fillObservado = '#fbbf24';

    return {
      mes: r.mes,
      observado: r.total,
      ajustado: r.totalAjustado,
      referencia: excluido ? demandaReferencia : null,
      mediaMovel: r.mediaMovel3m,
      status: r.status,
      excluido,
      fillObservado,
    };
  });
}
