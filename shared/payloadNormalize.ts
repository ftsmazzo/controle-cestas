import { mergeAppSettings } from './appSettings.js';
import { defaultEmergencialConfig, defaultRegularConfig } from './processTypes.js';
import type { ServiceDef, ServicesPayload } from './serviceTypes.js';

function normalizeUnit(s: ServiceDef): ServiceDef {
  return {
    ...s,
    level: s.level ?? 'equipamento',
    parentId: s.parentId ?? null,
  };
}

export function normalizeServicesPayload(
  raw: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): ServicesPayload {
  const history = raw.history ?? [];
  const settings = mergeAppSettings(raw.settings);
  const emergencial = raw.emergencial ?? defaultEmergencialConfig(history);
  const regular = raw.regular ?? defaultRegularConfig(history);
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

  regular.cestasContratoMensal = settings.contratoMensal;
  regular.totalContratoAnual = settings.contratoAnual;

  return {
    services: (raw.services ?? []).map(normalizeUnit),
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
