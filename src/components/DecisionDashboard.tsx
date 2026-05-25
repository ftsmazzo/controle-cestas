import { useMemo } from 'react';
import { buildChartSerie, computeInsights } from '@shared/insights';
import {
  computeForecastUntilYearEnd,
  forecastNextMonth,
  PROJECAO_METODO_RESUMO,
} from '@shared/forecastPlan';
import type { DashboardState } from '@shared/types';
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

interface Props {
  dashboard: DashboardState;
  contratoMensal?: number;
  janelaAnaliseMeses?: number | null;
}

export default function DecisionDashboard({
  dashboard,
  contratoMensal = 1200,
  janelaAnaliseMeses = 8,
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

  const ins = useMemo(() => {
    const proj =
      proximoMes.valor ??
      previsaoAno.pontos[0]?.valor ??
      dashboard.tendenciaProximos[0]?.valor ??
      null;
    if (dashboard.insights?.mesesCompletos != null) {
      return { ...dashboard.insights, projecao1VsContrato: proj != null ? proj - contratoMensal : null };
    }
    return computeInsights(dashboard.rows, dashboard.kpis, proj, contratoMensal);
  }, [dashboard, contratoMensal, proximoMes, previsaoAno.pontos]);

  const consumoEPrevisao = useMemo(() => {
    const hist = dashboard.rows.map((r) => ({
      mes: r.mes,
      observado: r.total,
      previsao: null as number | null,
      excluido: r.usoNoModelo === 'Não',
    }));
    const prev = previsaoAno.pontos.map((p) => ({
      mes: p.mes,
      observado: null as number | null,
      previsao: p.valor,
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

  return (
    <div className="decision-dashboard">
      <section className="panel projecao-kpis">
        <div className="projecao-kpi-grid">
          <div>
            <span className="kpi-label">Próximo mês (previsão)</span>
            <strong className="kpi-big">{num(proximoMes.valor)}</strong>
            <span className="hint-inline">Mesma janela: {janelaLabel}</span>
          </div>
          <div>
            <span className="kpi-label">Média na janela</span>
            <strong>{num(meta?.mediaJanela ?? dashboard.kpis.mediaMensalValida)}</strong>
          </div>
          <div>
            <span className="kpi-label">Contrato</span>
            <strong>{num(contratoMensal)}/mês</strong>
          </div>
          <div>
            <span className="kpi-label">vs contrato (1ª previsão)</span>
            <strong>
              {ins.projecao1VsContrato != null
                ? `${ins.projecao1VsContrato >= 0 ? '+' : ''}${num(ins.projecao1VsContrato)}`
                : '—'}
            </strong>
          </div>
        </div>
        <p className="hint projecao-hint">{PROJECAO_METODO_RESUMO}</p>
        <p className="hint">
          Ajuste a janela em{' '}
          <a href="/admin/metodologia">Admin → Metodologia</a>. Em{' '}
          <a href="/distribuir-mes">Distribuir mês</a> use o mesmo total sugerido para dividir por
          equipamento (soma dos equipamentos = total do mês).
        </p>
      </section>

      <section className="panel chart-panel chart-hero">
        <h2>Consumo total e previsão</h2>
        <p className="hint">
          Barras = total mensal (soma dos equipamentos). Vermelho/amarelo = fora do modelo. Linha
          roxa = regressão na janela ({janelaLabel}). Verde = contrato {num(contratoMensal)}/mês.
          {meta && (
            <>
              {' '}
              Meses na janela: {meta.mesesNaJanela.join(', ')}.
            </>
          )}
        </p>
        <ResponsiveContainer width="100%" height={380}>
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
              dataKey="previsao"
              name="Previsão"
              stroke="#9333ea"
              strokeWidth={2.5}
              strokeDasharray="6 3"
              dot={{ r: 4, fill: '#9333ea' }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <div className="charts-row">
        <section className="panel chart-panel">
          <h2>Tendência na janela</h2>
          <p className="hint">
            Ritmo {inclinacao >= 0 ? '+' : ''}
            {num(inclinacao)} cestas/mês na reta ({janelaLabel}).
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
