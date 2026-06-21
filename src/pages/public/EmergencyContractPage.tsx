import { useMemo } from 'react';
import { buildVisaoAnaliseCiclos } from '@shared/publicDashboardAnalytics';
import { useData } from '../../context/DataContext';
import PublicAnaliseCiclos from '../../components/PublicAnaliseCiclos';
import PublicSaldoProcesso from '../../components/PublicSaldoProcesso';

export default function EmergencyContractPage() {
  const { loading, payload } = useData();

  const visao = useMemo(
    () => (payload ? buildVisaoAnaliseCiclos(payload) : null),
    [payload],
  );

  if (loading) return null;

  if (!payload?.emergencial?.monitoramento.entradasSemanais.length) {
    return (
      <section className="panel empty">
        <h3>Processo emergencial</h3>
        <p className="hint">
          Importe os lançamentos semanais em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> para acompanhar o
          saldo de 5.000 cestas.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="public-context-banner panel">
        <p>
          <strong>Processo emergencial</strong> — empenho total de{' '}
          <strong>5.000 cestas</strong> distribuídas em 16 ciclos de 4
          semanas. Acompanhe aqui o saldo global e o andamento de cada período.
        </p>
      </section>

      <PublicSaldoProcesso payload={payload} />

      {visao && <PublicAnaliseCiclos visao={visao} variant="timeline" />}
    </>
  );
}
