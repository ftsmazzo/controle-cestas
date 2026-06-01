import { mergeAppSettings } from './appSettings.js';
import { mergeEmergencialMonitoring } from './emergencyMonitoring.js';
import { ensureFamiliaHierarchy, enrichServiceDef } from './serviceFamilies.js';
import { defaultEmergencialConfig, defaultRegularConfig } from './processTypes.js';
import { sanitizeProcessPlans } from './processSanitize.js';
import type { ProcessoEmergencialConfig } from './processTypes.js';
import type { ServiceDef, ServicesPayload } from './serviceTypes.js';

function normalizeUnit(s: ServiceDef): ServiceDef {
  return enrichServiceDef({
    ...s,
    level: s.level ?? 'unidade',
    parentId: s.parentId ?? null,
  });
}

export function normalizeServicesPayload(
  raw: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): ServicesPayload {
  const history = raw.history ?? [];
  const settings = mergeAppSettings(raw.settings);
  const base = { history, settings };
  let emergencial: ProcessoEmergencialConfig = {
    ...defaultEmergencialConfig(base),
    ...(raw.emergencial ?? {}),
  };
  emergencial.monitoramento = mergeEmergencialMonitoring(
    raw.emergencial?.monitoramento,
    emergencial.monitoramento,
  );
  let regular = raw.regular ?? defaultRegularConfig(base);
  const sanitized = sanitizeProcessPlans(base, emergencial, regular);
  emergencial = {
    ...sanitized.emergencial,
    monitoramento: mergeEmergencialMonitoring(
      raw.emergencial?.monitoramento,
      sanitized.emergencial.monitoramento,
    ),
  };
  regular = sanitized.regular;

  if (
    emergencial.monitoramento.saldoAtual == null &&
    settings.saldoEstoque != null
  ) {
    emergencial.monitoramento = {
      ...emergencial.monitoramento,
      saldoAtual: settings.saldoEstoque,
    };
  }
  if (emergencial.monitoramento.saldoAtual != null) {
    settings.saldoEstoque = emergencial.monitoramento.saldoAtual;
    regular.saldoAtual = emergencial.monitoramento.saldoAtual;
  }
  const plans =
    raw.plans && raw.plans.length > 0 ? raw.plans : emergencial.plans;

  if (!emergencial.plans.length && plans.length) {
    emergencial.plans = [...plans];
  }

  if (settings.saldoEstoque != null) {
    regular.saldoAtual = settings.saldoEstoque;
  } else if (regular.saldoAtual != null) {
    settings.saldoEstoque = regular.saldoAtual;
  }

  if (settings.contratoMensal === 1500 && settings.contratoAnual === 18000) {
    settings.contratoMensal = 1200;
    settings.contratoAnual = 14400;
  }
  regular.cestasContratoMensal = settings.contratoMensal;
  regular.totalContratoAnual = settings.contratoAnual;

  return {
    services: ensureFamiliaHierarchy((raw.services ?? []).map(normalizeUnit)),
    history,
    plans,
    emergencial,
    regular,
    settings,
    assistance: raw.assistance,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    meta: raw.meta,
  };
}
