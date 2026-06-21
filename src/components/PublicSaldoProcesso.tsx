import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Package } from 'lucide-react';
import { buildEvolucaoSaldoEmpenho } from '@shared/processoEmergencial';
import type { ServicesPayload } from '@shared/serviceTypes';
import { chartAxisProps, chartGridProps, CHART } from '../theme/charts';
import DashboardChartTooltip from './ui/DashboardChartTooltip';
import PublicProgressBar, { toneFromPctRestante } from './ui/PublicProgressBar';
import './PublicSaldoProcesso.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  payload: ServicesPayload;
}

export default function PublicSaldoProcesso({ payload }: Props) {
  const rows = useMemo(() => buildEvolucaoSaldoEmpenho(payload), [payload]);
  const total = payload.emergencial.empenhoTotalCestas ?? rows[0]?.saldoRestante ?? 5000;
  const ultimo = rows[rows.length - 1];
  const saldo = ultimo?.saldoRestante ?? total;
  const consumido = ultimo?.enviadoAcumulado ?? 0;
  const pctRestante = total > 0 ? (saldo / total) * 100 : 100;

  const chartData = rows.slice(1).map((r) => ({
    label: r.periodo.replace(/^S\d+\s/, ''),
    saldo: r.saldoRestante,
    enviado: r.enviadoSemana,
  }));

  if (rows.length <= 1) {
    return (
      <section className="panel">
        <p className="hint">Sem lançamentos para mostrar evolução do saldo.</p>
      </section>
    );
  }

  return (
    <div className="public-saldo-processo">
      <section className="home-kpi-strip home-kpi-strip--verde">
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <Package size={20} />
          </span>
          <span className="home-kpi-label">Empenho do processo</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(saldo)}</span>
            <span className="home-kpi-unit">cestas restantes</span>
          </p>
          <PublicProgressBar
            pct={pctRestante}
            tone={toneFromPctRestante(pctRestante)}
            label={`Saldo: ${num(saldo)} de ${num(total)}`}
          />
          <span className="home-kpi-hint home-kpi-hint--bar">
            {num(consumido)} usadas · {num(total)} no total · 16 ciclos previstos
          </span>
        </article>
      </section>

      <section className="panel public-saldo-chart-panel">
        <h2>Evolução do saldo</h2>
        <p className="hint public-saldo-chart-sub">
          Queda semana a semana desde o ponto zero (20/05/2026)
        </p>
        <div className="public-saldo-chart">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="label"
                {...chartAxisProps}
                interval="preserveStartEnd"
                tick={{ ...chartAxisProps.tick, fontSize: 9 }}
              />
              <YAxis {...chartAxisProps} width={48} />
              <Tooltip content={<DashboardChartTooltip />} />
              <Line
                type="monotone"
                dataKey="saldo"
                name="Saldo restante"
                stroke={CHART.contrato}
                strokeWidth={2.5}
                dot={{ r: 3, fill: CHART.contrato }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="public-saldo-semanas">
          {rows.slice(-6).map((r, i) => (
            <div key={`${r.mes}-${r.semana}-${i}`} className="public-saldo-semana-chip">
              <span>{r.periodo}</span>
              <strong>−{num(r.enviadoSemana)}</strong>
              <em>{num(r.saldoRestante)} rest.</em>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
