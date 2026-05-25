import { NOTA_METODOLOGICA_RESUMO } from '@shared/methodology';
import { NOTA_COVID_2022, NOTA_RACIONAMENTO_2023 } from '@shared/methodologyCalendar';
import { APRESENTACAO_TEXTO } from '@shared/calculations';
import { useData } from '../../context/DataContext';

const TAG_LABELS: Record<string, string> = {
  covid_tail: 'Legado COVID (2022 Q1)',
  rationing_2023: 'Racionamento 2023',
  rupture: 'Ruptura estoque',
  partial: 'Parcial / racionamento',
  valid: 'Demanda representativa',
  custom: 'Personalizado',
};

export default function MethodologyPage() {
  const { loading, methodologyTable, payload } = useData();

  if (loading) return null;

  const janela = payload?.settings?.methodology.janelaMediaMeses ?? 8;

  return (
    <>
      <section className="panel">
        <h2>Metodologia e limites dos dados</h2>
        <p>{NOTA_METODOLOGICA_RESUMO}</p>
        <ul className="steps-list">
          <li>{NOTA_COVID_2022}</li>
          <li>{NOTA_RACIONAMENTO_2023}</li>
        </ul>
        <p className="hint">
          Janela para média na distribuição: <strong>últimos {janela} meses válidos</strong>{' '}
          (configurável em /admin → Metodologia).
        </p>
      </section>

      {methodologyTable.length > 0 && (
        <section className="panel">
          <h3>Meses com tratamento especial</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Classificação</th>
                  <th>No modelo</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {methodologyTable.map((m) => (
                  <tr key={m.mes}>
                    <td>{m.mes}</td>
                    <td>{TAG_LABELS[m.tag] ?? m.tag}</td>
                    <td>{m.excluirDoModelo ? 'Não' : 'Sim'}</td>
                    <td>{m.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel apresentacao">
        <h3>Texto para apresentação</h3>
        <p>{APRESENTACAO_TEXTO}</p>
      </section>

      <section className="panel">
        <h3>Fase futura — atendimentos SEMAS</h3>
        <p className="hint">
          Após estabilizar consumo e metodologia, será possível correlacionar volume de
          famílias/atendimentos com consumo de cestas por serviço.
        </p>
      </section>
    </>
  );
}
