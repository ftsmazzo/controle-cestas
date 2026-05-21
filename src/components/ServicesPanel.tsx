import { useCallback, useEffect, useMemo, useState } from 'react';
import { allocatePlans, computeServiceStats, suggestNextMonths } from '@shared/allocation';
import { parseMonthKey } from '@shared/monthUtils';
import type {
  MonthAllocationResult,
  MonthlyPlan,
  ServiceDef,
  ServicesPayload,
} from '@shared/serviceTypes';
import {
  calculateAllocation,
  clearServices,
  fetchServices,
  importServices,
  saveServices,
} from '../lib/servicesApi';
import { demoServiceData, parseServiceWorkbook } from '../lib/serviceExcelParser';
import './ServicesPanel.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
}

export default function ServicesPanel() {
  const [data, setData] = useState<ServicesPayload | null>(null);
  const [results, setResults] = useState<MonthAllocationResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchServices();
      setData(d);
      if (d.history.length && d.plans.length === 0) {
        const months = suggestNextMonths(d.history, 4);
        setData({
          ...d,
          plans: months.map((mes) => ({ mes, totalDisponivel: 0 })),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar serviços.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!data?.history.length) return [];
    return computeServiceStats(data.history, data.services.map((s) => s.id));
  }, [data]);

  const persist = async (next: ServicesPayload) => {
    const saved = await saveServices({
      ...next,
      updatedAt: new Date().toISOString(),
    });
    setData(saved);
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const { history, services } = parseServiceWorkbook(await file.arrayBuffer());
      const months = suggestNextMonths(history, 4);
      const imported = await importServices(history, services);
      const withPlans: ServicesPayload = {
        ...imported,
        plans: months.map((mes) => ({ mes, totalDisponivel: 0 })),
      };
      await persist(withPlans);
      setResults(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const { history, services } = demoServiceData();
      const months = suggestNextMonths(history, 4);
      const payload: ServicesPayload = {
        services,
        history,
        plans: months.map((mes, i) => ({
          mes,
          totalDisponivel: [1150, 1200, 1500, 1500][i] ?? 0,
        })),
        updatedAt: new Date().toISOString(),
      };
      await importServices(history, services);
      await persist(payload);
      setResults(allocatePlans(payload.plans, payload.services, payload.history));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setLoading(false);
    }
  };

  const updateService = (id: string, patch: Partial<ServiceDef>) => {
    if (!data) return;
    const services = data.services.map((s) =>
      s.id === id ? { ...s, ...patch } : s,
    );
    setData({ ...data, services });
  };

  const updatePlan = (mes: string, totalDisponivel: number) => {
    if (!data) return;
    const plans = data.plans.map((p) =>
      p.mes === mes ? { ...p, totalDisponivel } : p,
    );
    setData({ ...data, plans });
  };

  const addPlanMonth = () => {
    if (!data) return;
    const months = suggestNextMonths(data.history, data.plans.length + 1);
    const next = months[months.length - 1];
    if (data.plans.some((p) => p.mes === next)) return;
    setData({
      ...data,
      plans: [...data.plans, { mes: next, totalDisponivel: 0 }],
    });
  };

  const runAllocation = async () => {
    if (!data) return;
    setLoading(true);
    setError(null);
    try {
      await persist(data);
      const res = await calculateAllocation(data);
      setResults(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no cálculo.');
    } finally {
      setLoading(false);
    }
  };

  const historyByMonth = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const h of data.history) {
      map.set(h.mes, (map.get(h.mes) ?? 0) + h.total);
    }
    return [...map.entries()].sort(
      (a, b) => parseMonthKey(a[0]) - parseMonthKey(b[0]),
    );
  }, [data]);

  return (
    <div className="services-panel">
      <section className="panel">
        <h2>Distribuição por serviço</h2>
        <p className="hint">
          Importe o histórico com consumo <strong>por serviço</strong> (formato: colunas{' '}
          <em>Mês</em>, <em>Serviço</em>, <em>Total</em> — ou uma coluna por serviço).
          Informe quantas cestas terá em cada um dos próximos meses; o sistema reserva{' '}
          <strong>serviços fixos</strong> e divide o restante conforme o histórico.
        </p>

        <div className="upload-row">
          <label className="file-btn">
            {loading ? 'Processando…' : 'Planilha por serviço'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
          <button type="button" className="secondary" disabled={loading} onClick={() => void handleDemo()}>
            Exemplo (Jun = 1.150)
          </button>
          {data?.history.length ? (
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={async () => {
                await clearServices();
                setData(null);
                setResults(null);
              }}
            >
              Limpar
            </button>
          ) : null}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {data && data.services.length > 0 && (
        <>
          <section className="panel">
            <h3>Serviços e cotas fixas</h3>
            <p className="hint">
              Marque <strong>Fixo</strong> para serviços que não podem ser reduzidos. Opcionalmente
              defina <strong>Cota fixa</strong> (cestas/mês); se vazio, usa a média histórica.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Fixo</th>
                    <th>Cota fixa</th>
                    <th>Média hist.</th>
                    <th>% do total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => {
                    const st = stats.find((x) => x.servicoId === s.id);
                    return (
                      <tr key={s.id}>
                        <td>{s.nome}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={s.fixo}
                            onChange={(e) =>
                              updateService(s.id, { fixo: e.target.checked })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="Auto (média)"
                            value={s.cotaFixa ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              updateService(s.id, {
                                cotaFixa: v === '' ? null : parseQty(v),
                              });
                            }}
                          />
                        </td>
                        <td>{st ? num(st.mediaHistorica) : '—'}</td>
                        <td>{st ? `${st.participacaoPct.toFixed(1)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="secondary"
              style={{ marginTop: '0.75rem' }}
              onClick={() => void persist(data)}
            >
              Salvar configuração dos serviços
            </button>
          </section>

          <section className="panel">
            <h3>Metas — próximos meses</h3>
            <p className="hint">
              Ex.: 1.150 cestas em Jun/2026. Se a soma das médias por serviço for maior que o
              disponível, o sistema alerta e prioriza os fixos.
            </p>
            <div className="plans-grid">
              {data.plans.map((p) => (
                <label key={p.mes} className="plan-card">
                  <span>{p.mes}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Cestas disponíveis"
                    value={p.totalDisponivel > 0 ? String(p.totalDisponivel) : ''}
                    onChange={(e) => updatePlan(p.mes, parseQty(e.target.value))}
                  />
                </label>
              ))}
              <button type="button" className="secondary" onClick={addPlanMonth}>
                + Mês
              </button>
            </div>
            <button
              type="button"
              className="primary-btn"
              disabled={loading}
              onClick={() => void runAllocation()}
            >
              Calcular distribuição
            </button>
          </section>

          {historyByMonth.length > 0 && (
            <section className="panel">
              <h3>Histórico importado (totais por mês)</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Soma serviços</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByMonth.map(([mes, total]) => (
                      <tr key={mes}>
                        <td>{mes}</td>
                        <td>{num(total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {results && (
            <section className="panel allocation-results">
              <h3>Distribuição calculada</h3>
              {results.map((month) => (
                <div key={month.mes} className="month-block">
                  <h4>
                    {month.mes} — disponível: {num(month.totalDisponivel)} · alocado:{' '}
                    {num(month.totalAlocado)}
                    {month.sobra !== 0 && (
                      <span className="sobra"> · sobra: {num(month.sobra)}</span>
                    )}
                  </h4>
                  {month.alerta && <p className="alerta-box">{month.alerta}</p>}
                  <p className="meta-line">
                    Referência (soma médias): {num(month.totalDemandaReferencia)} cestas/mês
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Serviço</th>
                          <th>Fixo</th>
                          <th>Mín. garantido</th>
                          <th>Alocado</th>
                          <th>% hist.</th>
                          <th>Obs.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {month.linhas.map((l) => (
                          <tr key={l.servicoId} className={l.fixo ? 'row-fixo' : ''}>
                            <td>{l.servicoNome}</td>
                            <td>{l.fixo ? 'Sim' : 'Não'}</td>
                            <td>{num(l.minimoGarantido)}</td>
                            <td>
                              <strong>{num(l.alocado)}</strong>
                            </td>
                            <td>{l.participacaoHistoricaPct.toFixed(1)}%</td>
                            <td className="obs-cell">{l.observacao}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
