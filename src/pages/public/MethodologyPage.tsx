import {
  METODOLOGIA_CONTROLE_SEMANAL,
  METODOLOGIA_EMPENHO_TETOS,
  METODOLOGIA_EXCLUSOES,
  METODOLOGIA_MITIGACAO,
  METODOLOGIA_PONTO_ZERO,
  METODOLOGIA_PROCESSO_EMERGENCIAL,
  METODOLOGIA_REFERENCIA_CESSAO,
  NOTA_METODOLOGICA_RESUMO,
} from '@shared/methodology';
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
  const { loading, methodologyTable } = useData();

  if (loading) return null;

  return (
    <>
      <section className="panel">
        <h2>Metodologia — processo emergencial</h2>
        <p>{METODOLOGIA_PROCESSO_EMERGENCIAL}</p>
        <p className="hint">{NOTA_METODOLOGICA_RESUMO}</p>
      </section>

      <section className="panel">
        <h3>Empenho e tetos</h3>
        <p>{METODOLOGIA_EMPENHO_TETOS}</p>
      </section>

      <section className="panel">
        <h3>Ponto zero e controle semanal</h3>
        <p>{METODOLOGIA_PONTO_ZERO}</p>
        <p className="hint">{METODOLOGIA_CONTROLE_SEMANAL}</p>
      </section>

      <section className="panel">
        <h3>Cotas de referência (cessão)</h3>
        <p>{METODOLOGIA_REFERENCIA_CESSAO}</p>
      </section>

      <section className="panel">
        <h3>Cenário de mitigação</h3>
        <p>{METODOLOGIA_MITIGACAO}</p>
      </section>

      <section className="panel">
        <h3>Períodos excluídos do modelo</h3>
        <p>{METODOLOGIA_EXCLUSOES}</p>
        <ul className="steps-list">
          <li>{NOTA_COVID_2022}</li>
          <li>{NOTA_RACIONAMENTO_2023}</li>
        </ul>
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
    </>
  );
}
