import { useCallback, useEffect, useMemo, useState } from 'react';
import { APRESENTACAO_TEXTO } from '@shared/calculations';
import { buildDashboard } from '@shared/buildDashboard';
import {
  checkHealth,
  clearDashboard,
  fetchDashboard,
  saveImport,
  syncDashboardFromServices,
  updateSaldo,
} from './lib/api';
import { parseDemoData, parseWorkbook } from './lib/excelParser';
import type { DashboardState } from '@shared/types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import DecisionDashboard from './components/DecisionDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import ProcessHub from './components/ProcessHub';
import SimulationPanel from './components/SimulationPanel';
import './App.css';

type Tab = 'geral' | 'processos';

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null, dec = 0): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function formatSaldoInput(value: number | null): string {
  if (value === null) return '';
  return String(Math.round(value));
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [saldoAtual, setSaldoAtual] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('geral');
  const [processSubTab, setProcessSubTab] = useState<
    'equipamentos' | 'distribuir' | null
  >(null);

  const saldoNum = useMemo(() => {
    const v = parseFloat(saldoAtual.replace(/\./g, '').replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  }, [saldoAtual]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const healthy = await checkHealth();
        if (cancelled) return;
        setApiOk(healthy);
        if (!healthy) {
          setError('API indisponível. Verifique DATABASE_URL e o deploy no EasyPanel.');
          return;
        }
        const { state, saldoAtual: saldo } = await fetchDashboard();
        if (cancelled) return;
        setDashboard(state);
        setSaldoAtual(formatSaldoInput(saldo));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar dados.');
          setApiOk(false);
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSaldo = useCallback(
    async (base: DashboardState) => {
      const next = buildDashboard(
        base.rows.map((r) => ({
          mes: r.mes,
          total: r.total,
          status: r.status,
          observacao: r.observacao,
        })),
        base.fileName,
        saldoNum,
      );
      await updateSaldo(next, saldoNum);
      setDashboard(next);
    },
    [saldoNum],
  );

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const raw = parseWorkbook(buffer);
      const { state } = await saveImport(file.name, raw, saldoNum);
      setDashboard(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const { state } = await saveImport(
        'Dados demonstrativos',
        parseDemoData(),
        saldoNum,
      );
      setDashboard(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar exemplo.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError(null);
    try {
      await clearDashboard();
      setDashboard(null);
      setSaldoAtual('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao limpar.');
    } finally {
      setLoading(false);
    }
  };

  const forecastChart = useMemo(() => {
    if (!dashboard) return [];
    return [
      ...dashboard.forecast.map((p) => ({ mes: p.mes, historico: p.valor })),
      ...dashboard.tendenciaProximos.map((p) => ({
        mes: p.mes,
        projecao: p.valor,
      })),
    ];
  }, [dashboard]);

  const riskClass =
    dashboard?.kpis.riscoRuptura === 'Verde'
      ? 'risk-verde'
      : dashboard?.kpis.riscoRuptura === 'Amarelo'
        ? 'risk-amarelo'
        : 'risk-vermelho';

  if (booting) {
    return (
      <div className="app">
        <p className="loading-msg">Conectando ao servidor e banco de dados…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-nav-sticky">
        <header className="header">
          <div>
            <h1>Dashboard de Consumo de Cestas Básicas</h1>
            <p className="subtitle">
              Histórico por equipamento · Totais e KPIs automáticos
            </p>
          </div>
          <span className={`api-badge ${apiOk ? 'api-ok' : 'api-fail'}`}>
            {apiOk ? 'PostgreSQL conectado' : 'API offline'}
          </span>
        </header>

        <nav className="tabs" aria-label="Navegação principal">
          <button
            type="button"
            className={tab === 'geral' ? 'tab active' : 'tab'}
            onClick={() => setTab('geral')}
          >
            Visão geral
          </button>
          <button
            type="button"
            className={tab === 'processos' ? 'tab active' : 'tab'}
            onClick={() => setTab('processos')}
          >
            Processos (emerg. + regular)
          </button>
        </nav>
      </div>

      {tab === 'processos' ? (
        <ErrorBoundary title="Erro na aba Processos">
          <ProcessHub
            initialSubTab={processSubTab ?? undefined}
            onInitialSubTabApplied={() => setProcessSubTab(null)}
            onDashboardSynced={async () => {
              try {
                const { state, saldoAtual: saldo } = await fetchDashboard();
                setDashboard(state);
                setSaldoAtual(formatSaldoInput(saldo));
                setTab('geral');
              } catch {
                /* recarrega na próxima visita à aba */
              }
            }}
          />
        </ErrorBoundary>
      ) : (
        <>
      <section className="panel upload-panel">
        <h2>Visão geral — totais mensais</h2>
        <p className="hint">
          <strong>Fonte recomendada:</strong> importe a planilha por equipamento em{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setProcessSubTab('equipamentos');
              setTab('processos');
            }}
          >
            Processos → Equipamentos
          </button>
          . Os totais e KPIs são calculados automaticamente (uma única fonte de verdade).
        </p>
        <div className="upload-row">
          <button
            type="button"
            className="primary-btn"
            disabled={loading || !apiOk}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const { state, saldoAtual: saldo } = await syncDashboardFromServices();
                setDashboard(state);
                setSaldoAtual(formatSaldoInput(saldo));
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : 'Importe equipamentos em Processos antes.',
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? 'Sincronizando…' : 'Atualizar a partir dos equipamentos'}
          </button>
        </div>
        <details className="alt-import">
          <summary>Importação alternativa (só totais por mês — não recomendado)</summary>
          <p className="hint">
            Use apenas se não tiver a planilha por equipamento. Prefira sempre a base por serviço.
          </p>
          <div className="upload-row">
            <label className="file-btn">
              {loading ? 'Processando…' : 'Planilha Mês + Total'}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                disabled={loading || !apiOk}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </label>
            <button
              type="button"
              className="secondary"
              disabled={loading || !apiOk}
              onClick={() => void handleDemo()}
            >
              Exemplo
            </button>
            {dashboard && (
              <button
                type="button"
                className="secondary"
                disabled={loading || !apiOk}
                onClick={() => void handleClear()}
              >
                Limpar
              </button>
            )}
          </div>
        </details>
        <div className="saldo-row">
          <label>
            Saldo atual (cestas) — para autonomia e risco
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex.: 6000"
              value={saldoAtual}
              disabled={!apiOk}
              onChange={(e) => setSaldoAtual(e.target.value)}
              onBlur={() => dashboard && void persistSaldo(dashboard)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {dashboard && (
          <p className="meta">
            Fonte: {dashboard.fileName}
            {dashboard.fileName.includes('Equipamento') ||
            dashboard.fileName.includes('fonte')
              ? ' · derivado dos equipamentos'
              : ''}{' '}
            · Atualizado: {new Date(dashboard.uploadedAt).toLocaleString('pt-BR')}
          </p>
        )}
      </section>

      {!dashboard ? (
        <section className="panel empty">
          <h3>Sem dados mensais na Visão geral</h3>
          <ol className="steps-list">
            <li>
              Clique em <strong>Processos (emerg. + regular)</strong> no topo da página.
            </li>
            <li>
              Depois em <strong>Equipamentos</strong> (menu logo abaixo).
            </li>
            <li>
              <strong>Importar planilha</strong> (equipamento × meses). Pode ser uma aba por ano
              (2022, 2023…) no Excel.
            </li>
            <li>
              Volte aqui e use <strong>Atualizar a partir dos equipamentos</strong>, ou aguarde a
              sincronização automática após o import.
            </li>
          </ol>
          <p className="hint">
            A planilha pivot (CRAS + JANEIRO…DEZEMBRO) <strong>não</strong> funciona em
            “Importação alternativa” abaixo — use sempre Equipamentos.
          </p>
        </section>
      ) : (
        <>
          <section className={`kpi-card risk-strip ${riskClass}`}>
            <span className="kpi-label">Autonomia de estoque</span>
            <strong>{num(dashboard.kpis.autonomiaMeses, 1)} meses</strong>
            <span className="risk-badge">{dashboard.kpis.riscoRuptura}</span>
          </section>

          <DecisionDashboard dashboard={dashboard} />

          <section className="panel chart-panel">
            <h2>Projeção (+3 meses) — somente meses válidos</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={forecastChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="historico" name="Histórico válido" fill="#2563eb" />
                <Bar dataKey="projecao" name="Projeção" fill="#9333ea" />
              </BarChart>
            </ResponsiveContainer>
          </section>

          <section className="panel">
            <h2>Base de dados processada</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Ajustado</th>
                    <th>Var. M/M</th>
                    <th>Média 3m</th>
                    <th>Anomalia</th>
                    <th>Modelo</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rows.map((r) => (
                    <tr
                      key={r.mes}
                      className={
                        r.status === 'Ruptura de estoque'
                          ? 'row-ruptura'
                          : r.status === 'Parcial'
                            ? 'row-parcial'
                            : r.flagAnomalia === 'Excluir modelo'
                              ? 'row-excluir'
                              : r.flagAnomalia === 'Anomalia'
                                ? 'row-anomalia'
                                : r.flagAnomalia === 'Atenção'
                                  ? 'row-atencao'
                                  : ''
                      }
                    >
                      <td>{r.mes}</td>
                      <td>{num(r.total)}</td>
                      <td>{r.status}</td>
                      <td>{r.totalAjustado !== null ? num(r.totalAjustado) : '—'}</td>
                      <td>{pct(r.variacaoMm)}</td>
                      <td>{r.mediaMovel3m !== null ? num(r.mediaMovel3m) : '—'}</td>
                      <td>{r.flagAnomalia}</td>
                      <td>{r.usoNoModelo}</td>
                      <td>{r.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <SimulationPanel dashboard={dashboard} />

          <section className="panel apresentacao">
            <h2>Texto para apresentação</h2>
            <p>{APRESENTACAO_TEXTO}</p>
            <details>
              <summary>Critérios metodológicos (resumo)</summary>
              <ul>
                <li><strong>Abr/2026:</strong> parada no fornecimento — não é queda de demanda.</li>
                <li><strong>Mai/2026:</strong> mês parcial, retorno gradual e racionamento.</li>
                <li>Somente meses <strong>Completos</strong> entram na média, tendência e forecast.</li>
                <li>Risco: Verde &gt; 4 meses · Amarelo 2–4 · Vermelho &lt; 2 meses de autonomia.</li>
                <li>Anomalia: desvio &gt; 1σ (Atenção) ou &gt; 2σ (Anomalia) vs. meses válidos.</li>
              </ul>
            </details>
          </section>
        </>
      )}
        </>
      )}
    </div>
  );
}
