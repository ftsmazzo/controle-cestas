import { useMemo, useState } from 'react';
import { allocatePlans } from '@shared/allocation';
import { resolveJanelaAnaliseMeses } from '@shared/methodologyCalendar';
import {
  excludedMonthKeysForPayload,
  validMonthKeysForPayload,
} from '@shared/payloadAnalysis';
import {
  isExcludedPlanningMonth,
  suggestPlanningMonths,
} from '@shared/planningMonths';
import { analyzeEmergencial } from '@shared/processAnalysis';
import type { MonthAllocationResult, ServicesPayload } from '@shared/serviceTypes';
import { calculateAllocation, saveServices } from '../lib/servicesApi';
import AllocationResumoBox from './AllocationResumoBox';
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
  const validMonthKeys = useMemo(() => validMonthKeysForPayload(data), [data]);
  const excludedMonthKeys = useMemo(
    () => excludedMonthKeysForPayload(data),
    [data],
  );
  const janela = useMemo(
    () => resolveJanelaAnaliseMeses(data.settings?.methodology),
    [data.settings?.methodology],
  );

  const allocateOpts = useMemo(
    () => ({
      validMonthKeys,
      mediaWindowMonths: janela,
      excluirMesDistribuicao: true,
    }),
    [validMonthKeys, janela],
  );

  const planningMonths = useMemo(
    () =>
      suggestPlanningMonths(
        validMonthKeys,
        cfg.duracaoMeses,
        excludedMonthKeys,
      ),
    [validMonthKeys, excludedMonthKeys, cfg.duracaoMeses],
  );

  const analise = useMemo(
    () =>
      analyzeEmergencial(cfg, data.services, data.history, allocateOpts),
    [cfg, data.services, data.history, allocateOpts],
  );

  const applyPadrao1200 = () => {
    if (readOnly) return;
    const plans = planningMonths.map((mes) => ({
      mes,
      totalDisponivel: cfg.cestasPorMes,
    }));
    onUpdate({
      ...data,
      emergencial: { ...cfg, plans },
      plans,
    });
  };

  const corrigirMeses = () => {
    if (readOnly) return;
    applyPadrao1200();
  };

  const runCalc = async () => {
    setLoading(true);
    try {
      if (readOnly) {
        setResults(
          allocatePlans(cfg.plans, data.services, data.history, allocateOpts),
        );
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

  const temMesesInvalidos = cfg.plans.some(
    (p) =>
      isExcludedPlanningMonth(p.mes, excludedMonthKeys) ||
      !planningMonths.includes(p.mes),
  );

  return (
    <div className="process-panel">
      <section className="panel">
        <h2>Processo emergencial</h2>
        <p className="hint">
          Operação de curto prazo (ex.: <strong>1.200 cestas/mês × 4 meses</strong>). Período de
          planejamento: <strong>{planningMonths.join(' · ')}</strong> (após o último mês válido;
          Abr/Mai/2026 fora do modelo).
          {readOnly && ' Em modo consulta, alterações não são salvas no servidor.'}
        </p>

        {(temMesesInvalidos ||
          cfg.plans.some((p) => !planningMonths.includes(p.mes))) &&
          !readOnly && (
            <p className="alerta-box alerta-nivel-moderado">
              Meses antigos (ex. Abr/Mai) detectados.{' '}
              <button type="button" className="link-btn" onClick={corrigirMeses}>
                Corrigir para {planningMonths.join(', ')}
              </button>
            </p>
          )}

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
                const months = suggestPlanningMonths(
                  validMonthKeys,
                  n,
                  excludedMonthKeys,
                );
                const plans = months.map((mes) => ({
                  mes,
                  totalDisponivel: cfg.cestasPorMes,
                }));
                onUpdate({
                  ...data,
                  emergencial: { ...cfg, duracaoMeses: n, plans },
                  plans,
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

        <button
          type="button"
          className="primary-btn"
          disabled={loading || validMonthKeys.length === 0}
          onClick={() => void runCalc()}
        >
          Calcular distribuição por equipamento
        </button>
        {validMonthKeys.length === 0 && (
          <p className="error">
            Nenhum mês válido no modelo — importe dados e confira metodologia em Admin.
          </p>
        )}
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
