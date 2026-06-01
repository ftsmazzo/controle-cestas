import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import EmergencialMonitorPanel from '../../components/EmergencialMonitorPanel';
import EmergencialPanel from '../../components/EmergencialPanel';
import { saveServices } from '../../lib/servicesApi';
import type { ServicesPayload } from '@shared/serviceTypes';

export default function AdminMonitorEmergencialPage() {
  const { payload, reload, loading, dashboard } = useData();
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDistrib, setShowDistrib] = useState(false);

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
      setMsg('Monitoramento salvo. Consulta pública atualizada.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Monitoramento emergencial — Banco de Alimentos</h2>
        <p className="hint">
          <strong>Passo 1:</strong> limpar carga errada (se existir) e importar PDF Coderp
          (histórico Out/25–Mar/26 por unidade). <strong>Passo 2:</strong> na grade, registrar
          envios semanais reais. Metas = 1.150/mês rateadas por unidade (fixos primeiro).
        </p>
        <div className="config-grid">
          <button
            type="button"
            className="primary-btn"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar monitoramento'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowDistrib((v) => !v)}
          >
            {showDistrib ? 'Ocultar' : 'Ver'} distribuição projetada
          </button>
        </div>
        {msg && <p className={msg.includes('Erro') ? 'error' : 'hint'}>{msg}</p>}
        {dirty && (
          <p className="alerta-box alerta-nivel-moderado">
            Há alterações não salvas.
          </p>
        )}
      </section>

      <EmergencialMonitorPanel
        data={draft}
        decisionDashboard={dashboard}
        onUpdate={(next) => {
          setDraft(next);
          setDirty(true);
        }}
      />

      {showDistrib && (
        <EmergencialPanel
          data={draft}
          decisionDashboard={dashboard}
          onUpdate={(next) => {
            setDraft(next);
            setDirty(true);
          }}
        />
      )}
    </>
  );
}
