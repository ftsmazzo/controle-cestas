import { Fragment, useMemo } from 'react';
import { buildTabelaCessaoEmergencial } from '@shared/tabelaCessaoEmergencial';
import type { CessaoEquipamentoRow } from '@shared/tabelaCessaoEmergencial';
import type { ServicesPayload } from '@shared/serviceTypes';
import './CessaoEquipamentosTable.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function reducaoCell(r: CessaoEquipamentoRow) {
  return (
    <td
      className={
        r.reducaoPct > 0
          ? 'cessao-reducao-pos'
          : r.reducaoPct < 0
            ? 'cessao-reducao-neg'
            : ''
      }
    >
      {r.mediaHistorica > 0 ? (
        <>
          {r.reducaoPct > 0 ? '−' : r.reducaoPct < 0 ? '+' : ''}
          {num(Math.abs(r.reducaoPct), 1)}%
        </>
      ) : (
        '—'
      )}
    </td>
  );
}

function rowClass(r: CessaoEquipamentoRow): string {
  if (r.reducaoPct > 15) return 'cessao-row--alto';
  if (r.reducaoPct > 5) return 'cessao-row--medio';
  return '';
}

function renderUnitRow(r: CessaoEquipamentoRow, indent = false) {
  return (
    <tr key={r.servicoId} className={rowClass(r)}>
      <td className={indent ? 'cessao-cell-nome cessao-cell-unidade' : 'cessao-cell-nome'}>
        {r.servicoNome}
      </td>
      <td>{num(r.mediaHistorica)}</td>
      <td>
        <strong>{num(r.cotaMensal)}</strong>
      </td>
      {reducaoCell(r)}
      <td className="cessao-cell-meses">{r.mesesHistorico}</td>
    </tr>
  );
}

interface Props {
  payload: ServicesPayload;
}

export default function CessaoEquipamentosTable({ payload }: Props) {
  const tabela = useMemo(
    () => buildTabelaCessaoEmergencial(payload),
    [payload],
  );

  if (!tabela.rows.length) {
    return (
      <section className="panel cessao-table-panel">
        <h2 className="cessao-table-title">Cessão mensal por equipamento</h2>
        <p className="hint">
          Importe o histórico de referência (Set/2025–Mar/2026) em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> para calcular cotas ao
          teto de {num(tabela.tetoMensal)}/mês.
        </p>
      </section>
    );
  }

  const familiasMulti =
    tabela.familias.length > 0
      ? tabela.familias
      : [{ familiaCodigo: 'OUTROS', familiaNome: 'Equipamentos', familiaId: 'outros', itens: tabela.rows }];

  return (
    <section className="panel cessao-table-panel">
      <header className="cessao-table-head">
        <div>
          <h2 className="cessao-table-title">Cessão mensal por equipamento</h2>
          <p className="cessao-table-sub">
            Média histórica ({tabela.periodoRef}) vs cota ao teto operacional de{' '}
            <strong>{num(tabela.tetoMensal)}/mês</strong>. Famílias CRAS/CREAS
            agrupadas como no Monitor.
          </p>
        </div>
        <div className="cessao-table-badges">
          <span className="cessao-badge">
            Soma médias: <strong>{num(tabela.somaMedias)}</strong>
          </span>
          <span className="cessao-badge cessao-badge--teto">
            Soma cotas: <strong>{num(tabela.somaCotas)}</strong>
          </span>
        </div>
      </header>

      <div className="table-wrap cessao-table-wrap">
        <table className="cessao-table">
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Média histórica</th>
              <th>Cota {num(tabela.tetoMensal)}/mês</th>
              <th>Redução</th>
              <th>Meses ref.</th>
            </tr>
          </thead>
          <tbody>
            {familiasMulti.map((fam) => {
              const mediaFam = fam.itens.reduce((s, r) => s + r.mediaHistorica, 0);
              const cotaFam = fam.itens.reduce((s, r) => s + r.cotaMensal, 0);
              const reducaoFam =
                mediaFam > 0 ? ((mediaFam - cotaFam) / mediaFam) * 100 : 0;
              const showChildren = fam.itens.length > 1;

              return (
                <Fragment key={fam.familiaId}>
                  <tr className="cessao-row-familia">
                    <td>
                      <strong>{fam.familiaNome}</strong>
                      <span className="cessao-familia-sub">
                        {fam.itens.length} unidade(s)
                        {cotaFam > 0 ? ` · cota ${num(cotaFam)}` : ''}
                      </span>
                    </td>
                    <td>
                      <strong>{num(mediaFam)}</strong>
                    </td>
                    <td>
                      <strong>{num(cotaFam)}</strong>
                    </td>
                    <td
                      className={
                        reducaoFam > 0
                          ? 'cessao-reducao-pos'
                          : reducaoFam < 0
                            ? 'cessao-reducao-neg'
                            : ''
                      }
                    >
                      {mediaFam > 0 ? (
                        <>
                          {reducaoFam > 0 ? '−' : reducaoFam < 0 ? '+' : ''}
                          {num(Math.abs(reducaoFam), 1)}%
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td />
                  </tr>
                  {showChildren
                    ? fam.itens.map((r) => renderUnitRow(r, true))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <strong>TOTAL</strong>
              </td>
              <td>
                <strong>{num(tabela.somaMedias)}</strong>
              </td>
              <td>
                <strong>{num(tabela.somaCotas)}</strong>
              </td>
              <td>
                {tabela.somaMedias > 0 && (
                  <strong>
                    −
                    {num(
                      ((tabela.somaMedias - tabela.somaCotas) / tabela.somaMedias) *
                        100,
                      1,
                    )}
                    %
                  </strong>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
