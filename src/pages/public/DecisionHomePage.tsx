import { useMemo } from 'react';
import {
  CalendarRange,
  Package,
  Target,
  TrendingDown,
} from 'lucide-react';
import { buildVisaoPublicaOperacional } from '@shared/visaoPublicaOperacional';
import { useData } from '../../context/DataContext';
import PublicCotasSemanaTable from '../../components/PublicCotasSemanaTable';
import PublicConsumoSemanalChart from '../../components/PublicConsumoSemanalChart';
import PublicTopExcessoCicloCard from '../../components/PublicTopExcessoCicloCard';
import PublicProgressBar, { toneFromPctRestante } from '../../components/ui/PublicProgressBar';

function num(n: number | null | undefined, dec = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

export default function DecisionHomePage() {
  const { loading, payload } = useData();

  const visao = useMemo(
    () => (payload ? buildVisaoPublicaOperacional(payload) : null),
    [payload],
  );

  if (loading) return null;

  if (!payload || !visao) {
    return (
      <section className="panel empty">
        <h3>Monitoramento ainda não publicado</h3>
        <p className="hint">
          Importe o PDF semanal em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> e clique em{' '}
          <strong>Salvar</strong>. Na quarta, após fechar a semana (terça), os
          equipamentos verão aqui o consumo e as cotas para pedir.
        </p>
      </section>
    );
  }

  const pill = visao.semaforoPeriodo;
  const pctRestantePeriodo = Math.max(0, 100 - visao.pctPeriodo);
  const pctRestanteProcesso = Math.max(0, 100 - visao.pctProcesso);

  return (
    <>
      <section className="public-context-banner panel">
        <p>
          <strong>Uma régua de tempo:</strong> semanas qua–ter · período de 4
          semanas = <strong>1.150 cestas</strong> · processo total ={' '}
          <strong>5.000 cestas</strong>. Números abaixo são só da operação
          atual (desde 20/05/2026).
        </p>
      </section>

      <section className={`home-kpi-strip home-kpi-strip--${pill}`}>
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <Target size={20} />
          </span>
          <span className="home-kpi-label">Período atual (4 semanas)</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(visao.enviadoPeriodo)}</span>
            <span className="home-kpi-unit">/ {num(visao.tetoPeriodo)}</span>
          </p>
          <PublicProgressBar
            pct={pctRestantePeriodo}
            tone={toneFromPctRestante(pctRestantePeriodo)}
            label={`Saldo do período: ${num(visao.restantePeriodo)} cestas`}
          />
          <span className="home-kpi-hint home-kpi-hint--bar">
            Restam {num(visao.restantePeriodo)} cestas · {visao.cicloLabel}
          </span>
          <span className={`home-kpi-pill home-kpi-pill--${pill}`}>
            {pill === 'verde' ? 'VERDE' : pill === 'amarelo' ? 'AMARELO' : 'VERMELHO'}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Package size={20} />
          </span>
          <span className="home-kpi-label">Saldo do processo</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(visao.saldoProcesso)}</span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          <PublicProgressBar
            pct={pctRestanteProcesso}
            tone={toneFromPctRestante(pctRestanteProcesso)}
            label={`Saldo do processo: ${num(visao.saldoProcesso)} cestas`}
          />
          <span className="home-kpi-hint home-kpi-hint--bar">
            de {num(visao.totalProcesso)} · usado {num(visao.consumidoProcesso)}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <span className="home-kpi-label">Semana que fechou (terça)</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(visao.enviadoSemanaFechada)}
            </span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          <span className="home-kpi-hint">
            {visao.semanaFechadaPeriodo} · {visao.semanaFechadaLabel}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <TrendingDown size={20} />
          </span>
          <span className="home-kpi-label">Semana de pedidos (quarta)</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(visao.totalCotaSemanaPedidos)}
            </span>
            <span className="home-kpi-unit">cestas previstas</span>
          </p>
          <span className="home-kpi-hint">
            Flexível {num(visao.totalCotaFlexSemana)} + fixos ·{' '}
            {visao.semanaPedidosPeriodo}
          </span>
        </article>
      </section>

      {visao.ciclo1Excecao && (
        <section className="panel public-ciclo1-note">
          <h3>Período 1 — ajuste de retomada</h3>
          <p className="hint">
            Este período usou teto de <strong>1.350</strong> (+200 de margem).
            Gordura usada: {num(visao.gorduraUsada)} · ainda disponível no
            processo: {num(visao.gorduraRestante)}. Períodos seguintes: teto{' '}
            <strong>1.150</strong>.
          </p>
        </section>
      )}

      <PublicCotasSemanaTable
        cotas={visao.cotasSemana}
        semanaPeriodo={visao.semanaPedidosPeriodo}
        totalCota={visao.totalCotaSemanaPedidos}
        totalFlex={visao.totalCotaFlexSemana}
      />

      <PublicConsumoSemanalChart payload={payload} />

      <PublicTopExcessoCicloCard payload={payload} />

      <section className="panel public-legenda">
        <h3>Como ler estes números</h3>
        <ul className="public-legenda-list">
          <li>
            <strong>Barra do período:</strong> começa em 100% e vai caindo
            conforme o consumo das 4 semanas. Verde = folga; vermelho = perto do
            limite.
          </li>
          <li>
            <strong>Saldo do ciclo:</strong> barra em 100% no início do período;
            cai conforme o equipamento usa a cota das 4 semanas.
          </li>
          <li>
            <strong>Cotas por grupo:</strong> CRAS, CREAS, PSE e fixos mensais
            — subtotais somam o total da semana de pedidos.
          </li>
          <li>
            <strong>Gráfico semanal:</strong> barras empilhadas por grupo; linha
            = total. Chips abaixo mostram variação vs semana anterior.
          </li>
        </ul>
      </section>
    </>
  );
}
