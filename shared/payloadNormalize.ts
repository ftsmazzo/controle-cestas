import { defaultEmergencialConfig, defaultRegularConfig } from './processTypes.js';
import type { ServicesPayload } from './serviceTypes.js';

export function normalizeServicesPayload(
  raw: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): ServicesPayload {
  const history = raw.history ?? [];
  const emergencial = raw.emergencial ?? defaultEmergencialConfig(history);
  const regular = raw.regular ?? defaultRegularConfig(history);
  const plans =
    raw.plans && raw.plans.length > 0 ? raw.plans : emergencial.plans;

  if (!emergencial.plans.length && plans.length) {
    emergencial.plans = [...plans];
  }

  return {
    services: raw.services ?? [],
    history,
    plans,
    emergencial,
    regular,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    meta: raw.meta,
  };
}
