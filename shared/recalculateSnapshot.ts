import { buildDashboard } from './buildDashboard.js';
import {
  applyMethodologyToRawRows,
  defaultMethodologySettings,
  resolveJanelaAnaliseMeses,
  type MethodologySettings,
} from './methodologyCalendar.js';
import { aggregateHistoryByMonth } from './processAnalysis.js';
import type { DashboardState } from './types.js';
import type { ServicesPayload } from './serviceTypes.js';
import type { AppSettings } from './appSettings.js';
import { defaultAppSettings, mergeAppSettings } from './appSettings.js';

export interface AppSnapshot {
  state: DashboardState | null;
  saldoEstoque: number | null;
}

export function rawTotalsFromHistory(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
): ReturnType<typeof applyMethodologyToRawRows> {
  const settings = mergeAppSettings(payload.settings);
  const agg = aggregateHistoryByMonth(payload.history);
  const raw = agg.map((r) => ({
    mes: r.mes,
    total: r.total,
    status: r.status,
    observacao: r.observacao,
  }));
  return applyMethodologyToRawRows(raw, settings.methodology);
}

/** Única fonte de KPIs/previsão: histórico por equipamento + metodologia (não usa planos de registro/emergencial). */
export function recalculateSnapshot(
  payload: ServicesPayload,
): AppSnapshot {
  if (!payload.history.length) {
    return { state: null, saldoEstoque: mergeAppSettings(payload.settings).saldoEstoque };
  }

  const settings = mergeAppSettings(payload.settings);
  const raw = rawTotalsFromHistory(payload);
  const fileName =
    payload.meta?.sourceFile ?? 'Histórico por equipamento (fonte única)';
  const janela = resolveJanelaAnaliseMeses(settings.methodology);
  const state = buildDashboard(
    raw,
    fileName,
    settings.saldoEstoque,
    settings.contratoMensal,
    janela,
  );
  return { state, saldoEstoque: settings.saldoEstoque };
}

export function ensureSettings(
  partial?: Partial<AppSettings> | null,
): AppSettings {
  return mergeAppSettings(partial);
}

export { defaultMethodologySettings };
