import { useEffect, useState } from 'react';
import EmergencialMonitorPanel from '../../components/EmergencialMonitorPanel';
import MonitorPublicacaoBanner from '../../components/MonitorPublicacaoBanner';
import { useData } from '../../context/DataContext';
import { saveServices } from '../../lib/servicesApi';
import {
  CICLO_INICIO_CONTROLE_ESTOURO,
  EMPENHO_TOTAL_CESTAS,
} from '@shared/monitorConstants';
import {
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
  prepararProcessoEmergencialOperacional,
} from '@shared/processoEmergencial';
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
        `· Saldo inicial ${EMPENHO_TOTAL_CESTAS.toLocaleString('pt-BR')}\n` +
        '· Zera lançamentos semanais\n' +
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
            <strong>Ritmo:</strong> semana fecha terça → na quarta cedo importe o PDF e{' '}
            <strong>Salvar</strong> para publicar cotas. Empenho{' '}
            <strong>{EMPENHO_TOTAL_CESTAS.toLocaleString('pt-BR')}</strong> cestas · período de 4
            semanas = <strong>1.150</strong> (período 1: 1.350) · ponto zero{' '}
            <strong>20/05/2026</strong> (semana qua–ter). Compensação/desconto
            por estouro a partir do <strong>período {CICLO_INICIO_CONTROLE_ESTOURO}</strong>.
            Cotas semanais (264 flex.) = plano aprovado; estudo de demanda em{' '}
            <strong>
              {PERIODO_REFERENCIA_INICIO}–{PERIODO_REFERENCIA_FIM}
            </strong>{' '}
            (excl. COVID/2023/ruptura Abr/2026).
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

      <MonitorPublicacaoBanner payload={draft} />

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
