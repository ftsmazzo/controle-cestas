import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { saveSettings } from '../../lib/snapshotApi';
import EmergencialPanel from '../../components/EmergencialPanel';
import RegularPanel from '../../components/RegularPanel';
import { saveServices } from '../../lib/servicesApi';

export default function AdminContractsPage() {
  const { payload, reload, loading, setPayload } = useData();
  const [tab, setTab] = useState<'emergencial' | 'rp'>('emergencial');
  const [msg, setMsg] = useState<string | null>(null);

  if (loading || !payload) return null;

  const onUpdate = async (next: typeof payload) => {
    const saved = await saveServices(next);
    setPayload(saved);
    await reload();
  };

  const saveGlobal = async () => {
    try {
      await saveSettings({
        saldoEstoque: payload.regular.saldoAtual,
        contratoMensal: payload.regular.cestasContratoMensal,
        contratoAnual: payload.regular.totalContratoAnual,
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
        <button type="button" className="secondary" onClick={() => void saveGlobal()}>
          Salvar saldo e metas de contrato (global)
        </button>
        {msg && <p className="meta">{msg}</p>}
      </section>

      {tab === 'emergencial' && (
        <EmergencialPanel data={payload} onUpdate={(n) => void onUpdate(n)} />
      )}
      {tab === 'rp' && (
        <RegularPanel data={payload} onUpdate={(n) => void onUpdate(n)} />
      )}
    </>
  );
}
