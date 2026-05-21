import { useMemo, useState } from 'react';
import { allocatePlans, suggestNextMonths } from '@shared/allocation';
import { analyzeEmergencial } from '@shared/processAnalysis';
import type { MonthAllocationResult, ServicesPayload } from '@shared/serviceTypes';
import { calculateAllocation, saveServices } from '../lib/servicesApi';
import AllocationResumoBox from './AllocationResumoBox';
import MethodologyBanner from './MethodologyBanner';
import './ProcessPanels.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
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

export default function EmergencialPanel({ data, onUpdate, readOnly }: Props) {
  const [results, setResults] = useState<MonthAllocationResult[] | null>(null);
  const [loading, setLoading] = useState(false);

  const cfg = data.emergencial;
  const analise = useMemo(
    () => analyzeEmergencial(cfg, data.services, data.history),
    [cfg, data.services, data.history],
  );

  const applyPadrao1200 = () => {
    if (readOnly) return;
    const months =
      cfg.plans.length >= 4
        ? cfg.plans.map((p) => p.mes)
        : suggestNextMonths(data.history, cfg.duracaoMeses);
    const plans = months.slice(0, cfg.duracaoMeses).map((mes) => ({
      mes,
      totalDisponivel: cfg.cestasPorMes,
    }));
    onUpdate({
      ...data,
      emergencial: { ...cfg, plans },
      plans,
    });
  };

  const runCalc = async () => {
    setLoading(true);
    try {
      if (readOnly) {
        setResults(allocatePlans(cfg.plans, data.services, data.history));
        return;
      }
      const payload = { ...data, plans: cfg.plans };
      const saved = await saveServices(payload);
      onUpdate(saved);
      const res = await calculateAllocation({
        ...saved,
        plans: saved.emergencial.plans,
      });
      setResults(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="process-panel">
      <MethodologyBanner compact />
      <section className="panel">
        <h2>Processo emergencial</h2>
        <p className="hint">
          Operação de curto prazo (ex.: <strong>1.200 cestas/mês × 4 meses</strong>). O sistema
          divide por equipamento com base no histórico, respeitando <strong>fixos</strong>.
          {readOnly && ' Em modo consulta, alterações não são salvas no servidor.'}
        </p>

        <div className="config-grid">
          <label>
            Cestas por mês
            <input
              type="text"
              inputMode="numeric"
              value={cfg.cestasPorMes}
              disabled={readOnly}
              onChange={(e) =>
                onUpdate({
                  ...data,
                  emergencial: {
                    ...cfg,
                    cestasPorMes: parseQty(e.target.value) || 1200,
                  },
                })
              }
            />
          </label>
          <label>
            Duração (meses)
            <input
              type="text"
              inputMode="numeric"
              value={cfg.duracaoMeses}
              disabled={readOnly}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10) || 4;
                const months = suggestNextMonths(data.history, n);
                onUpdate({
                  ...data,
                  emergencial: {
                    ...cfg,
                    duracaoMeses: n,
                    plans: months.map((mes) => ({
                      mes,
                      totalDisponivel: cfg.cestasPorMes,
                    })),
                  },
                  plans: months.map((mes) => ({
                    mes,
                    totalDisponivel: cfg.cestasPorMes,
                  })),
                });
              }}
            />
          </label>
          <button
            type="button"
            className="secondary"
            disabled={readOnly}
            onClick={applyPadrao1200}
          >
            Aplicar {num(cfg.cestasPorMes)} em todos os meses
          </button>
        </div>

        <div className="plans-grid">
          {cfg.plans.map((p) => (
            <label key={p.mes} className="plan-card">
              <span>{p.mes}</span>
              <input
                type="text"
                inputMode="numeric"
                value={p.totalDisponivel > 0 ? String(p.totalDisponivel) : ''}
                disabled={readOnly}
                onChange={(e) => {
                  if (readOnly) return;
                  const plans = cfg.plans.map((x) =>
                    x.mes === p.mes
                      ? { ...x, totalDisponivel: parseQty(e.target.value) }
                      : x,
                  );
                  onUpdate({
                    ...data,
                    emergencial: { ...cfg, plans },
                    plans,
                  });
                }}
              />
            </label>
          ))}
        </div>

        <button type="button" className="primary-btn" disabled={loading} onClick={() => void runCalc()}>
          Calcular distribuição por equipamento
        </button>
      </section>

      <section className="panel">
        <h3>Análise de risco — emergencial</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Total informado</th>
                <th>Soma médias*</th>
                <th>Diferença</th>
                <th>Risco</th>
              </tr>
            </thead>
            <tbody>
              {analise.meses.map((m) => (
                <tr key={m.mes} className={`risco-${m.risco}`}>
                  <td>{m.mes}</td>
                  <td>{num(m.disponivel)}</td>
                  <td>{num(m.demandaReferencia)}</td>
                  <td>{m.gap > 0 ? `+${num(m.gap)}` : '—'}</td>
                  <td>{m.risco}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ marginTop: '0.5rem' }}>
          * Soma médias = soma do consumo médio de cada equipamento no histórico; não é o valor a
          distribuir. Gap = soma médias − total informado (quando positivo).
        </p>
        {analise.alertas.map((a, i) => (
          <p key={i} className={`alerta-box alerta-nivel-${a.nivel}`}>
            <strong>{a.titulo}</strong> — {a.descricao}
          </p>
        ))}
      </section>

      {results && (
        <section className="panel">
          <h3>Distribuição por equipamento (detalhe)</h3>
          {results.map((month) => (
            <div key={month.mes} className="month-block">
              <h4>
                {month.mes} — {num(month.totalDisponivel)} cestas
              </h4>
              <AllocationResumoBox resultado={month} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Fixo</th>
                      <th>Alocado</th>
                      <th>% hist.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {month.linhas.map((l) => (
                      <tr key={l.servicoId} className={l.fixo ? 'row-fixo' : ''}>
                        <td>{l.servicoNome}</td>
                        <td>{l.fixo ? 'Sim' : 'Não'}</td>
                        <td>
                          <strong>{num(l.alocado)}</strong>
                        </td>
                        <td>{l.participacaoHistoricaPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
