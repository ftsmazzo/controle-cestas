import { useEffect, useState } from 'react';
import AdminMonitorSemanal from '../../components/AdminMonitorSemanal';
import { useData } from '../../context/DataContext';
import { saveServices } from '../../lib/servicesApi';
import { EMPENHO_TOTAL_CESTAS } from '@shared/monitorConstants';
import type { ServicesPayload } from '@shared/serviceTypes';
import './AdminMonitorEmergencialPage.css';

export default function AdminMonitorEmergencialPage() {
  const { payload, reload, loading } = useData();
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (payload) {
      setDraft(payload);
      setDirty(false);
    }
  }, [payload]);

  if (loading || !payload || !draft) return null;

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveServices(draft);
      await reload();
      setDirty(false);
      setMsg('Publicado. O painel em / já reflete estes números.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="monitor-page">
      <header className="monitor-page-head panel">
        <div>
          <h1>Publicar semana</h1>
          <p className="hint">
            Processo {EMPENHO_TOTAL_CESTAS.toLocaleString('pt-BR')} cestas · mesma
            régua do painel público (períodos qua–ter, 1.150/4 semanas).
          </p>
        </div>
        <div className="monitor-page-actions">
          <button
            type="button"
            className="primary-btn"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar e publicar'}
          </button>
        </div>
        {msg && (
          <p className={msg.includes('Erro') ? 'error' : 'hint monitor-page-msg'}>
            {msg}
          </p>
        )}
        {dirty && (
          <p className="alerta-box alerta-nivel-moderado">
            Alterações no rascunho — clique em Salvar para publicar.
          </p>
        )}
      </header>

      <AdminMonitorSemanal
        data={draft}
        onUpdate={(next) => {
          setDraft(next);
          setDirty(true);
        }}
      />
    </div>
  );
}
