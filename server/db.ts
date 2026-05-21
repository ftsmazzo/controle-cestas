import pg from 'pg';
import type { DashboardState } from '../shared/types.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL não configurada.');
    }
    pool = new Pool({
      connectionString: url,
      ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function getDashboard(): Promise<{
  state: DashboardState | null;
  saldoAtual: number | null;
}> {
  const res = await getPool().query<{
    state: DashboardState;
    saldo_atual: string | null;
  }>('SELECT state, saldo_atual FROM dashboard_current WHERE id = 1');

  if (!res.rows.length) {
    return { state: null, saldoAtual: null };
  }

  const row = res.rows[0];
  return {
    state: row.state,
    saldoAtual: row.saldo_atual != null ? Number(row.saldo_atual) : null,
  };
}

export async function saveDashboard(
  state: DashboardState,
  saldoAtual: number | null,
): Promise<void> {
  await getPool().query(
    `INSERT INTO dashboard_current (id, state, saldo_atual, updated_at)
     VALUES (1, $1::jsonb, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       state = EXCLUDED.state,
       saldo_atual = EXCLUDED.saldo_atual,
       updated_at = NOW()`,
    [JSON.stringify(state), saldoAtual],
  );
}

export async function clearDashboard(): Promise<void> {
  await getPool().query('DELETE FROM dashboard_current WHERE id = 1');
}

export async function logImport(
  fileName: string,
  saldoAtual: number | null,
  rowCount: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO import_history (file_name, saldo_atual, row_count)
     VALUES ($1, $2, $3)`,
    [fileName, saldoAtual, rowCount],
  );
}

export async function listImports(): Promise<
  { id: string; fileName: string; saldoAtual: number | null; rowCount: number; createdAt: string }[]
> {
  const res = await getPool().query<{
    id: string;
    file_name: string;
    saldo_atual: string | null;
    row_count: number;
    created_at: Date;
  }>(
    `SELECT id, file_name, saldo_atual, row_count, created_at
     FROM import_history ORDER BY created_at DESC LIMIT 50`,
  );
  return res.rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    saldoAtual: r.saldo_atual != null ? Number(r.saldo_atual) : null,
    rowCount: r.row_count,
    createdAt: r.created_at.toISOString(),
  }));
}
