import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { ConsumoSemanalGrupo } from '@shared/publicDashboardAnalytics';
import { buildConsumoSemanalPorGrupo } from '@shared/publicDashboardAnalytics';
import type { ServicesPayload } from '@shared/serviceTypes';
import { CHART, chartAxisProps, chartGridProps } from '../theme/charts';
import DashboardChartTooltip from './ui/DashboardChartTooltip';
import './PublicConsumoSemanalChart.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

const GRUPO_CORES = {
  cras: '#3b82f6',
  creas: '#8b5cf6',
  pse: '#10b981',
  fixos: '#f59e0b',
} as const;

function TendenciaIcon({ t }: { t: ConsumoSemanalGrupo['tendencia'] }) {
  if (t === 'up') return <TrendingUp size={14} className="consumo-trend consumo-trend--up" />;
  if (t === 'down') return <TrendingDown size={14} className="consumo-trend consumo-trend--down" />;
  return <Minus size={14} className="consumo-trend consumo-trend--flat" />;
}

function tendenciaLabel(t: ConsumoSemanalGrupo['tendencia']): string {
  if (t === 'up') return 'Aumento';
  if (t === 'down') return 'Redução';
  return 'Estável';
}

interface Props {
  payload: ServicesPayload;
}

export default function PublicConsumoSemanalChart({ payload }: Props) {
  const dados = useMemo(() => buildConsumoSemanalPorGrupo(payload, 12), [payload]);
  const ultima = dados[dados.length - 1];

  if (dados.length < 2) {
    return (
      <section className="panel public-consumo-panel">
        <h2>Consumo semanal por grupo</h2>
        <p className="hint">Lance mais semanas para ver a evolução do consumo.</p>
      </section>
    );
  }

  return (
    <section className="panel public-consumo-panel">
      <header className="public-consumo-head">
        <div>
          <h2>Consumo semanal por grupo</h2>
          <p className="hint public-consumo-sub">
            Total e grupos (CRAS, CREAS, PSE, fixos) — sem detalhar equipamento a
            equipamento.
          </p>
        </div>
        {ultima && (
          <div className="public-consumo-ultima-kpi">
            <span className="public-consumo-ultima-label">Última semana</span>
            <strong className="public-consumo-ultima-valor">{num(ultima.total)}</strong>
            {ultima.deltaTotal != null && (
              <span className={`public-consumo-delta public-consumo-delta--${ultima.tendencia}`}>
                <TendenciaIcon t={ultima.tendencia} />
                {ultima.deltaTotal >= 0 ? '+' : ''}
                {num(ultima.deltaTotal)}
                {ultima.deltaPct != null && (
                  <span className="public-consumo-delta-pct">
                    ({ultima.deltaPct >= 0 ? '+' : ''}
                    {num(ultima.deltaPct, 1)}%)
                  </span>
                )}
                <span className="public-consumo-delta-text">{tendenciaLabel(ultima.tendencia)}</span>
              </span>
            )}
          </div>
        )}
      </header>

      <div className="public-consumo-chart">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...chartGridProps} />
            <XAxis
              dataKey="label"
              {...chartAxisProps}
              interval="preserveStartEnd"
              tick={{ ...chartAxisProps.tick, fontSize: 10 }}
            />
            <YAxis {...chartAxisProps} width={44} />
            <Tooltip content={<DashboardChartTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(v) =>
                v === 'cras'
                  ? 'CRAS'
                  : v === 'creas'
                    ? 'CREAS'
                    : v === 'pse'
                      ? 'PSE'
                      : v === 'fixos'
                        ? 'Fixos'
                        : 'Total'
              }
            />
            <Bar dataKey="cras" stackId="g" fill={GRUPO_CORES.cras} radius={[0, 0, 0, 0]} />
            <Bar dataKey="creas" stackId="g" fill={GRUPO_CORES.creas} />
            <Bar dataKey="pse" stackId="g" fill={GRUPO_CORES.pse} />
            <Bar dataKey="fixos" stackId="g" fill={GRUPO_CORES.fixos} radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="total"
              stroke={CHART.observado}
              strokeWidth={2.5}
              dot={{ r: 3, fill: CHART.observado }}
              name="total"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="public-consumo-semanas-strip">
        {dados.map((d) => (
          <div
            key={d.indice}
            className={`public-consumo-semana-chip public-consumo-semana-chip--${d.tendencia}`}
            title={`${d.periodo}: ${num(d.total)} cestas`}
          >
            <span className="public-consumo-chip-label">{d.label}</span>
            <strong>{num(d.total)}</strong>
            {d.deltaTotal != null && d.deltaTotal !== 0 && (
              <span className="public-consumo-chip-delta">
                {d.deltaTotal > 0 ? '+' : ''}
                {num(d.deltaTotal)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
