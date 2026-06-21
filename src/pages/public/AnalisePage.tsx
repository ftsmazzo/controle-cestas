import { useMemo } from 'react';
import { buildVisaoAnaliseCiclos } from '@shared/publicDashboardAnalytics';
import { useData } from '../../context/DataContext';
import PublicAnaliseCiclos from '../../components/PublicAnaliseCiclos';
import PublicTopExcessoCicloCard from '../../components/PublicTopExcessoCicloCard';

export default function AnalisePage() {
  const { loading, payload } = useData();

  const visao = useMemo(
    () => (payload ? buildVisaoAnaliseCiclos(payload) : null),
    [payload],
  );

  if (loading) return null;

  if (!payload?.emergencial?.monitoramento.entradasSemanais.length || !visao) {
    return (
      <section className="panel empty">
        <h3>Análise ainda não disponível</h3>
        <p className="hint">
          Lance as semanas em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> para ver o
          desempenho por ciclo.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="public-context-banner panel">
        <p>
          <strong>Análise por ciclos</strong> — cada período de 4 semanas (1.150
          cestas) ao longo dos 16 ciclos do processo de 5.000. Compare
          consumo, gordura do ciclo 1 e equipamentos que estouraram cota.
        </p>
      </section>

      <PublicAnaliseCiclos visao={visao} />

      <PublicTopExcessoCicloCard payload={payload} />
    </>
  );
}
