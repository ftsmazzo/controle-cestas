import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { saveSettings } from '../../lib/snapshotApi';
import EmergencialPanel from '../../components/EmergencialPanel';
import RegularPanel from '../../components/RegularPanel';
import { saveServices } from '../../lib/servicesApi';
import type { ServicesPayload } from '@shared/serviceTypes';

export default function AdminContractsPage() {
  const { payload, reload, loading, snapshot } = useData();
  const [tab, setTab] = useState<'emergencial' | 'rp'>('emergencial');
  const [msg, setMsg] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (payload) {
      setDraft(payload);
      setDirty(false);
    }
  }, [payload]);

  if (loading || !payload || !draft) return null;

  const patchDraft = (next: ServicesPayload) => {
    setDraft(next);
    setDirty(true);
  };

  const saveDraft = async () => {
    try {
      setMsg(null);
      await saveServices(draft);
      await reload();
      setMsg('Contratos salvos. A Visão geral usa só o histórico importado (não os 12 campos do registro).');
      setDirty(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  };

  const saveGlobal = async () => {
    try {
      await saveSettings({
        saldoEstoque: draft.regular.saldoAtual,
        contratoMensal: draft.regular.cestasContratoMensal,
        contratoAnual: draft.regular.totalContratoAnual,
      });
      await reload();
      setMsg('Parâmetros globais salvos.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Parâmetros de contrato</h2>
        <p className="hint">
          Alterações aqui <strong>não mudam a Visão geral</strong> até você salvar o histórico ou
          metodologia. Use &quot;Salvar contratos&quot; para gravar emergencial/registro.
        </p>
        <nav className="process-subtabs">
          <button
            type="button"
            className={tab === 'emergencial' ? 'process-subtab active' : 'process-subtab'}
            onClick={() => setTab('emergencial')}
          >
            Emergencial
          </button>
          <button
            type="button"
            className={tab === 'rp' ? 'process-subtab active' : 'process-subtab'}
            onClick={() => setTab('rp')}
          >
            Registro de Preço
          </button>
        </nav>
        <div className="config-grid">
          <button type="button" className="secondary" onClick={() => void saveGlobal()}>
            Salvar saldo e metas (global)
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!dirty}
            onClick={() => void saveDraft()}
          >
            Salvar contratos
          </button>
        </div>
        {msg && <p className="meta">{msg}</p>}
      </section>

      {tab === 'emergencial' && (
        <EmergencialPanel data={draft} onUpdate={patchDraft} />
      )}
      {tab === 'rp' && (
        <RegularPanel
          data={draft}
          onUpdate={patchDraft}
          decisionSnapshot={snapshot}
        />
      )}
    </>
  );
}
