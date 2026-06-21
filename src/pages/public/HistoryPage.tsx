import { useMemo } from 'react';
import { buildVisaoConsumoPublico } from '@shared/publicDashboardAnalytics';
import { useData } from '../../context/DataContext';
import PublicConsumoHistorico from '../../components/PublicConsumoHistorico';
import PublicConsumoSemanalChart from '../../components/PublicConsumoSemanalChart';

export default function HistoryPage() {
  const { loading, payload } = useData();

  const visao = useMemo(
    () => (payload ? buildVisaoConsumoPublico(payload) : null),
    [payload],
  );

  if (loading) return null;

  if (!payload?.emergencial?.monitoramento.entradasSemanais.length || !visao) {
    return (
      <section className="panel empty">
        <h3>Consumo ainda não disponível</h3>
        <p className="hint">
          Importe os PDFs semanais em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> e clique em{' '}
          <strong>Salvar</strong> para ver o consumo semana a semana.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="public-context-banner panel">
        <p>
          <strong>Histórico de consumo</strong> desde 20/05/2026 — semanas
          qua–ter, agrupado como na home (CRAS, CREAS, PSE e fixos). A barra
          do ciclo mostra quanto ainda resta da cota do período de 4 semanas.
        </p>
      </section>

      <PublicConsumoHistorico visao={visao} />

      <PublicConsumoSemanalChart payload={payload} />
    </>
  );
}
