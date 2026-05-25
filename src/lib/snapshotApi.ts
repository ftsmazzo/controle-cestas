import type { AppSnapshot } from '@shared/recalculateSnapshot';
import type { MethodologyMonthOverride } from '@shared/methodologyCalendar';
import type { ServicesPayload } from '@shared/serviceTypes';
import type { DashboardState } from '@shared/types';
import { apiFetch } from './http';

export interface SnapshotResponse {
  payload: ServicesPayload;
  snapshot: AppSnapshot;
  methodologyTable: MethodologyMonthOverride[];
}

export async function fetchSnapshot(): Promise<SnapshotResponse> {
  const res = await fetch('/api/snapshot');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<SnapshotResponse>;
}

export async function saveSettings(
  settings: Partial<NonNullable<ServicesPayload['settings']>>,
): Promise<ServicesPayload> {
  const res = await apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<ServicesPayload>;
}

export async function recalculateFromServer(): Promise<{
  state: DashboardState | null;
  saldoAtual: number | null;
}> {
  const res = await apiFetch('/api/dashboard/sync-from-services', {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<{
    state: DashboardState | null;
    saldoAtual: number | null;
  }>;
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
