import { useMemo } from 'react';
import { comparativoContrato, ultimoMesValidoLabel } from '@shared/decisionMetrics';
import { computeDecisionNumbers } from '@shared/decisionNumbers';
import { buildChartSerie, computeInsights } from '@shared/insights';
import {
  computeForecastUntilYearEnd,
  forecastNextMonth,
  PROJECAO_METODO_RESUMO,
} from '@shared/forecastPlan';
import type { DashboardState } from '@shared/types';
import type { ServiceDef, ServiceMonthRecord } from '@shared/serviceTypes';
import DecisionNumbersLegend from './DecisionNumbersLegend';
import {
  Bar,
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
import './DecisionDashboard.css';

function num(n: number | null, dec = 0): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function deltaStr(d: number | null): string {
  if (d === null || Number.isNaN(d)) return '—';
  return `${d >= 0 ? '+' : ''}${num(d)}`;
}

interface Props {
  dashboard: DashboardState;
  contratoMensal?: number;
  janelaAnaliseMeses?: number | null;
  history?: ServiceMonthRecord[];
  services?: ServiceDef[];
}

export default function DecisionDashboard({
  dashboard,
  contratoMensal = 1200,
  janelaAnaliseMeses = null,
  history = [],
  services = [],
}: Props) {
  const previsaoAno = useMemo(
    () =>
      computeForecastUntilYearEnd(dashboard.rows, {
        windowMonths: janelaAnaliseMeses,
      }),
    [dashboard.rows, janelaAnaliseMeses],
  );

  const proximoMes = useMemo(
    () => forecastNextMonth(dashboard.rows, janelaAnaliseMeses),
    [dashboard.rows, janelaAnaliseMeses],
  );

  const decisionNums = useMemo(
    () =>
      computeDecisionNumbers(
        dashboard.rows,
        janelaAnaliseMeses,
        history,
        services,
        dashboard.kpis,
        proximoMes.valor,
      ),
    [
      dashboard.rows,
      dashboard.kpis,
      janelaAnaliseMeses,
      history,
      services,
      proximoMes.valor,
    ],
  );

  const cmp = useMemo(
    () =>
      comparativoContrato(
        dashboard.rows,
        contratoMensal,
        decisionNums.previsaoProximoMes,
        previsaoAno.pontos,
      ),
    [dashboard.rows, contratoMensal, decisionNums.previsaoProximoMes, previsaoAno.pontos],
  );

  const ins = useMemo(() => {
    const proj = proximoMes.valor ?? previsaoAno.pontos[0]?.valor ?? null;
    if (dashboard.insights?.mesesCompletos != null) {
      return { ...dashboard.insights, projecao1VsContrato: cmp.previsaoVsContrato };
    }
    return computeInsights(dashboard.rows, dashboard.kpis, proj, contratoMensal);
  }, [dashboard, contratoMensal, proximoMes, cmp.previsaoVsContrato]);

  const consumoEPrevisao = useMemo(() => {
    const hist = dashboard.rows.map((r) => ({
      mes: r.mes,
      observado: r.total,
      previsao: null as number | null,
      tendenciaProj: r.usoNoModelo === 'Sim' ? r.total : null,
      previsaoMin: null as number | null,
      previsaoMax: null as number | null,
      excluido: r.usoNoModelo === 'Não',
    }));
    const prev = previsaoAno.pontos.map((p) => ({
      mes: p.mes,
      observado: null as number | null,
      previsao: p.valor,
      tendenciaProj: p.valor,
      previsaoMin: p.valorPessimista ?? null,
      previsaoMax: p.valorOtimista ?? null,
      excluido: false,
    }));
    return [...hist, ...prev];
  }, [dashboard.rows, previsaoAno.pontos]);

  const tendenciaValida = useMemo(() => {
    const valid = dashboard.rows.filter((r) => r.usoNoModelo === 'Sim');
    const slice =
      janelaAnaliseMeses != null && janelaAnaliseMeses > 0
        ? valid.slice(-janelaAnaliseMeses)
        : valid;
    return slice.map((r) => ({
      mes: r.mes,
      total: r.total,
      mediaMovel: r.mediaMovel3m,
    }));
  }, [dashboard.rows, janelaAnaliseMeses]);

  const chartSerie = useMemo(
    () => buildChartSerie(dashboard.rows, ins.demandaReferenciaPreRuptura),
    [dashboard.rows, ins.demandaReferenciaPreRuptura],
  );

  const meta = previsaoAno.meta;
  const inclinacao = meta?.inclinacaoPorMes ?? 0;
  const janelaLabel =
    janelaAnaliseMeses != null && janelaAnaliseMeses > 0
      ? `últimos ${janelaAnaliseMeses} meses válidos`
      : 'todos os meses válidos';
  const ultimoValido = meta?.ultimoMesValido ?? ultimoMesValidoLabel(dashboard.rows);

  return (
    <div className="decision-dashboard">
      <DecisionNumbersLegend
        numbers={decisionNums}
        contratoMensal={contratoMensal}
      />
      <section className="panel projecao-kpis projecao-kpis--decisao">
        <h3 className="projecao-kpis-title">Decisão vs contrato</h3>
        <div className="projecao-kpi-grid">
          <div className="kpi-highlight">
            <span className="kpi-label">Próximo mês previsto</span>
            <strong className="kpi-big">{num(decisionNums.previsaoProximoMes)}</strong>
            <span className="kpi-delta">
              vs contrato {num(contratoMensal)}: {deltaStr(cmp.previsaoVsContrato)}
            </span>
          </div>
          <div className="kpi-highlight">
            <span className="kpi-label">Média previsão jun–dez</span>
            <strong className="kpi-big">{num(decisionNums.mediaPrevisaoJunDez)}</strong>
            <span className="kpi-delta">
              vs contrato: {deltaStr(cmp.mediaPrevisaoVsContrato)} · soma{' '}
              {num(cmp.somaPrevisaoFutura)}
            </span>
          </div>
          <div>
            <span className="kpi-label">Contrato vigente</span>
            <strong>{num(contratoMensal)}/mês</strong>
          </div>
          <div>
            <span className="kpi-label">Último mês válido</span>
            <strong>{ultimoValido ?? '—'}</strong>
            <span className="hint-inline">Tendência parte daqui (Abr/Mai fora)</span>
          </div>
        </div>
      </section>

      <section className="panel projecao-kpis projecao-kpis--ref">
        <h3 className="projecao-kpis-title">Referência histórica (passado)</h3>
        <div className="projecao-kpi-grid">
          <div>
            <span className="kpi-label">Média limpa histórica</span>
            <strong>{num(cmp.mediaLimpaHistorica)}</strong>
            <span className="hint-inline">
              vs contrato: {deltaStr(cmp.mediaLimpaVsContrato)} — não é meta de entrega
            </span>
          </div>
          <div>
            <span className="kpi-label">Desvio padrão limpo</span>
            <strong>{num(meta?.desvioPadraoLimpo ?? dashboard.kpis.desvioPadrao)}</strong>
          </div>
          <div>
            <span className="kpi-label">Inclinação tendência</span>
            <strong>
              {inclinacao >= 0 ? '+' : ''}
              {num(inclinacao)}/mês
            </strong>
            <span className="hint-inline">{janelaLabel}</span>
          </div>
        </div>
        <p className="hint projecao-hint">{PROJECAO_METODO_RESUMO}</p>
        <p className="hint">
          A nota técnica (~1.351) usa só Abr/25–Mar/26 válidos. Se sua média limpa difere (ex.{' '}
          {num(cmp.mediaLimpaHistorica)}), o histórico importado tem mais ou menos meses válidos.
          Ajuste em <a href="/admin/metodologia">Metodologia</a>.
        </p>
      </section>

      <section className="panel chart-panel chart-hero">
        <h2>Consumo observado e tendência projetada</h2>
        <p className="hint">
          Barras = observado. Linha verde tracejada = tendência a partir do último mês válido (
          {ultimoValido ?? '—'}). Linha roxa = previsão mês a mês. Abr/Mai/2026 não entram no
          modelo. Verde = contrato {num(contratoMensal)}/mês.
        </p>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart data={consumoEPrevisao}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={72} />
            <YAxis />
            <Tooltip />
            <Legend />
            <ReferenceLine
              y={contratoMensal}
              stroke="#0d9488"
              strokeDasharray="6 4"
              label={{ value: `Contrato ${contratoMensal}`, fontSize: 10 }}
            />
            <Bar dataKey="observado" name="Observado" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Line
              type="monotone"
              dataKey="tendenciaProj"
              name="Tendência projetada"
              stroke="#16a34a"
              strokeWidth={2.5}
              strokeDasharray="8 4"
              dot={{ r: 3, fill: '#16a34a' }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="previsao"
              name="Previsão (base)"
              stroke="#9333ea"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              dot={{ r: 4, fill: '#9333ea' }}
              connectNulls
            />
            {meta?.metodo === 'nota_tecnica' && (
              <>
                <Line
                  type="monotone"
                  dataKey="previsaoMin"
                  name="Pessimista"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="previsaoMax"
                  name="Otimista"
                  stroke="#64748b"
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  connectNulls
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <div className="charts-row">
        <section className="panel chart-panel">
          <h2>Tendência na janela</h2>
          <p className="hint">
            Ritmo {inclinacao >= 0 ? '+' : ''}
            {num(inclinacao)} cestas/mês ({janelaLabel}).
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={tendenciaValida}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Legend />
              <ReferenceLine y={contratoMensal} stroke="#0d9488" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="total"
                name="Consumo válido"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3 }}
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
        </section>

        <section className="panel chart-panel">
          <h2>Histórico completo (cores)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartSerie}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="observado" name="Total do mês" radius={[3, 3, 0, 0]}>
                {chartSerie.map((entry, i) => (
                  <Cell key={i} fill={entry.fillObservado} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="ajustado"
                name="Entra no modelo"
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>
      </div>
    </div>
  );
}
