import { useEffect, useState } from 'react';
import AdminConsumoSemanalGrid from '../../components/AdminConsumoSemanalGrid';
import { useData } from '../../context/DataContext';
import { saveServices } from '../../lib/servicesApi';
import type { ServicesPayload } from '@shared/serviceTypes';

export default function AdminConsumoPage() {
  const { payload, reload, loading } = useData();
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (payload) {
      setDraft(payload);
      setDirty(false);
    }
  }, [payload]);

  if (loading || !draft) return null;

  const save = async () => {
    try {
      await saveServices(draft);
      await reload();
      setDirty(false);
      setMsg('Consumo salvo.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };

  return (
    <div>
      <header className="panel">
        <h1>Consumo semanal</h1>
        <p className="hint">
          Grade C1S1, C1S2… desde o início do processo. Clique a coluna para
          editar. Cores = % da cota da semana.
        </p>
        {dirty && (
          <>
            <p className="alerta-box alerta-nivel-moderado">
              Alterações pendentes.
            </p>
            <button type="button" className="primary-btn" onClick={() => void save()}>
              Salvar alterações
            </button>
          </>
        )}
        {msg && <p className="hint">{msg}</p>}
      </header>

      <section className="panel">
        <AdminConsumoSemanalGrid
          data={draft}
          onUpdate={(next) => {
            setDraft(next);
            setDirty(true);
          }}
        />
      </section>
    </div>
  );
}
