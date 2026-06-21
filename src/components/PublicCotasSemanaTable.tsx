import type { CotasSemanaEquipamento } from '@shared/visaoPublicaOperacional';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface Props {
  cotas: CotasSemanaEquipamento[];
  semanaPeriodo: string;
  totalCota: number;
}

export default function PublicCotasSemanaTable({
  cotas,
  semanaPeriodo,
  totalCota,
}: Props) {
  if (!cotas.length) return null;

  return (
    <section className="panel public-cotas-panel">
      <header className="public-cotas-head">
        <h2>Cotas para pedidos nesta semana</h2>
        <p className="hint">
          Período de pedidos <strong>{semanaPeriodo}</strong> — flexível:{' '}
          <strong>{num(totalCota)}</strong> cestas/semana (plano 264 + fixos
          mensais pendentes). Use no sistema de requisição.
        </p>
      </header>
      <div className="table-wrap">
        <table className="data-table public-cotas-table">
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Cota da semana</th>
              <th>No período (4 sem.)</th>
              <th>Já usado no período</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {cotas.map((c) => (
              <tr key={c.servicoId}>
                <td>{c.servicoNome}</td>
                <td className="num-cell public-cotas-cota">
                  {num(c.cotaSemana)}
                </td>
                <td className="num-cell">{num(c.cotaMensalCiclo)}</td>
                <td className="num-cell">{num(c.enviadoCiclo)}</td>
                <td className="public-cotas-obs">
                  {c.tipo === 'fixo_mensal' ? 'Fixo período' : 'Rateio'}
                  {c.observacao ? ` · ${c.observacao}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
