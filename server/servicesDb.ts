import { normalizeServicesPayload } from '../shared/payloadNormalize.js';
import type { ServicesPayload } from '../shared/serviceTypes.js';
import { getPool } from './db.js';

const EMPTY = normalizeServicesPayload({ services: [], history: [] });

export async function getServicesData(): Promise<ServicesPayload> {
  const res = await getPool().query<{ payload: ServicesPayload }>(
    'SELECT payload FROM services_data WHERE id = 1',
  );
  if (!res.rows.length) return { ...EMPTY };
  const raw = res.rows[0].payload as Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>;
  if (!raw.services) return { ...EMPTY };
  return normalizeServicesPayload({
    services: raw.services ?? [],
    history: raw.history ?? [],
    plans: raw.plans,
    emergencial: raw.emergencial,
    regular: raw.regular,
    updatedAt: raw.updatedAt,
  });
}

export async function saveServicesData(
  payload: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): Promise<ServicesPayload> {
  const normalized = normalizeServicesPayload(payload);
  await getPool().query(
    `INSERT INTO services_data (id, payload, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [JSON.stringify(normalized)],
  );
  return normalized;
}

export async function clearServicesData(): Promise<void> {
  await getPool().query('DELETE FROM services_data WHERE id = 1');
}
