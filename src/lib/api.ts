import type { DashboardState, RawMonthRow } from '@shared/types';
import { apiFetch } from './http';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health');
    const data = (await res.json()) as { ok?: boolean };
    return res.ok && data.ok === true;
  } catch {
    return false;
  }
}

export async function fetchDashboard(): Promise<{
  state: DashboardState | null;
  saldoAtual: number | null;
}> {
  const res = await fetch('/api/dashboard');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    state: DashboardState | null;
    saldoAtual: number | null;
  }>;
}

export async function saveImport(
  fileName: string,
  rows: RawMonthRow[],
  saldoAtual: number | null,
): Promise<{ state: DashboardState; saldoAtual: number | null }> {
  const res = await apiFetch('/api/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, rows, saldoAtual }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{ state: DashboardState; saldoAtual: number | null }>;
}

export async function updateSaldo(
  state: DashboardState,
  saldoAtual: number | null,
): Promise<void> {
  const res = await apiFetch('/api/dashboard', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, saldoAtual }),
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function clearDashboard(): Promise<void> {
  const res = await apiFetch('/api/dashboard', { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

/** Recalcula KPIs/gráficos da Visão geral a partir do histórico por equipamento. */
export async function syncDashboardFromServices(): Promise<{
  state: DashboardState;
  saldoAtual: number | null;
}> {
  const res = await apiFetch('/api/dashboard/sync-from-services', {
    method: 'POST',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<{
    state: DashboardState;
    saldoAtual: number | null;
  }>;
}
