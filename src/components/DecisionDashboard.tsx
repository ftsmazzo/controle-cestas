import { useMemo } from 'react';
import { buildChartSerie, computeInsights } from '@shared/insights';
import {
  computeForecastUntilYearEnd,
  PROJECAO_METODO_RESUMO,
} from '@shared/forecastPlan';
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

interface Props {
  dashboard: DashboardState;
  contratoMensal?: number;
}

export default function DecisionDashboard({
  dashboard,
  contratoMensal = 1200,
}: Props) {
  const ins = useMemo(() => {
    if (dashboard.insights?.mesesCompletos != null) return dashboard.insights;
    return computeInsights(
      dashboard.rows,
      dashboard.kpis,
      dashboard.tendenciaProximos[0]?.valor ?? null,
      contratoMensal,
    );
  }, [dashboard, contratoMensal]);

  const previsaoAno = useMemo(() => {
    if (dashboard.previsaoAteFimAno?.length) {
      return {
        pontos: dashboard.previsaoAteFimAno,
        meta: computeForecastUntilYearEnd(dashboard.rows).meta,
      };
    }
    return computeForecastUntilYearEnd(dashboard.rows);
  }, [dashboard]);

  const chartSerie = useMemo(
    () => buildChartSerie(dashboard.rows, ins.demandaReferenciaPreRuptura),
    [dashboard.rows, ins.demandaReferenciaPreRuptura],
  );

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

  const tendenciaValida = useMemo(
    () =>
      dashboard.rows
        .filter((r) => r.usoNoModelo === 'Sim')
        .map((r) => ({
          mes: r.mes,
          total: r.total,
          mediaMovel: r.mediaMovel3m,
        })),
    [dashboard.rows],
  );

  const comparativoContrato = useMemo(() => {
    const media = dashboard.kpis.mediaMensalValida;
    const projJun = previsaoAno.pontos[0]?.valor ?? null;
    const somaPrevisaoAno = previsaoAno.pontos.reduce((s, p) => s + p.valor, 0);
    return [
      { nome: 'Contrato (mês)', valor: contratoMensal },
      { nome: 'Média válida', valor: media },
      { nome: '1ª previsão futura', valor: projJun ?? 0 },
      {
        nome: 'Soma previsão ano',
        valor: somaPrevisaoAno,
      },
    ].filter((x) => x.valor > 0);
  }, [dashboard, contratoMensal, previsaoAno.pontos]);

  const inclinacao = previsaoAno.meta?.inclinacaoPorMes ?? 0;
  const tendenciaLabel =
    inclinacao > 5
      ? 'alta'
      : inclinacao < -5
        ? 'queda'
        : 'estável';

  return (
    <div className="decision-dashboard">
      <MethodologyBanner rows={dashboard.rows} compact />

      <section className="panel projecao-explicacao">
        <h2>De onde vêm as projeções?</h2>
        <p>{PROJECAO_METODO_RESUMO}</p>
        {previsaoAno.meta && (
          <ul className="projecao-meta-list">
            <li>
              <strong>{previsaoAno.meta.mesesValidosUsados}</strong> meses válidos
              entraram no cálculo (último histórico: {previsaoAno.meta.ultimoMesHistorico}).
            </li>
            <li>
              Média desses meses: <strong>{num(previsaoAno.meta.mediaValida)}</strong> cestas/mês.
            </li>
            <li>
              Tendência da reta: <strong>{inclinacao >= 0 ? '+' : ''}{num(inclinacao)}</strong>{' '}
              cestas por mês adicional → ritmo <strong>{tendenciaLabel}</strong>.
            </li>
            <li>
              Linha verde tracejada no gráfico = contrato de{' '}
              <strong>{num(contratoMensal)}</strong> cestas/mês (
              {num(contratoMensal * 12)}/ano).
            </li>
            <li>
              Previsão exibida até <strong>Dez/{previsaoAno.meta.anoAlvo}</strong> — não
              confundir com a divisão por equipamento (aba Distribuir mês).
            </li>
          </ul>
        )}
      </section>

      <section className="panel chart-panel chart-hero">
        <h2>Consumo observado e previsão até o fim do ano</h2>
        <p className="hint">
          Barras: total mensal importado (vermelho/amarelo = ruptura/parcial, fora do modelo).
          Linha roxa: previsão linear. Linha verde: contrato {num(contratoMensal)}/mês.
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={consumoEPrevisao}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={70} />
            <YAxis />
            <Tooltip />
            <Legend />
            <ReferenceLine
              y={contratoMensal}
              stroke="#0d9488"
              strokeDasharray="6 4"
              label={{ value: `Contrato ${contratoMensal}`, fontSize: 10 }}
            />
            {ins.demandaReferenciaPreRuptura != null && (
              <ReferenceLine
                y={ins.demandaReferenciaPreRuptura}
                stroke="#64748b"
                strokeDasharray="4 4"
              />
            )}
            <Bar dataKey="observado" name="Observado" fill="#2563eb" radius={[3, 3, 0, 0]} />
            <Line
              type="monotone"
              dataKey="previsao"
              name="Previsão (modelo)"
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
          <h2>Tendência — só meses válidos</h2>
          <p className="hint">
            Série usada na regressão (sem 2022-Q1, 2023, Abr/Mai 2026). Linha amarela = média móvel
            3 meses.
          </p>
          <ResponsiveContainer width="100%" height={280}>
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
          <h2>Contrato {num(contratoMensal)}/mês vs ritmo de consumo</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={comparativoContrato} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis type="category" dataKey="nome" width={115} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="valor" name="Cestas" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="hint chart-footnote">
            Utilização média vs contrato:{' '}
            <strong>{ins.utilizacaoContratoPct.toFixed(0)}%</strong>
            {ins.projecao1VsContrato != null && (
              <>
                {' '}
                · 1ª previsão futura vs contrato:{' '}
                <strong>
                  {ins.projecao1VsContrato >= 0 ? '+' : ''}
                  {num(ins.projecao1VsContrato)}
                </strong>{' '}
                cestas
              </>
            )}
          </p>
        </section>
      </div>

      <section className="panel chart-panel">
        <h2>Contexto operacional no histórico</h2>
        <p className="hint">
          Meses excluídos do modelo continuam visíveis para não confundir ruptura com queda de
          demanda.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartSerie}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" height={60} />
            <YAxis />
            <Tooltip />
            <Legend />
            <ReferenceLine y={contratoMensal} stroke="#0d9488" strokeDasharray="4 4" />
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
  );
}
