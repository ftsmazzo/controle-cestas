import { useEffect, useState } from 'react';
import { mergeAppSettings } from '@shared/appSettings';
import { EMPENHO_TOTAL_CESTAS, TOTAL_CICLOS_OPERACIONAIS } from '@shared/monitorConstants';
import { suggestEmpenhoMeses } from '@shared/empenhoControle';
import { MONITOR_CONTROLE_MES_INICIO } from '@shared/emergencyMonitoring';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../../lib/servicesApi';
import { useData } from '../../context/DataContext';
import './AdminProcessoPage.css';

function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : Math.max(0, Math.round(v));
}

export default function AdminProcessoPage() {
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

  const em = draft.emergencial;

  const patch = (patchEm: Partial<typeof em>) => {
    setDraft({
      ...draft,
      emergencial: { ...em, ...patchEm },
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await saveServices(draft);
      await reload();
      setDirty(false);
      setMsg('Processo salvo.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-processo-page">
      <header className="panel admin-processo-head">
        <div>
          <h1>Configuração do processo</h1>
          <p className="hint">
            Parâmetros fixos do lote atual. Quando encerrar os 4 meses, crie um
            novo processo aqui (nome, saldo, datas). O fluxo semanal usa estes
            valores — não confundir com lançamentos por semana.
          </p>
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? 'Salvando…' : 'Salvar processo'}
        </button>
        {msg && <p className="hint">{msg}</p>}
        {dirty && (
          <p className="alerta-box alerta-nivel-moderado">Alterações não salvas.</p>
        )}
      </header>

      <section className="panel admin-processo-form">
        <div className="admin-processo-grid">
          <label>
            Nome do processo
            <input
              type="text"
              value={em.nomeProcesso ?? ''}
              onChange={(e) => patch({ nomeProcesso: e.target.value })}
              placeholder="Ex.: Emergencial Mai–Ago/2026"
            />
          </label>
          <label>
            Saldo inicial do empenho (cestas)
            <input
              type="text"
              inputMode="numeric"
              value={String(em.empenhoTotalCestas ?? EMPENHO_TOTAL_CESTAS)}
              onChange={(e) =>
                patch({ empenhoTotalCestas: parseQty(e.target.value) })
              }
            />
            <span className="field-hint">
              Total contratado — o painel público mostra o saldo restante
              (empenho − consumo lançado).
            </span>
          </label>
          <label>
            Saldo físico no Banco de Alimentos
            <input
              type="text"
              inputMode="numeric"
              placeholder="Opcional"
              value={
                em.saldoBancoFisico != null ? String(em.saldoBancoFisico) : ''
              }
              onChange={(e) => {
                const v = e.target.value.trim();
                patch({
                  saldoBancoFisico: v === '' ? null : parseQty(v),
                  monitoramento: {
                    ...em.monitoramento,
                    saldoAtual: v === '' ? null : parseQty(v),
                  },
                });
              }}
            />
            <span className="field-hint">
              Estoque no galpão (configuração), não lançamento semanal. Diferente
              do saldo do empenho acima.
            </span>
          </label>
          <label>
            Total de períodos (ciclos de 4 sem.)
            <input
              type="text"
              inputMode="numeric"
              value={String(
                em.totalCiclosOperacionais ?? TOTAL_CICLOS_OPERACIONAIS,
              )}
              onChange={(e) =>
                patch({
                  totalCiclosOperacionais: parseQty(e.target.value) || 16,
                })
              }
            />
          </label>
          <label>
            Início operacional (1ª quarta)
            <input
              type="date"
              value={em.dataInicioOperacional ?? '2026-05-20'}
              onChange={(e) =>
                patch({ dataInicioOperacional: e.target.value })
              }
            />
            <span className="field-hint">Semanas qua–ter a partir desta data.</span>
          </label>
          <label>
            Duração (meses civis do empenho)
            <input
              type="text"
              inputMode="numeric"
              value={String(em.duracaoMeses ?? 4)}
              onChange={(e) => {
                const d = parseQty(e.target.value) || 4;
                patch({
                  duracaoMeses: d,
                  empenhoMeses: suggestEmpenhoMeses(
                    d,
                    MONITOR_CONTROLE_MES_INICIO,
                  ),
                });
              }}
            />
          </label>
        </div>

        <div className="admin-processo-resumo panel-inset">
          <h3>Resumo</h3>
          <ul>
            <li>
              Empenho: <strong>{num(em.empenhoTotalCestas)}</strong> cestas
            </li>
            <li>
              Períodos: <strong>{em.totalCiclosOperacionais ?? 16}</strong> × 1.150
              (P1: 1.350)
            </li>
            <li>
              Início: <strong>{em.dataInicioOperacional ?? '2026-05-20'}</strong>
            </li>
            <li>
              Banco físico:{' '}
              <strong>{num(em.saldoBancoFisico ?? em.monitoramento.saldoAtual)}</strong>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
