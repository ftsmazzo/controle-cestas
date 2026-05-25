import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MethodologyMonthOverride } from '@shared/methodologyCalendar';
import type { AppSnapshot } from '@shared/recalculateSnapshot';
import type { ServicesPayload } from '@shared/serviceTypes';
import type { DashboardState } from '@shared/types';
import { fetchSnapshot, checkHealth } from '../lib/snapshotApi';

interface DataContextValue {
  loading: boolean;
  apiOk: boolean | null;
  error: string | null;
  payload: ServicesPayload | null;
  snapshot: AppSnapshot;
  dashboard: DashboardState | null;
  methodologyTable: MethodologyMonthOverride[];
  reload: () => Promise<void>;
  setPayload: (p: ServicesPayload | null) => void;
  setSnapshot: (s: AppSnapshot) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ServicesPayload | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot>({
    state: null,
    saldoEstoque: null,
  });
  const [methodologyTable, setMethodologyTable] = useState<
    MethodologyMonthOverride[]
  >([]);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const healthy = await checkHealth();
      setApiOk(healthy);
      if (!healthy) {
        setError('API indisponível. Verifique DATABASE_URL e o deploy.');
        return;
      }
      const data = await fetchSnapshot();
      setPayload(data.payload);
      setSnapshot(data.snapshot);
      setMethodologyTable(data.methodologyTable);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
      setApiOk(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const value = useMemo(
    (): DataContextValue => ({
      loading,
      apiOk,
      error,
      payload,
      snapshot,
      dashboard: snapshot.state,
      methodologyTable,
      reload,
      setPayload,
      setSnapshot,
    }),
    [
      loading,
      apiOk,
      error,
      payload,
      snapshot,
      methodologyTable,
      reload,
    ],
  );

  return (
    <DataContext.Provider value={value}>{children}</DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData deve estar dentro de DataProvider');
  return ctx;
}
