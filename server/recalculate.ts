import { recalculateSnapshot } from '../shared/recalculateSnapshot.js';
import type { ServicesPayload } from '../shared/serviceTypes.js';
import { saveDashboard } from './db.js';
import { saveServicesData } from './servicesDb.js';

/** Persiste payload e recalcula snapshot derivado (única fonte de KPIs). */
export async function persistAndRecalculate(
  payload: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): Promise<{
  payload: ServicesPayload;
  snapshot: ReturnType<typeof recalculateSnapshot>;
}> {
  const saved = await saveServicesData(payload);
  const snapshot = recalculateSnapshot(saved);
  if (snapshot.state) {
    await saveDashboard(snapshot.state, snapshot.saldoEstoque);
  }
  return { payload: saved, snapshot };
}
