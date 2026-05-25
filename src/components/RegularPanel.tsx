import { useMemo, useState } from 'react';
import { resolveJanelaAnaliseMeses } from '@shared/methodologyCalendar';
import { computeDecisionNumbers } from '@shared/decisionNumbers';
import { forecastNextMonth } from '@shared/forecastPlan';
import { analyzeRegular } from '@shared/processAnalysis';
import { recalculateSnapshot } from '@shared/recalculateSnapshot';
import DecisionNumbersLegend from './DecisionNumbersLegend';
import {
  buildRegularPlanTable,
  fillRegularPlansFromData,
} from '@shared/regularPlanFill';
import { contractScenarios } from '@shared/simulation';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../lib/servicesApi';
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
  /** Snapshot da decisão (Visão geral) — se omitido, calcula só a partir do histórico importado */
  decisionSnapshot?: ReturnType<typeof recalculateSnapshot> | null;
}

export default function RegularPanel({
  data,
  onUpdate,
  readOnly,
  decisionSnapshot: decisionSnapshotProp,
}: Props) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const cfg = data.regular;

  const decisionSnap = useMemo(() => {
    if (decisionSnapshotProp !== undefined) return decisionSnapshotProp;
    return recalculateSnapshot(data);
  }, [decisionSnapshotProp, data]);

  const janela = useMemo(
    () => resolveJanelaAnaliseMeses(data.settings?.methodology),
    [data.settings?.methodology],
  );

  const dashboard = decisionSnap?.state ?? null;
  const processedRows = dashboard?.rows ?? [];

  const decisionNums = useMemo(() => {
    if (!dashboard) return null;
    const proj = forecastNextMonth(processedRows, janela).valor;
    return computeDecisionNumbers(
      processedRows,
      janela,
      data.history,
      data.services,
      dashboard.kpis,
      proj,
    );
  }, [dashboard, processedRows, janela, data.history, data.services]);

  const analise = useMemo(
    () =>
      dashboard
        ? analyzeRegular(cfg, dashboard, data.settings)
        : null,
    [cfg, dashboard, data.settings],
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
          : 'Erro ao salvar. Em Admin, configure a chave de API.';
      setSaveError(msg);
    }
  };

  const preencherPlanos = () => {
    setSaveError(null);
    if (!processedRows.length) {
      setSaveError('Sem histórico importado. Use Admin → Importar.');
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

  if (!dashboard) {
    return (
      <section className="panel empty">
        <p className="hint">Importe o histórico por equipamento para exibir indicadores.</p>
      </section>
    );
  }

  return (
    <div className="process-panel">
      {decisionNums && (
        <DecisionNumbersLegend
          numbers={decisionNums}
          contratoMensal={cfg.cestasContratoMensal}
          compact
        />
      )}
      <section className="panel">
        <h2>Processo regular (12 meses)</h2>
        <p className="hint">
          <strong>Levantamento do registro</strong> (campos abaixo) é independente da Visão geral.
          Indicadores e simulação <strong>leem a mesma série</strong> do painel principal (histórico +
          metodologia). Preencher copia histórico ou previsão apenas nos 12 campos do registro.
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
          <h3>Indicadores (mesma base da Visão geral)</h3>
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
            </div>
            <div className="kpi-mini">
              <span>Soma planejada (registro)</span>
              <strong>{num(analise.totalPlanejado12)}</strong>
            </div>
            <div className={`kpi-mini risco-${analise.riscoRuptura.toLowerCase()}`}>
              <span>Autonomia</span>
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
            <h3>Referência por mês do plano de registro</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Soma equipamentos</th>
                    <th>Previsão (Visão geral)</th>
                    <th>No seu plano</th>
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
