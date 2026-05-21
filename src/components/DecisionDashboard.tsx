import { useMemo } from 'react';
import { buildChartSerie } from '@shared/insights';
import type { DashboardState } from '@shared/types';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import MethodologyBanner from './MethodologyBanner';
import './DecisionDashboard.css';

function num(n: number | null, dec = 0): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function pct(n: number | null): string {
  if (n === null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

interface Props {
  dashboard: DashboardState;
  contratoMensal?: number;
}

export default function DecisionDashboard({
  dashboard,
  contratoMensal = 1500,
}: Props) {
  const ins = dashboard.insights;
  const chartSerie = useMemo(
    () => buildChartSerie(dashboard.rows, ins.demandaReferenciaPreRuptura),
    [dashboard.rows, ins.demandaReferenciaPreRuptura],
  );

  const utilizacaoData = useMemo(
    () => [
      {
        nome: 'Média válida',
        valor: dashboard.kpis.mediaMensalValida,
        fill: '#2563eb',
      },
      {
        nome: 'Contrato (1.500)',
        valor: contratoMensal,
        fill: '#94a3b8',
      },
      {
        nome: 'Projeção +1',
        valor: dashboard.tendenciaProximos[0]?.valor ?? 0,
        fill: '#9333ea',
      },
      {
        nome: 'Pico',
        valor: dashboard.kpis.picoConsumo,
        fill: '#ea580c',
      },
    ],
    [dashboard, contratoMensal],
  );

  return (
    <div className="decision-dashboard">
      <MethodologyBanner rows={dashboard.rows} />

      <section className="panel">
        <h2>KPIs para decisão e monitoramento</h2>
        <div className="insights-grid">
          <article className="insight-card">
            <span className="insight-label">Meses no modelo</span>
            <strong>{ins.mesesCompletos}</strong>
            <small>{ins.mesesExcluidos} excluído(s) (ruptura/parcial)</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Demanda ref. pré-ruptura</span>
            <strong>{num(ins.demandaReferenciaPreRuptura)}</strong>
            <small>Média 3 meses antes Abr/2026</small>
          </article>
          <article className="insight-card highlight-warn">
            <span className="insight-label">Gap estimado na ruptura</span>
            <strong>{num(ins.gapEstimadoRuptura)}</strong>
            <small>Cestas/mês abaixo da referência em Abr/2026</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Utilização do contrato</span>
            <strong>{ins.utilizacaoContratoPct.toFixed(0)}%</strong>
            <small>Média válida ÷ {num(contratoMensal)}/mês</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Tendência no período</span>
            <strong>{pct(ins.tendenciaPeriodoPct)}</strong>
            <small>Primeiro → último mês válido</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Volatilidade (CV)</span>
            <strong>{ins.indiceVolatilidadePct.toFixed(1)}%</strong>
            <small>Desvio ÷ média (meses válidos)</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Pico ÷ média</span>
            <strong>{ins.indicePicoSobreMedia.toFixed(2)}×</strong>
            <small>Pressão de pico vs ritmo médio</small>
          </article>
          <article className="insight-card">
            <span className="insight-label">Projeção +1 vs contrato</span>
            <strong>
              {ins.projecao1VsContrato != null
                ? `${ins.projecao1VsContrato >= 0 ? '+' : ''}${num(ins.projecao1VsContrato)}`
                : '—'}
            </strong>
            <small>Diferença em cestas/mês</small>
          </article>
        </div>
      </section>

      <section className="charts-row">
        <div className="panel chart-panel chart-wide">
          <h2>Consumo observado vs modelo (com contexto operacional)</h2>
          <p className="hint">
            Barras vermelhas = ruptura (parada fornecimento). Amarelas = parcial/racionamento.
            Linha tracejada = demanda de referência pré-ruptura. Linha verde = série válida para
            previsão.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartSerie}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              {ins.demandaReferenciaPreRuptura != null && (
                <ReferenceLine
                  y={ins.demandaReferenciaPreRuptura}
                  stroke="#64748b"
                  strokeDasharray="6 4"
                  label={{ value: 'Ref. pré-ruptura', position: 'insideTopRight', fontSize: 10 }}
                />
              )}
              <ReferenceLine
                y={contratoMensal}
                stroke="#0d9488"
                strokeDasharray="4 4"
                label={{ value: 'Contrato', fontSize: 10 }}
              />
              <Bar dataKey="observado" name="Observado" radius={[4, 4, 0, 0]}>
                {chartSerie.map((entry, i) => (
                  <Cell key={i} fill={entry.fillObservado} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="ajustado"
                name="Modelo (válido)"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="mediaMovel"
                name="Média móvel 3m"
                stroke="#ca8a04"
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="panel chart-panel">
          <h2>Referência vs contrato e projeção</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={utilizacaoData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="valor" name="Cestas" radius={[0, 4, 4, 0]}>
                {utilizacaoData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>Linha do tempo operacional</h2>
        <div className="timeline">
          {dashboard.rows.map((r) => {
            const excl = r.usoNoModelo === 'Não';
            return (
              <div
                key={r.mes}
                className={`timeline-item ${excl ? 'timeline-excluido' : 'timeline-valido'}`}
              >
                <div className="timeline-mes">{r.mes}</div>
                <div className="timeline-valor">{num(r.total)}</div>
                <div className="timeline-status">{r.status}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
