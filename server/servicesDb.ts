import type { ServicesPayload } from '../shared/serviceTypes.js';
import { getPool } from './db.js';

const EMPTY: ServicesPayload = {
  services: [],
  history: [],
  plans: [],
  updatedAt: '',
};

export async function getServicesData(): Promise<ServicesPayload> {
  const res = await getPool().query<{ payload: ServicesPayload }>(
    'SELECT payload FROM services_data WHERE id = 1',
  );
  if (!res.rows.length) return { ...EMPTY };
  return res.rows[0].payload;
}

export async function saveServicesData(payload: ServicesPayload): Promise<void> {
  await getPool().query(
    `INSERT INTO services_data (id, payload, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = NOW()`,
    [JSON.stringify(payload)],
  );
}

export async function clearServicesData(): Promise<void> {
  await getPool().query('DELETE FROM services_data WHERE id = 1');
}
