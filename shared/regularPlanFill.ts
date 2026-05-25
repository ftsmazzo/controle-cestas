import { computeForecastUntilYearEnd } from './forecastPlan.js';
import { formatMesPt, parseMonthKey } from './monthUtils.js';
import { aggregateHistoryByMonth } from './processAnalysis.js';
import type { ProcessedMonthRow } from './types.js';
import type { MonthlyPlan, ServiceMonthRecord } from './serviceTypes.js';

/** Preenche os 12 meses do registro: histórico por equipamento onde existir, senão previsão (mesma base da Visão geral). */
export function fillRegularPlansFromData(
  plans: MonthlyPlan[],
  history: ServiceMonthRecord[],
  processedRows: ProcessedMonthRow[],
  janela: number | null,
): MonthlyPlan[] {
  if (!plans.length) return plans;

  const histMap = new Map(
    aggregateHistoryByMonth(history).map((r) => [formatMesPt(r.mes), r.total]),
  );
  const maxPlanKey = Math.max(...plans.map((p) => parseMonthKey(p.mes)));
  const { pontos } = computeForecastUntilYearEnd(processedRows, {
    windowMonths: janela,
    endMonthKey: maxPlanKey > 0 ? maxPlanKey : undefined,
  });
  const prevMap = new Map(pontos.map((p) => [formatMesPt(p.mes), p.valor]));

  return plans.map((p) => {
    const mes = formatMesPt(p.mes);
    const hist = histMap.get(mes);
    if (hist != null && hist > 0) {
      return { ...p, totalDisponivel: Math.round(hist) };
    }
    const prev = prevMap.get(mes);
    if (prev != null && prev > 0) {
      return { ...p, totalDisponivel: Math.round(prev) };
    }
    return p;
  });
}

export interface RegularPlanRowView {
  mes: string;
  historico: number | null;
  previsao: number | null;
  planejado: number;
  fonte: 'histórico' | 'previsão' | 'manual' | '—';
}

export function buildRegularPlanTable(
  plans: MonthlyPlan[],
  history: ServiceMonthRecord[],
  processedRows: ProcessedMonthRow[],
  janela: number | null,
): RegularPlanRowView[] {
  const histMap = new Map(
    aggregateHistoryByMonth(history).map((r) => [formatMesPt(r.mes), r.total]),
  );
  const maxPlanKey = Math.max(...plans.map((p) => parseMonthKey(p.mes)), 0);
  const { pontos } = computeForecastUntilYearEnd(processedRows, {
    windowMonths: janela,
    endMonthKey: maxPlanKey > 0 ? maxPlanKey : undefined,
  });
  const prevMap = new Map(pontos.map((p) => [formatMesPt(p.mes), p.valor]));

  return plans.map((p) => {
    const mes = formatMesPt(p.mes);
    const historico = histMap.get(mes) ?? null;
    const previsao = prevMap.get(mes) ?? null;
    const planejado = p.totalDisponivel;
    let fonte: RegularPlanRowView['fonte'] = '—';
    if (planejado > 0) {
      fonte =
        historico != null && Math.round(historico) === planejado
          ? 'histórico'
          : previsao != null && Math.round(previsao) === planejado
            ? 'previsão'
            : 'manual';
    }
    return { mes, historico, previsao, planejado, fonte };
  });
}
