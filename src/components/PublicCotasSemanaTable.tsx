import { Fragment, useMemo } from 'react';
import { agruparCotasPublicas } from '@shared/publicDashboardAnalytics';
import type { CotasSemanaEquipamento } from '@shared/visaoPublicaOperacional';
import PublicProgressBar, {
  toneFromPctRestante,
} from './ui/PublicProgressBar';
import './PublicCotasSemanaTable.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function numPct(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
}

function pctRestanteCiclo(usado: number, cota: number): number {
  if (cota <= 0) return 100;
  return Math.max(0, ((cota - usado) / cota) * 100);
}

interface Props {
  cotas: CotasSemanaEquipamento[];
  semanaPeriodo: string;
  totalCota: number;
  totalFlex: number;
}

export default function PublicCotasSemanaTable({
  cotas,
  semanaPeriodo,
  totalCota,
  totalFlex,
}: Props) {
  const agrupado = useMemo(() => agruparCotasPublicas(cotas), [cotas]);

  if (!cotas.length) return null;

  return (
    <section className="panel public-cotas-panel">
      <header className="public-cotas-head">
        <div>
          <h2>Cotas para pedidos nesta semana</h2>
          <p className="public-cotas-meta">
            <span className="public-cotas-badge">{semanaPeriodo}</span>
            <span>
              Total: <strong>{num(totalCota)}</strong> cestas
              {totalFlex > 0 && (
                <>
                  {' '}
                  · flexível <strong>{num(totalFlex)}</strong>
                </>
              )}
            </span>
          </p>
        </div>
      </header>

      <div className="public-cotas-grupos-resumo">
        {agrupado.grupos.map((g) => (
          <article key={g.id} className={`public-cotas-grupo-kpi public-cotas-grupo-kpi--${g.id}`}>
            <span className="public-cotas-grupo-kpi-label">{g.titulo}</span>
            <strong className="public-cotas-grupo-kpi-valor">{num(g.subtotalCotaSemana)}</strong>
            <PublicProgressBar
              pct={g.subtotalPct}
              tone="neutro"
              size="sm"
              showPct
            />
          </article>
        ))}
      </div>

      <div className="table-wrap public-cotas-table-wrap">
        <table className="public-cotas-table">
          <thead>
            <tr>
              <th>Equipamento</th>
              <th className="col-num">Cota semana</th>
              <th className="col-num">% do total</th>
              <th className="col-num">No período</th>
              <th className="col-num">Saldo ciclo</th>
            </tr>
          </thead>
          <tbody>
            {agrupado.grupos.map((grupo) => (
              <Fragment key={grupo.id}>
                <tr className="public-cotas-grupo-row">
                  <td colSpan={5}>
                    <span className={`public-cotas-grupo-tag public-cotas-grupo-tag--${grupo.id}`}>
                      {grupo.titulo}
                    </span>
                  </td>
                </tr>
                {grupo.itens.map((c) => {
                  const pct =
                    totalCota > 0 ? (c.cotaSemana / totalCota) * 100 : 0;
                  const pctSaldo = pctRestanteCiclo(c.enviadoCiclo, c.cotaMensalCiclo);
                  return (
                    <tr key={c.servicoId} className="public-cotas-data-row">
                      <td>
                        <span className="public-cotas-nome">{c.servicoNome}</span>
                        {c.tipo === 'fixo_mensal' && (
                          <span className="public-cotas-tag-fixo">Fixo</span>
                        )}
                      </td>
                      <td className="col-num public-cotas-cota">{num(c.cotaSemana)}</td>
                      <td className="col-num public-cotas-pct-cell">
                        <PublicProgressBar pct={pct} tone="neutro" size="sm" />
                      </td>
                      <td className="col-num">{num(c.cotaMensalCiclo)}</td>
                      <td className="col-num public-cotas-usado-cell">
                        <span className="public-cotas-usado-num">{num(c.enviadoCiclo)}</span>
                        <PublicProgressBar
                          pct={pctSaldo}
                          tone={toneFromPctRestante(pctSaldo)}
                          size="sm"
                          showPct
                        />
                      </td>
                    </tr>
                  );
                })}
                {(() => {
                  const subCota = grupo.itens.reduce((s, c) => s + c.cotaMensalCiclo, 0);
                  const subUsado = grupo.itens.reduce((s, c) => s + c.enviadoCiclo, 0);
                  const subSaldo = pctRestanteCiclo(subUsado, subCota);
                  return (
                <tr className="public-cotas-subtotal-row">
                  <td>
                    <strong>Subtotal {grupo.titulo}</strong>
                  </td>
                  <td className="col-num">
                    <strong>{num(grupo.subtotalCotaSemana)}</strong>
                  </td>
                  <td className="col-num">
                    <strong>{numPct(grupo.subtotalPct)}%</strong>
                  </td>
                  <td className="col-num">
                    <strong>{num(subCota)}</strong>
                  </td>
                  <td className="col-num public-cotas-usado-cell">
                    <strong>{num(subUsado)}</strong>
                    <PublicProgressBar
                      pct={subSaldo}
                      tone={toneFromPctRestante(subSaldo)}
                      size="sm"
                      showPct
                    />
                  </td>
                </tr>
                  );
                })()}
              </Fragment>
            ))}
            {(() => {
              const totCotaCiclo = cotas.reduce((s, c) => s + c.cotaMensalCiclo, 0);
              const totUsado = cotas.reduce((s, c) => s + c.enviadoCiclo, 0);
              const totSaldo = pctRestanteCiclo(totUsado, totCotaCiclo);
              return (
            <tr className="public-cotas-total-row">
              <td>
                <strong>Total geral</strong>
              </td>
              <td className="col-num">
                <strong>{num(totalCota)}</strong>
              </td>
              <td className="col-num">
                <strong>100%</strong>
              </td>
              <td className="col-num">
                <strong>{num(totCotaCiclo)}</strong>
              </td>
              <td className="col-num public-cotas-usado-cell">
                <strong>{num(totUsado)}</strong>
                <PublicProgressBar
                  pct={totSaldo}
                  tone={toneFromPctRestante(totSaldo)}
                  size="sm"
                  showPct
                />
              </td>
            </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </section>
  );
}
