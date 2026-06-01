import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import EmergencialMonitorPanel from '../../components/EmergencialMonitorPanel';
import { saveServices } from '../../lib/servicesApi';
import { prepararProcessoEmergencialOperacional } from '@shared/processoEmergencial';
import type { ServicesPayload } from '@shared/serviceTypes';
import './AdminMonitorEmergencialPage.css';

export default function AdminMonitorEmergencialPage() {
  const { payload, reload, loading, dashboard } = useData();
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
      setMsg('Monitoramento salvo.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const prepararProcesso = () => {
    const ok = window.confirm(
      'Preparar processo emergencial?\n\n' +
        '· Saldo inicial 4.800\n' +
        '· Zera lançamentos semanais (relance S3/S4 Mai e demais semanas)\n' +
        '· Mantém equipamentos; limpa histórico fora Set/2025–Mar/2026\n\n' +
        'Importe o histórico Coderp e os PDFs semanais em seguida. Salve ao terminar.',
    );
    if (!ok) return;
    setDraft(prepararProcessoEmergencialOperacional(draft));
    setDirty(true);
    setMsg('Processo preparado. Importe histórico ref. e PDFs semanais, depois Salvar.');
  };

  return (
    <div className="monitor-page">
      <header className="monitor-page-head panel">
        <div>
          <h1>Monitor — Processo emergencial</h1>
          <p className="hint">
            Empenho <strong>4.800</strong> cestas · teto <strong>1.150/mês</strong> (margem 50/mês
            para mitigação) · ponto zero <strong>Mai/2026 S3</strong> (18–24). Histórico ref.{' '}
            <strong>Set/2025–Mar/2026</strong>.
          </p>
        </div>
        <div className="monitor-page-actions">
          <button
            type="button"
            className="secondary"
            onClick={prepararProcesso}
          >
            Preparar processo
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
        {msg && (
          <p className={msg.includes('Erro') ? 'error' : 'hint monitor-page-msg'}>{msg}</p>
        )}
        {dirty && (
          <p className="alerta-box alerta-nivel-moderado">Alterações não salvas.</p>
        )}
      </header>

      <EmergencialMonitorPanel
        data={draft}
        decisionDashboard={dashboard}
        onUpdate={(next) => {
          setDraft(next);
          setDirty(true);
        }}
      />
    </div>
  );
}
