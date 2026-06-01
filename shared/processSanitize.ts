import { parseMonthKey } from './monthUtils.js';
import {
  ensureEmpenhoPlans,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import {
  excludedMonthKeysFromRows,
  isExcludedPlanningMonth,
  PLANNING_BLOCKED_MONTH_KEYS,
  suggestPlanningMonths,
} from './planningMonths.js';
import { MONITOR_CONTROLE_MES_INICIO } from './emergencyMonitoring.js';
import {
  processedRowsFromPayload,
  validMonthKeysForPayload,
} from './payloadAnalysis.js';
import type {
  ProcessoEmergencialConfig,
  ProcessoRegularConfig,
} from './processTypes.js';
import type { ServicesPayload } from './serviceTypes.js';

function planNeedsRefresh(
  plans: { mes: string }[],
  planning: string[],
  excluded: number[],
): boolean {
  if (!plans.length) return true;
  if (plans.length !== planning.length) return true;
  return plans.some(
    (p) =>
      isExcludedPlanningMonth(p.mes, excluded) ||
      !planning.includes(p.mes),
  );
}

function rebuildPlans(
  planning: string[],
  existing: { mes: string; totalDisponivel: number }[],
  fallbackTotal: number,
): { mes: string; totalDisponivel: number }[] {
  return planning.map((mes) => {
    const old = existing.find((p) => p.mes === mes);
    return {
      mes,
      totalDisponivel:
        old && old.totalDisponivel > 0 ? old.totalDisponivel : fallbackTotal,
    };
  });
}

export function sanitizeProcessPlans(
  payload: Pick<ServicesPayload, 'history' | 'settings'>,
  emergencial: ProcessoEmergencialConfig,
  regular: ProcessoRegularConfig,
): {
  emergencial: ProcessoEmergencialConfig;
  regular: ProcessoRegularConfig;
} {
  const rows = processedRowsFromPayload(payload);
  const valid = validMonthKeysForPayload(payload);
  const excluded = excludedMonthKeysFromRows(rows);

  const empenhoMeses = suggestEmpenhoMeses(
    emergencial.duracaoMeses,
    emergencial.monitoramento?.mesInicioControle ??
      emergencial.empenhoMeses?.[0] ??
      MONITOR_CONTROLE_MES_INICIO,
  );
  let nextEmerg = emergencial;
  const emergPlanning = empenhoMeses;
  const emergPlansMismatch =
    emergencial.plans.length !== empenhoMeses.length ||
    empenhoMeses.some(
      (m) => !emergencial.plans.some((p) => p.mes === m),
    );
  if (emergPlansMismatch) {
    nextEmerg = {
      ...emergencial,
      empenhoMeses,
      plans: ensureEmpenhoPlans(
        emergencial.plans,
        empenhoMeses,
        emergencial.cestasPorMes,
      ),
    };
  } else if (!nextEmerg.empenhoMeses?.length) {
    nextEmerg = { ...nextEmerg, empenhoMeses };
  }

  const regPlanning = suggestPlanningMonths(
    valid,
    regular.duracaoMeses,
    excluded,
  );
  let nextReg = regular;
  const regHasBlocked = regular.plans.some((p) =>
    PLANNING_BLOCKED_MONTH_KEYS.includes(parseMonthKey(p.mes)),
  );
  if (regHasBlocked || planNeedsRefresh(regular.plans, regPlanning, excluded)) {
    nextReg = {
      ...regular,
      plans: rebuildPlans(regPlanning, regular.plans, 0),
    };
  }

  return { emergencial: nextEmerg, regular: nextReg };
}
