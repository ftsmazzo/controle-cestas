import { parseMonthKey } from './monthUtils.js';
import {
  excludedMonthKeysFromRows,
  isExcludedPlanningMonth,
  suggestPlanningMonths,
} from './planningMonths.js';
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

  const emergPlanning = suggestPlanningMonths(
    valid,
    emergencial.duracaoMeses,
    excluded,
  );
  let nextEmerg = emergencial;
  if (planNeedsRefresh(emergencial.plans, emergPlanning, excluded)) {
    nextEmerg = {
      ...emergencial,
      plans: rebuildPlans(
        emergPlanning,
        emergencial.plans,
        emergencial.cestasPorMes,
      ),
    };
  }

  const regPlanning = suggestPlanningMonths(
    valid,
    regular.duracaoMeses,
    excluded,
  );
  let nextReg = regular;
  if (planNeedsRefresh(regular.plans, regPlanning, excluded)) {
    nextReg = {
      ...regular,
      plans: rebuildPlans(regPlanning, regular.plans, 0),
    };
  }

  const emergKeys = nextEmerg.plans.map((p) => parseMonthKey(p.mes));
  if (emergKeys.some((k) => excluded.includes(k))) {
    nextEmerg = {
      ...nextEmerg,
      plans: rebuildPlans(
        emergPlanning,
        nextEmerg.plans,
        nextEmerg.cestasPorMes,
      ),
    };
  }

  return { emergencial: nextEmerg, regular: nextReg };
}
