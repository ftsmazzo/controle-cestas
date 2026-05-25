import { useMemo } from 'react';
import {
  Activity,
  BarChart2,
  FileText,
  LineChart,
  Sigma,
  TrendingUp,
} from 'lucide-react';
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
import { CHART, chartAxisProps, chartGridProps } from '../theme/charts';
import DecisionNumbersLegend from './DecisionNumbersLegend';
import DashboardChartTooltip from './ui/DashboardChartTooltip';
import MetricCard from './ui/MetricCard';
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

function deltaTone(d: number | null): 'up' | 'down' | 'neutral' {
  if (d == null || d === 0) return 'neutral';
  return d > 0 ? 'up' : 'down';
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
      volumeMenor: null as number | null,
      volumeMaior: null as number | null,
      volumeMedio: null as number | null,
      excluido: r.usoNoModelo === 'Não',
    }));
    const prev = previsaoAno.pontos.map((p) => ({
      mes: p.mes,
      observado: null as number | null,
      previsao: p.valor,
      tendenciaProj: p.valor,
      volumeMenor: p.cenarioMenor ?? null,
      volumeMaior: p.cenarioMaior ?? null,
      volumeMedio: p.cenarioMedio ?? null,
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
  const desvio = meta?.desvioPadraoLimpo ?? dashboard.kpis.desvioPadrao;

  return (
    <div className="decision-dashboard">
      <DecisionNumbersLegend
        numbers={decisionNums}
        contratoMensal={contratoMensal}
      />

      <div className="dd-main-grid">
        <section className="dd-panel dd-panel--chart">
          <header className="dd-panel__header">
            <span className="dd-panel__icon">
              <LineChart size={20} />
            </span>
            <div>
              <h2>Consumo e projeção de cessão</h2>
              <p className="dd-panel__subtitle">
                Histórico observado, tendência a partir de {ultimoValido ?? '—'} e
                cenários futuros. Linha teal = contrato {num(contratoMensal)}/mês.
              </p>
            </div>
          </header>
          <ResponsiveContainer width="100%" height={420}>
            <ComposedChart data={consumoEPrevisao} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradObservado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.observadoGradient[0]} />
                  <stop offset="100%" stopColor={CHART.observadoGradient[1]} />
                </linearGradient>
              </defs>
              <CartesianGrid {...chartGridProps} />
              <XAxis
                dataKey="mes"
                {...chartAxisProps}
                angle={-32}
                textAnchor="end"
                height={68}
                interval="preserveStartEnd"
              />
              <YAxis {...chartAxisProps} width={52} />
              <Tooltip content={<DashboardChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <ReferenceLine
                y={contratoMensal}
                stroke={CHART.contrato}
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: `Contrato ${contratoMensal}`,
                  position: 'insideTopRight',
                  fill: CHART.contrato,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              />
              <Bar
                dataKey="observado"
                name="Observado"
                fill="url(#gradObservado)"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Line
                type="monotone"
                dataKey="tendenciaProj"
                name="Tendência"
                stroke={CHART.tendencia}
                strokeWidth={2.5}
                strokeDasharray="8 4"
                dot={{ r: 3, fill: CHART.tendencia, strokeWidth: 0 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="previsao"
                name="Volume de referência"
                stroke={CHART.referencia}
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 4, fill: CHART.referencia, strokeWidth: 0 }}
                connectNulls
              />
              {meta?.metodo === 'nota_tecnica' && (
                <>
                  <Line
                    type="monotone"
                    dataKey="volumeMenor"
                    name="Volume menor"
                    stroke={CHART.volumeMenor}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="volumeMaior"
                    name="Volume maior"
                    stroke={CHART.volumeMaior}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="volumeMedio"
                    name="Planejamento médio"
                    stroke={CHART.planejamentoMedio}
                    strokeWidth={2}
                    strokeDasharray="5 2"
                    dot={{ r: 3, fill: CHART.planejamentoMedio, strokeWidth: 0 }}
                    connectNulls
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <aside className="dd-sidebar">
          <section className="dd-panel dd-panel--sidebar">
            <header className="dd-panel__header dd-panel__header--compact">
              <span className="dd-panel__icon dd-panel__icon--accent">
                <Activity size={18} />
              </span>
              <h2>Leitura rápida</h2>
            </header>
            <div className="dd-sidebar__cards">
              <MetricCard
                label="Referência vs contrato"
                value={num(decisionNums.previsaoProximoMes)}
                icon={<TrendingUp size={16} />}
                variant="referencia"
                size="sm"
                delta={`${deltaStr(cmp.previsaoVsContrato)} · contrato ${num(contratoMensal)}`}
                deltaTone={deltaTone(cmp.previsaoVsContrato)}
              />
              <MetricCard
                label="Planejamento médio (próx.)"
                value={num(decisionNums.cenariosProximoMes?.medio ?? null)}
                icon={<Sigma size={16} />}
                variant="medio"
                size="sm"
                delta={
                  decisionNums.cenariosProximoMes
                    ? `Menor ${num(decisionNums.cenariosProximoMes.menor)} · Maior ${num(decisionNums.cenariosProximoMes.maior)}`
                    : undefined
                }
              />
              <MetricCard
                label="Média referência jun–dez"
                value={num(decisionNums.mediaPrevisaoJunDez)}
                icon={<BarChart2 size={16} />}
                variant="primary"
                size="sm"
                delta={`${deltaStr(cmp.mediaPrevisaoVsContrato)} vs contrato`}
                deltaTone={deltaTone(cmp.mediaPrevisaoVsContrato)}
              />
              <MetricCard
                label="Inclinação tendência"
                value={`${inclinacao >= 0 ? '+' : ''}${num(inclinacao)}/mês`}
                icon={<LineChart size={16} />}
                size="sm"
                hint={janelaLabel}
              />
              <MetricCard
                label="Desvio padrão limpo"
                value={num(desvio)}
                icon={<Sigma size={16} />}
                variant="muted"
                size="sm"
                hint="Faixa ± usada nos cenários menor/maior"
              />
            </div>
          </section>

          <section className="dd-panel dd-panel--method">
            <header className="dd-panel__header dd-panel__header--compact">
              <span className="dd-panel__icon">
                <FileText size={18} />
              </span>
              <h2>Metodologia</h2>
            </header>
            <p className="dd-method-text">{PROJECAO_METODO_RESUMO}</p>
            <ul className="dd-method-stats">
              <li>
                <span>Média limpa</span>
                <strong>{num(cmp.mediaLimpaHistorica)}</strong>
              </li>
              <li>
                <span>Média nota Abr/25+</span>
                <strong>{num(decisionNums.mediaNotaPeriodo)}</strong>
              </li>
              <li>
                <span>Ref. pré-ruptura</span>
                <strong>{num(decisionNums.referenciaPreRuptura)}</strong>
              </li>
            </ul>
            <p className="dd-method-foot">
              Ajustes em <a href="/admin/metodologia">Metodologia</a>.
            </p>
          </section>
        </aside>
      </div>

      <div className="dd-charts-row">
        <section className="dd-panel">
          <header className="dd-panel__header dd-panel__header--compact">
            <span className="dd-panel__icon">
              <TrendingUp size={18} />
            </span>
            <div>
              <h2>Tendência na janela</h2>
              <p className="dd-panel__subtitle">{janelaLabel}</p>
            </div>
          </header>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={tendenciaValida} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="mes" {...chartAxisProps} angle={-28} textAnchor="end" height={56} />
              <YAxis {...chartAxisProps} width={48} />
              <Tooltip content={<DashboardChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={contratoMensal} stroke={CHART.contrato} strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="total"
                name="Consumo válido"
                stroke={CHART.tendencia}
                strokeWidth={2.5}
                dot={{ r: 3, fill: CHART.tendencia, strokeWidth: 0 }}
              />
              <Line
                type="monotone"
                dataKey="mediaMovel"
                name="Média móvel 3m"
                stroke={CHART.mediaMovel}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </section>

        <section className="dd-panel">
          <header className="dd-panel__header dd-panel__header--compact">
            <span className="dd-panel__icon">
              <BarChart2 size={18} />
            </span>
            <div>
              <h2>Histórico completo</h2>
              <p className="dd-panel__subtitle">Meses válidos vs excluídos do modelo</p>
            </div>
          </header>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartSerie} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...chartGridProps} />
              <XAxis dataKey="mes" {...chartAxisProps} angle={-28} textAnchor="end" height={56} />
              <YAxis {...chartAxisProps} width={48} />
              <Tooltip content={<DashboardChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="observado" name="Total do mês" radius={[4, 4, 0, 0]} maxBarSize={22}>
                {chartSerie.map((entry, i) => (
                  <Cell key={i} fill={entry.fillObservado} />
                ))}
              </Bar>
              <Line
                type="monotone"
                dataKey="ajustado"
                name="Entra no modelo"
                stroke={CHART.tendencia}
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
