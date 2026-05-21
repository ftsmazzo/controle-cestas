import { useCallback, useMemo, useState } from 'react';
import {
  APRESENTACAO_TEXTO,
  computeForecast,
  computeKpis,
  contractScenarios,
  mediaMovelUltimos3Validos,
  processSeries,
} from './lib/calculations';
import { parseDemoData, parseWorkbook } from './lib/excelParser';
import { clearState, loadState, saveState } from './lib/storage';
import type { DashboardState } from './lib/types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './App.css';

function buildDashboard(
  raw: ReturnType<typeof parseDemoData>,
  fileName: string,
  saldoAtual: number | null,
): DashboardState {
  const rows = processSeries(raw);
  const kpis = computeKpis(rows, saldoAtual);
  const { forecast, tendencia } = computeForecast(rows);
  return {
    rows,
    kpis,
    forecast,
    tendenciaProximos: tendencia,
    mediaMovelUltimos3: mediaMovelUltimos3Validos(rows),
    cenariosContrato: contractScenarios(),
    uploadedAt: new Date().toISOString(),
    fileName,
  };
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null, dec = 0): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(() => loadState());
  const [saldoAtual, setSaldoAtual] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const saldoNum = useMemo(() => {
    const v = parseFloat(saldoAtual.replace(/\./g, '').replace(',', '.'));
    return Number.isNaN(v) ? null : v;
  }, [saldoAtual]);

  const refreshWithSaldo = useCallback(
    (base: DashboardState) => {
      const raw = base.rows.map((r) => ({
        mes: r.mes,
        total: r.total,
        status: r.status,
        observacao: r.observacao,
      }));
      const next = buildDashboard(raw, base.fileName, saldoNum);
      setDashboard(next);
      saveState(next);
    },
    [saldoNum],
  );

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const raw = parseWorkbook(buffer);
      const state = buildDashboard(raw, file.name, saldoNum);
      setDashboard(state);
      saveState(state);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ler planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = () => {
    const state = buildDashboard(parseDemoData(), 'Dados demonstrativos', saldoNum);
    setDashboard(state);
    saveState(state);
    setError(null);
  };

  const chartData = useMemo(() => {
    if (!dashboard) return [];
    return dashboard.rows.map((r) => ({
      mes: r.mes,
      observado: r.total,
      ajustado: r.totalAjustado ?? undefined,
      mediaMovel: r.mediaMovel3m ?? undefined,
    }));
  }, [dashboard]);

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

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Dashboard de Consumo de Cestas Básicas</h1>
          <p className="subtitle">
            Abril/2025 a Maio/2026 · Metodologia replicável (nota técnica)
          </p>
        </div>
      </header>

      <section className="panel upload-panel">
        <h2>Importar histórico</h2>
        <p className="hint">
          Envie a planilha <strong>Levantamento Cestas Básicas</strong> (.xlsx) com
          colunas <em>Mês</em> e <em>Total</em>. Status e observação são opcionais;
          Abr/2026 e Mai/2026 podem ser inferidos automaticamente.
        </p>
        <div className="upload-row">
          <label className="file-btn">
            {loading ? 'Lendo…' : 'Selecionar planilha Excel'}
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
          <button type="button" className="secondary" onClick={handleDemo}>
            Carregar exemplo
          </button>
          {dashboard && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                clearState();
                setDashboard(null);
              }}
            >
              Limpar histórico
            </button>
          )}
        </div>
        <div className="saldo-row">
          <label>
            Saldo atual (cestas) — para autonomia e risco
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex.: 6000"
              value={saldoAtual}
              onChange={(e) => setSaldoAtual(e.target.value)}
              onBlur={() => dashboard && refreshWithSaldo(dashboard)}
            />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {dashboard && (
          <p className="meta">
            Arquivo: {dashboard.fileName} · Atualizado:{' '}
            {new Date(dashboard.uploadedAt).toLocaleString('pt-BR')}
          </p>
        )}
      </section>

      {!dashboard ? (
        <section className="panel empty">
          <p>Importe uma planilha ou use o exemplo para ver KPIs, gráficos e projeções.</p>
        </section>
      ) : (
        <>
          <section className="kpi-grid">
            <article className="kpi-card">
              <span className="kpi-label">Consumo total observado</span>
              <strong>{num(dashboard.kpis.consumoTotalObservado)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Consumo válido (modelo)</span>
              <strong>{num(dashboard.kpis.consumoTotalValido)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Média mensal válida</span>
              <strong>{num(dashboard.kpis.mediaMensalValida)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Pico de consumo</span>
              <strong>{num(dashboard.kpis.picoConsumo)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Menor consumo válido</span>
              <strong>{num(dashboard.kpis.menorConsumoValido)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Desvio padrão</span>
              <strong>{num(dashboard.kpis.desvioPadrao, 1)}</strong>
            </article>
            <article className="kpi-card">
              <span className="kpi-label">Média móvel (3 meses válidos)</span>
              <strong>{num(dashboard.mediaMovelUltimos3, 0)}</strong>
            </article>
            <article className={`kpi-card ${riskClass}`}>
              <span className="kpi-label">Autonomia (meses)</span>
              <strong>{num(dashboard.kpis.autonomiaMeses, 1)}</strong>
              <span className="risk-badge">{dashboard.kpis.riscoRuptura}</span>
            </article>
          </section>

          <section className="charts-row">
            <div className="panel chart-panel">
              <h2>Série mensal</h2>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="observado" name="Observado" stroke="#2563eb" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="ajustado" name="Ajustado modelo" stroke="#16a34a" strokeWidth={2} dot />
                  <Line type="monotone" dataKey="mediaMovel" name="Média móvel 3m" stroke="#ca8a04" strokeDasharray="4 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="panel chart-panel">
              <h2>Tendência / forecast (+3 meses)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={forecastChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="historico" name="Histórico" fill="#2563eb" />
                  <Bar dataKey="projecao" name="Projeção linear" fill="#9333ea" />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
                        r.flagAnomalia === 'Excluir modelo'
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

          <section className="panel">
            <h2>Simulação contrato 18.000 cestas</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Consumo mensal</th>
                    <th>Duração estimada</th>
                    <th>Leitura de risco</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.cenariosContrato.map((c) => (
                    <tr key={c.consumoMensal}>
                      <td>{num(c.consumoMensal)}/mês</td>
                      <td>{c.duracaoMeses.toFixed(1)} meses</td>
                      <td>{c.leitura}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel apresentacao">
            <h2>Texto para apresentação</h2>
            <p>{APRESENTACAO_TEXTO}</p>
            <details>
              <summary>Critérios metodológicos (resumo)</summary>
              <ul>
                <li>Somente meses <strong>Completos</strong> entram na média, desvio, tendência e forecast.</li>
                <li><strong>Ruptura</strong> e <strong>Parcial</strong> ficam fora do modelo preditivo.</li>
                <li>Risco: Verde &gt; 4 meses · Amarelo 2–4 · Vermelho &lt; 2 meses de autonomia.</li>
                <li>Anomalia: desvio &gt; 1σ (Atenção) ou &gt; 2σ (Anomalia) vs. meses válidos.</li>
              </ul>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
