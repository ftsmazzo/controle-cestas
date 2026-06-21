import { Fragment, useMemo } from 'react';
import { agruparCotasPublicas } from '@shared/publicDashboardAnalytics';
import type { CotasSemanaEquipamento } from '@shared/visaoPublicaOperacional';
import PublicProgressBar from './ui/PublicProgressBar';
import './PublicCotasSemanaTable.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function numPct(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
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
              <th className="col-num">Usado</th>
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
                      <td className="col-num">{num(c.enviadoCiclo)}</td>
                    </tr>
                  );
                })}
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
                  <td className="col-num" colSpan={2} />
                </tr>
              </Fragment>
            ))}
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
              <td className="col-num" colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
