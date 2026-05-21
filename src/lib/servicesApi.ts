import type {
  MonthAllocationResult,
  ServicesMeta,
  ServicesPayload,
} from '@shared/serviceTypes';

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function fetchServices(): Promise<ServicesPayload> {
  const res = await fetch('/api/services');
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ServicesPayload>;
}

export async function saveServices(
  payload: Partial<ServicesPayload> & Pick<ServicesPayload, 'services' | 'history'>,
): Promise<ServicesPayload> {
  const res = await fetch('/api/services', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ServicesPayload>;
}

export async function importServices(
  history: ServicesPayload['history'],
  services: ServicesPayload['services'],
  options?: { merge?: boolean; meta?: ServicesMeta },
): Promise<ServicesPayload> {
  const res = await fetch('/api/services/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      history,
      services,
      merge: options?.merge ?? true,
      meta: options?.meta,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json() as Promise<ServicesPayload>;
}

export async function calculateAllocation(
  payload: ServicesPayload,
): Promise<MonthAllocationResult[]> {
  const res = await fetch('/api/services/allocate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { results: MonthAllocationResult[] };
  return data.results;
}

export async function clearServices(): Promise<void> {
  const res = await fetch('/api/services', { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}
