import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { recalculateFromServer } from '../../lib/snapshotApi';

export default function AdminSyncPage() {
  const { payload, reload, loading } = useData();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading) return null;

  const run = async () => {
    setSyncing(true);
    setMsg(null);
    try {
      await recalculateFromServer();
      await reload();
      setMsg('Snapshot recalculado a partir do histórico por equipamento.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao sincronizar.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="panel">
      <h2>Sincronização</h2>
      <p className="hint">
        Recalcula totais mensais, KPIs, previsões e metodologia a partir da{' '}
        <strong>única fonte</strong>: histórico importado por equipamento (
        {payload?.history.length ?? 0} lançamentos).
      </p>
      <button
        type="button"
        className="primary-btn"
        disabled={syncing || !payload?.history.length}
        onClick={() => void run()}
      >
        {syncing ? 'Recalculando…' : 'Recalcular painel de decisão'}
      </button>
      {msg && <p className="meta sync-ok">{msg}</p>}
    </section>
  );
}
