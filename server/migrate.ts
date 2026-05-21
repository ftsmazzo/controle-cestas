import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const migrationsDir = join(__dirname, 'migrations');
  let files: string[];
  try {
    files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    console.warn('[migrate] Pasta migrations não encontrada:', migrationsDir);
    return;
  }

  for (const file of files) {
    const name = file;
    const applied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (applied.rowCount && applied.rowCount > 0) continue;

    const sql = await readFile(join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [name],
      );
      await client.query('COMMIT');
      console.log(`[migrate] Aplicada: ${name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
