import { useMemo } from 'react';
import { buildTabelaCessaoEmergencial } from '@shared/tabelaCessaoEmergencial';
import type { ServicesPayload } from '@shared/serviceTypes';
import './CessaoEquipamentosTable.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
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

  return (
    <section className="panel cessao-table-panel">
      <header className="cessao-table-head">
        <div>
          <h2 className="cessao-table-title">Cessão mensal por equipamento</h2>
          <p className="cessao-table-sub">
            Média histórica ({tabela.periodoRef}) vs cota ao teto operacional de{' '}
            <strong>{num(tabela.tetoMensal)}/mês</strong>. Redução = quanto cortar
            em relação ao consumo sem racionamento.
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
            {tabela.rows.map((r) => (
              <tr
                key={r.servicoId}
                className={
                  r.reducaoPct > 15
                    ? 'cessao-row--alto'
                    : r.reducaoPct > 5
                      ? 'cessao-row--medio'
                      : ''
                }
              >
                <td className="cessao-cell-nome">{r.servicoNome}</td>
                <td>{num(r.mediaHistorica)}</td>
                <td>
                  <strong>{num(r.cotaMensal)}</strong>
                </td>
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
                <td className="cessao-cell-meses">{r.mesesHistorico}</td>
              </tr>
            ))}
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
