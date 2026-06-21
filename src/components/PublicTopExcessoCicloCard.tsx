import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { buildTopExcessoUltimoCiclo } from '@shared/publicDashboardAnalytics';
import type { ServicesPayload } from '@shared/serviceTypes';
import './PublicTopExcessoCicloCard.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  payload: ServicesPayload;
}

export default function PublicTopExcessoCicloCard({ payload }: Props) {
  const top = useMemo(() => buildTopExcessoUltimoCiclo(payload, 3), [payload]);

  return (
    <section className="panel public-excesso-panel">
      <header className="public-excesso-head">
        <h2>
          <AlertTriangle size={20} aria-hidden />
          Maiores excessos no último ciclo
        </h2>
        <p className="hint public-excesso-sub">
          Top 3 equipamentos que pediram acima da cota prevista em{' '}
          <strong>{top.cicloLabel}</strong>.
        </p>
      </header>

      {!top.temDados ? (
        <p className="hint">Sem dados de consumo registrados ainda.</p>
      ) : !top.items.length ? (
        <p className="hint public-excesso-ok">
          Nenhum equipamento excedeu a cota prevista neste ciclo.
        </p>
      ) : (
        <div className="public-excesso-grid">
          {top.items.map((item, i) => (
            <article key={item.servicoId} className="public-excesso-card">
              <span className="public-excesso-rank">#{i + 1}</span>
              <h3>{item.servicoNome}</h3>
              <p className="public-excesso-pct">
                <strong>+{num(item.pctAcima, 1)}%</strong>
                <span> acima da cota</span>
              </p>
              <dl className="public-excesso-metrics">
                <div>
                  <dt>Cota prevista</dt>
                  <dd>{num(item.cotaPrevista)}</dd>
                </div>
                <div>
                  <dt>Enviado</dt>
                  <dd>{num(item.enviado)}</dd>
                </div>
                <div>
                  <dt>Excesso</dt>
                  <dd className="public-excesso-over">+{num(item.excesso)}</dd>
                </div>
              </dl>
              <div className="public-excesso-bar-wrap">
                <div
                  className="public-excesso-bar-cota"
                  style={{
                    width: `${Math.min(100, (item.cotaPrevista / item.enviado) * 100)}%`,
                  }}
                />
                <div
                  className="public-excesso-bar-over"
                  style={{
                    width: `${Math.min(100, (item.excesso / item.enviado) * 100)}%`,
                  }}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
