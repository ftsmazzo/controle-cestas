import { useMemo } from 'react';
import { buildConsumoSemanalEmergencial } from '@shared/consumoSemanalEmergencial';
import { useData } from '../../context/DataContext';
import ConsumoSemanalTable from '../../components/ConsumoSemanalTable';

export default function HistoryPage() {
  const { loading, payload } = useData();

  const dados = useMemo(
    () => (payload ? buildConsumoSemanalEmergencial(payload) : null),
    [payload],
  );

  if (loading) return null;

  if (!payload?.emergencial?.monitoramento.entradasSemanais.length) {
    return (
      <section className="panel empty">
        <p>
          Importe os PDFs semanais em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> e clique em{' '}
          <strong>Salvar</strong> para ver o consumo semana a semana.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Consumo semanal por equipamento</h2>
      <p className="hint">
        Desde o ponto zero do controle ({dados?.periodoLabel ?? '—'}). Cada célula
        compara o enviado na semana com a <strong>cota semanal</strong> (cessão) e a{' '}
        <strong>média histórica</strong> rateada por semana. Destaque = estouro.
      </p>
      {dados && <ConsumoSemanalTable dados={dados} />}
    </section>
  );
}
