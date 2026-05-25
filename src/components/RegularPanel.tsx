import { useMemo, useState } from 'react';
import { resolveJanelaAnaliseMeses } from '@shared/methodologyCalendar';
import { analyzeRegular } from '@shared/processAnalysis';
import {
  buildRegularPlanTable,
  fillRegularPlansFromData,
} from '@shared/regularPlanFill';
import { contractScenarios } from '@shared/simulation';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../lib/servicesApi';
import { useData } from '../context/DataContext';
import SimulationPanel from './SimulationPanel';
import './ProcessPanels.css';

function num(n: number | null, dec = 0): string {
  if (n === null) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
}

interface Props {
  data: ServicesPayload;
  onUpdate: (next: ServicesPayload) => void;
  readOnly?: boolean;
}

export default function RegularPanel({ data, onUpdate, readOnly }: Props) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const { dashboard } = useData();
  const cfg = data.regular;
  const janela = useMemo(
    () => resolveJanelaAnaliseMeses(data.settings?.methodology),
    [data.settings?.methodology],
  );

  const processedRows = dashboard?.rows ?? [];

  const saldo = data.settings?.saldoEstoque ?? cfg.saldoAtual;

  const analise = useMemo(
    () =>
      processedRows.length
        ? analyzeRegular(cfg, processedRows, data.settings, saldo)
        : null,
    [cfg, processedRows, data.settings, saldo],
  );

  const simDashboard = useMemo(() => {
    if (!dashboard) return null;
    return {
      ...dashboard,
      cenariosContrato: contractScenarios(cfg.totalContratoAnual),
    };
  }, [dashboard, cfg.totalContratoAnual]);

  const planTable = useMemo(
    () =>
      buildRegularPlanTable(cfg.plans, data.history, processedRows, janela),
    [cfg.plans, data.history, processedRows, janela],
  );

  const persist = async (next: ServicesPayload) => {
    if (readOnly) return;
    setSaveError(null);
    try {
      const saved = await saveServices(next);
      onUpdate(saved);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'Erro ao salvar. Em Admin, configure a chave de API se necessário.';
      setSaveError(msg);
    }
  };

  const preencherPlanos = () => {
    setSaveError(null);
    if (!processedRows.length) {
      setSaveError('Sem dados na Visão geral. Importe o histórico em Admin.');
      return;
    }
    const plans = fillRegularPlansFromData(
      cfg.plans,
      data.history,
      processedRows,
      janela,
    );
    onUpdate({ ...data, regular: { ...cfg, plans } });
  };

  if (!dashboard || !processedRows.length) {
    return (
      <section className="panel empty">
        <p className="hint">
          Carregue o histórico e publique o painel em Admin → Importar para alinhar com a
          Visão geral.
        </p>
      </section>
    );
  }

  return (
    <div className="process-panel">
      <section className="panel">
        <h2>Processo regular (12 meses)</h2>
        <p className="hint">
          Mesma base da <strong>Visão geral</strong> (metodologia + previsão). Os 12 campos são o
          período do registro ({cfg.plans[0]?.mes} … {cfg.plans[cfg.plans.length - 1]?.mes}).
          Preencher usa soma dos equipamentos quando o mês já existe no histórico; nos demais,
          usa a <strong>previsão</strong> do painel.
          {readOnly && ' Modo consulta: pode simular o preenchimento; salvar só em Admin.'}
        </p>

        <div className="config-grid">
          <label>
            Cestas/mês contrato
            <input
              type="text"
              inputMode="numeric"
              value={cfg.cestasContratoMensal}
              disabled={readOnly}
              onChange={(e) =>
                onUpdate({
                  ...data,
                  regular: {
                    ...cfg,
                    cestasContratoMensal: parseQty(e.target.value) || 1200,
                  },
                })
              }
            />
          </label>
          <label>
            Total anual contrato
            <input
              type="text"
              inputMode="numeric"
              value={cfg.totalContratoAnual}
              disabled={readOnly}
              onChange={(e) =>
                onUpdate({
                  ...data,
                  regular: {
                    ...cfg,
                    totalContratoAnual: parseQty(e.target.value) || 14400,
                  },
                })
              }
            />
          </label>
          <label>
            Saldo atual (estoque)
            <input
              type="text"
              inputMode="numeric"
              placeholder="Opcional"
              value={cfg.saldoAtual ?? ''}
              disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value.trim();
                onUpdate({
                  ...data,
                  regular: {
                    ...cfg,
                    saldoAtual: v === '' ? null : parseQty(v),
                  },
                });
              }}
            />
          </label>
          <button type="button" className="secondary" onClick={preencherPlanos}>
            Preencher 12 meses (histórico + previsão)
          </button>
          {saveError && <p className="error">{saveError}</p>}
          {!readOnly && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => void persist(data)}
            >
              Salvar processo regular
            </button>
          )}
        </div>

        <div className="plans-grid plans-grid-12">
          {cfg.plans.map((p) => (
            <label key={p.mes} className="plan-card">
              <span>{p.mes}</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Total mês"
                value={p.totalDisponivel > 0 ? String(p.totalDisponivel) : ''}
                disabled={readOnly}
                onChange={(e) => {
                  const plans = cfg.plans.map((x) =>
                    x.mes === p.mes
                      ? { ...x, totalDisponivel: parseQty(e.target.value) }
                      : x,
                  );
                  onUpdate({ ...data, regular: { ...cfg, plans } });
                }}
              />
            </label>
          ))}
        </div>
      </section>

      {analise && (
        <section className="panel">
          <h3>Indicadores e risco — regular</h3>
          <p className="hint meta-line">
            Alinhado à Visão geral · janela:{' '}
            {janela != null && janela > 0
              ? `últimos ${janela} meses válidos`
              : 'todos os meses válidos'}
          </p>
          <div className="kpi-row">
            <div className="kpi-mini kpi-mini--highlight">
              <span>Previsão próximo mês</span>
              <strong>{num(analise.previsaoProximoMes)}</strong>
            </div>
            <div className="kpi-mini kpi-mini--highlight">
              <span>Média previsão futura</span>
              <strong>{num(analise.mediaPrevisaoFutura)}</strong>
            </div>
            <div className="kpi-mini">
              <span>Média histórica válida</span>
              <strong>{num(analise.consumoMedioValido)}</strong>
              <span className="hint-inline">referência passado</span>
            </div>
            <div className="kpi-mini">
              <span>Previsão (+3 meses)</span>
              <strong>
                {analise.previsaoProximos3.map((v) => num(v)).join(' · ') || '—'}
              </strong>
            </div>
            <div className="kpi-mini">
              <span>Soma planejada 12m</span>
              <strong>{num(analise.totalPlanejado12)}</strong>
            </div>
            <div className="kpi-mini">
              <span>Contrato cobre (previsão)</span>
              <strong>
                {(
                  analise.mesesCobertosPelaPrevisao ?? analise.mesesCobertosPeloContrato
                ).toFixed(1)}{' '}
                meses
              </strong>
            </div>
            <div className={`kpi-mini risco-${analise.riscoRuptura.toLowerCase()}`}>
              <span>Autonomia / Risco</span>
              <strong>
                {analise.autonomiaMeses != null
                  ? `${analise.autonomiaMeses.toFixed(1)} m · ${analise.riscoRuptura}`
                  : analise.riscoRuptura}
              </strong>
            </div>
          </div>
          {analise.alertas.map((a, i) => (
            <p key={i} className={`alerta-box alerta-nivel-${a.nivel}`}>
              <strong>{a.titulo}</strong> — {a.descricao}
            </p>
          ))}
        </section>
      )}

      {simDashboard && (
        <>
          <section className="panel">
            <h3>Plano 12 meses — histórico vs previsão</h3>
            <p className="hint">
              Referência para cada campo do registro (não é a lista completa do passado).
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Soma equipamentos</th>
                    <th>Previsão (Visão geral)</th>
                    <th>Planejado</th>
                    <th>Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {planTable.map((r) => (
                    <tr key={r.mes}>
                      <td>{r.mes}</td>
                      <td>{r.historico != null ? num(r.historico) : '—'}</td>
                      <td>{r.previsao != null ? num(r.previsao) : '—'}</td>
                      <td>
                        <strong>{r.planejado > 0 ? num(r.planejado) : '—'}</strong>
                      </td>
                      <td>{r.fonte}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <SimulationPanel
            dashboard={simDashboard}
            defaultTotalContrato={cfg.totalContratoAnual}
          />
        </>
      )}
    </div>
  );
}
