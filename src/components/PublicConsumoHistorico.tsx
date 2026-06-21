import { TrendingDown, TrendingUp, Minus, CalendarRange, Layers, Package } from 'lucide-react';
import type { VisaoConsumoPublico } from '@shared/publicDashboardAnalytics';
import PublicProgressBar, { toneFromPctRestante } from './ui/PublicProgressBar';
import './PublicConsumoHistorico.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function TendenciaIcon({ t }: { t: VisaoConsumoPublico['tendenciaUltima'] }) {
  if (t === 'up') return <TrendingUp size={14} className="pch-trend pch-trend--up" />;
  if (t === 'down') return <TrendingDown size={14} className="pch-trend pch-trend--down" />;
  return <Minus size={14} className="pch-trend pch-trend--flat" />;
}

interface Props {
  visao: VisaoConsumoPublico;
}

export default function PublicConsumoHistorico({ visao }: Props) {
  const pill =
    visao.pctRestanteCicloAtual <= 10
      ? 'vermelho'
      : visao.pctRestanteCicloAtual <= 25
        ? 'amarelo'
        : 'verde';

  return (
    <div className="public-consumo-historico">
      <section className={`home-kpi-strip home-kpi-strip--${pill}`}>
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <Layers size={20} />
          </span>
          <span className="home-kpi-label">Ciclo atual</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(visao.usadoCicloAtual)}</span>
            <span className="home-kpi-unit">/ {num(visao.tetoCicloAtual)}</span>
          </p>
          <PublicProgressBar
            pct={visao.pctRestanteCicloAtual}
            tone={toneFromPctRestante(visao.pctRestanteCicloAtual)}
            label="Saldo do ciclo"
          />
          <span className="home-kpi-hint home-kpi-hint--bar">
            Semana {visao.semanaNoCiclo} de 4 · {visao.cicloLabel}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Package size={20} />
          </span>
          <span className="home-kpi-label">Total no controle</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(visao.totalAcumuladoControle)}</span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          <span className="home-kpi-hint">
            {visao.totalSemanasRegistradas} semanas · {visao.periodoLabel}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <span className="home-kpi-label">Última semana</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(visao.ultimaSemanaTotal)}</span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          {visao.deltaUltimaSemana != null && (
            <span
              className={`pch-delta pch-delta--${visao.tendenciaUltima}`}
            >
              <TendenciaIcon t={visao.tendenciaUltima} />
              {visao.deltaUltimaSemana >= 0 ? '+' : ''}
              {num(visao.deltaUltimaSemana)} vs anterior
            </span>
          )}
          <span className="home-kpi-hint">
            {visao.ultimaSemanaLabel} · {visao.ultimaSemanaPeriodo}
          </span>
        </article>
      </section>

      {visao.grupos.map((grupo) => (
        <section
          key={grupo.id}
          className={`panel public-consumo-grupo public-consumo-grupo--${grupo.id}`}
        >
          <header className="public-consumo-grupo-head">
            <div>
              <span className={`public-cotas-grupo-tag public-cotas-grupo-tag--${grupo.id}`}>
                {grupo.titulo}
              </span>
              <p className="public-consumo-grupo-meta">
                Ciclo: <strong>{num(grupo.subtotalUsadoCiclo)}</strong> de{' '}
                <strong>{num(grupo.subtotalCotaCiclo)}</strong> cestas
              </p>
            </div>
            <PublicProgressBar
              pct={grupo.subtotalPctRestante}
              tone={toneFromPctRestante(grupo.subtotalPctRestante)}
              showPct
            />
          </header>

          <div className="public-consumo-equip-grid">
            {grupo.equipamentos.map((eq) => (
              <article key={eq.servicoId} className="public-consumo-equip-card">
                <div className="public-consumo-equip-top">
                  <h3>
                    {eq.servicoNome}
                    {eq.cotaMensalUnica && (
                      <span className="public-cotas-tag-fixo">Fixo</span>
                    )}
                  </h3>
                  <span className="public-consumo-acum">
                    {num(eq.acumuladoControle)} total
                  </span>
                </div>

                <div className="public-consumo-ciclo-bar">
                  <div className="public-consumo-ciclo-labels">
                    <span>No ciclo</span>
                    <strong>
                      {num(eq.usadoCiclo)} / {num(eq.cotaCiclo)}
                    </strong>
                  </div>
                  <PublicProgressBar
                    pct={eq.pctRestanteCiclo}
                    tone={toneFromPctRestante(eq.pctRestanteCiclo)}
                    size="sm"
                    showPct
                  />
                </div>

                <div className="public-consumo-semanas">
                  {eq.semanas.map((s, i) => (
                    <span
                      key={`${eq.servicoId}-${i}`}
                      className={[
                        'public-consumo-semana-pill',
                        s.quantidade <= 0
                          ? 'public-consumo-semana-pill--zero'
                          : s.acimaCota
                            ? 'public-consumo-semana-pill--over'
                            : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      title={s.periodo}
                    >
                      <span className="public-consumo-pill-label">{s.label}</span>
                      <strong>
                        {s.quantidade > 0 ? num(s.quantidade) : '—'}
                      </strong>
                    </span>
                  ))}
                </div>

                {eq.semanasAcimaCota > 0 && (
                  <p className="public-consumo-alerta">
                    {eq.semanasAcimaCota} semana
                    {eq.semanasAcimaCota > 1 ? 's' : ''} acima da cota semanal
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      <section className="panel public-consumo-legenda">
        <h3>Como ler</h3>
        <ul>
          <li>
            <strong>Barra do ciclo:</strong> começa em 100% no início do período
            e cai conforme o equipamento consome a cota das 4 semanas.
          </li>
          <li>
            <strong>Pílulas semanais:</strong> cada chip é uma semana qua–ter;
            vermelho = acima da cota daquela semana.
          </li>
          <li>
            <strong>Total no controle:</strong> soma desde 20/05/2026 (ponto
            zero da operação).
          </li>
        </ul>
      </section>
    </div>
  );
}
