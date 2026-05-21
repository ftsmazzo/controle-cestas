import type { DashboardState } from './types';

const KEY = 'cestas-dashboard-state';

export function saveState(state: DashboardState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function loadState(): DashboardState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardState;
  } catch {
    return null;
  }
}

export function clearState(): void {
  localStorage.removeItem(KEY);
}
