import { useMemo } from 'react';
import { buildDashboard } from '@shared/buildDashboard';
import { aggregateHistoryByMonth, analyzeRegular } from '@shared/processAnalysis';
import { contractScenarios } from '@shared/simulation';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../lib/servicesApi';
import SimulationPanel from './SimulationPanel';
import MethodologyBanner from './MethodologyBanner';
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
  const cfg = data.regular;

  const historicoRows = useMemo(() => {
    const fromPlans = cfg.plans.filter((p) => p.totalDisponivel > 0);
    if (fromPlans.length >= 3) {
      return fromPlans.map((p) => ({
        mes: p.mes,
        total: p.totalDisponivel,
        status: 'Completo' as const,
      }));
    }
    return aggregateHistoryByMonth(data.history);
  }, [cfg.plans, data.history]);

  const analise = useMemo(
    () => analyzeRegular(cfg, data.history, historicoRows, data.settings),
    [cfg, data.history, historicoRows, data.settings],
  );

  const dashboard = useMemo(
    () =>
      historicoRows.length
        ? buildDashboard(historicoRows, 'Processo regular', cfg.saldoAtual)
        : null,
    [historicoRows, cfg.saldoAtual],
  );

  const simDashboard = useMemo(() => {
    if (!dashboard) return null;
    return {
      ...dashboard,
      cenariosContrato: contractScenarios(cfg.totalContratoAnual),
    };
  }, [dashboard, cfg.totalContratoAnual]);

  const persist = async (next: ServicesPayload) => {
    if (readOnly) return;
    const saved = await saveServices(next);
    onUpdate(saved);
  };

  const preencherDoHistorico = () => {
    if (readOnly) return;
    const agg = aggregateHistoryByMonth(data.history);
    const byMes = new Map(agg.map((r) => [r.mes, r.total]));
    const plans = cfg.plans.map((p) => ({
      ...p,
      totalDisponivel: byMes.get(p.mes) ?? p.totalDisponivel,
    }));
    void persist({ ...data, regular: { ...cfg, plans } });
  };

  return (
    <div className="process-panel">
      {simDashboard && <MethodologyBanner rows={simDashboard.rows} compact />}
      <section className="panel">
        <h2>Processo regular (12 meses)</h2>
        <p className="hint">
          Levantamento do <strong>total mensal</strong> para registro/contrato. Use totais
          informados abaixo ou importe da soma dos equipamentos. Inclui previsão e risco.
          {readOnly && ' Em modo consulta, valores exibidos não podem ser alterados.'}
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
          <button
            type="button"
            className="secondary"
            disabled={readOnly}
            onClick={preencherDoHistorico}
          >
            Preencher meses com soma dos equipamentos
          </button>
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

      <section className="panel">
        <h3>Indicadores e risco — regular</h3>
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
              {(analise.mesesCobertosPelaPrevisao ?? analise.mesesCobertosPeloContrato).toFixed(
                1,
              )}{' '}
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

      {simDashboard && (
        <>
          <section className="panel">
            <h3>Série mensal (processo regular)</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>No modelo</th>
                  </tr>
                </thead>
                <tbody>
                  {simDashboard.rows.map((r) => (
                    <tr key={r.mes}>
                      <td>{r.mes}</td>
                      <td>{num(r.total)}</td>
                      <td>{r.status}</td>
                      <td>{r.usoNoModelo}</td>
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
