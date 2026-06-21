import type { ResumoCicloPublico, VisaoAnaliseCiclos } from '@shared/publicDashboardAnalytics';
import PublicProgressBar, { toneFromPctRestante } from './ui/PublicProgressBar';
import './PublicAnaliseCiclos.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  visao: VisaoAnaliseCiclos;
  /** timeline = só cards; full = KPIs + nota ciclo 1 + cards */
  variant?: 'full' | 'timeline';
}

function CicloCard({ c }: { c: ResumoCicloPublico }) {
  return (
    <article
      className={`analise-ciclo-card analise-ciclo-card--${c.status}${c.estourouTeto ? ' analise-ciclo-card--estouro' : ''}`}
    >
      <header className="analise-ciclo-head">
        <span className="analise-ciclo-num">{c.label}</span>
        <span className={`analise-ciclo-status analise-ciclo-status--${c.status}`}>
          {c.status === 'concluido'
            ? 'Concluído'
            : c.status === 'em_curso'
              ? 'Em curso'
              : 'Futuro'}
        </span>
      </header>
      <p className="analise-ciclo-periodo">{c.periodo}</p>
      <p className="analise-ciclo-valores">
        <strong>{num(c.enviado)}</strong>
        <span> / {num(c.teto)} cestas</span>
      </p>
      <PublicProgressBar
        pct={c.pctRestante}
        tone={toneFromPctRestante(c.pctRestante)}
        size="sm"
        showPct
      />
      {c.gorduraUsada > 0 && (
        <p className="analise-ciclo-gordura">
          Gordura: +{num(c.gorduraUsada)} acima de 1.150
        </p>
      )}
      {c.semanasComDados > 0 && (
        <p className="analise-ciclo-meta">
          {c.semanasComDados} semana{c.semanasComDados > 1 ? 's' : ''} com envio
        </p>
      )}
    </article>
  );
}

export default function PublicAnaliseCiclos({
  visao,
  variant = 'full',
}: Props) {
  const ciclo1 = visao.ciclos.find((c) => c.ciclo === 1);

  return (
    <div className="public-analise-ciclos">
      {variant === 'full' && (
        <section className="home-kpi-strip home-kpi-strip--verde">
          <article className="home-kpi-tile">
            <span className="home-kpi-label">Ciclo atual</span>
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">{visao.cicloAtual}</span>
              <span className="home-kpi-unit">de {visao.ciclosTotal}</span>
            </p>
            <span className="home-kpi-hint">
              {visao.ciclosConcluidos} ciclo
              {visao.ciclosConcluidos !== 1 ? 's' : ''} concluído
              {visao.ciclosConcluidos !== 1 ? 's' : ''}
            </span>
          </article>
          <article className="home-kpi-tile">
            <span className="home-kpi-label">Média por ciclo</span>
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">
                {num(visao.mediaPorCicloConcluido)}
              </span>
              <span className="home-kpi-unit">cestas</span>
            </p>
            <span className="home-kpi-hint">ciclos já encerrados</span>
          </article>
          <article className="home-kpi-tile home-kpi-tile--primary">
            <span className="home-kpi-label">Saldo do processo</span>
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">{num(visao.saldoProcesso)}</span>
              <span className="home-kpi-unit">/ {num(visao.totalProcesso)}</span>
            </p>
            <PublicProgressBar
              pct={visao.pctRestanteProcesso}
              tone={toneFromPctRestante(visao.pctRestanteProcesso)}
            />
          </article>
        </section>
      )}

      {variant === 'full' && ciclo1 && ciclo1.status === 'concluido' && (
        <section className="panel public-ciclo1-note">
          <h3>Ciclo 1 — retomada controlada</h3>
          <p className="hint">
            Primeiro período usou teto de <strong>1.350</strong> (+200 de margem).
            As duas primeiras semanas tiveram consumo acima do plano; foi feito
            ajuste com corte gradual (Jun S3 leve, Jun S4 forte) para retomar o
            ritmo de <strong>264/semana</strong> a partir do ciclo 2.
            {ciclo1.gorduraUsada > 0 && (
              <>
                {' '}
                Gordura consumida neste ciclo:{' '}
                <strong>{num(ciclo1.gorduraUsada)}</strong> cestas.
              </>
            )}
          </p>
        </section>
      )}

      <section className="panel analise-timeline-panel">
        <h2>
          {variant === 'timeline' ? 'Ciclos do processo' : 'Linha do tempo por ciclo'}
        </h2>
        <p className="hint analise-timeline-sub">
          Cada card = 4 semanas qua–ter · teto 1.150 (ciclo 1: até 1.350)
        </p>
        <div className="analise-ciclo-grid">
          {visao.ciclos.map((c) => (
            <CicloCard key={c.ciclo} c={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
