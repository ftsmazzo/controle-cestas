import { useMemo } from 'react';
import { resolveJanelaAnaliseMeses } from '@shared/methodologyCalendar';
import { forecastNextMonth } from '@shared/forecastPlan';
import {
  excludedMonthKeysForPayload,
  validMonthKeysForPayload,
} from '@shared/payloadAnalysis';
import { useData } from '../../context/DataContext';
import DistribuicaoMesPanel from '../../components/DistribuicaoMesPanel';

export default function DistributeMonthPage() {
  const { loading, payload, dashboard } = useData();

  const janela = useMemo(
    () => resolveJanelaAnaliseMeses(payload?.settings?.methodology),
    [payload],
  );

  const validMonthKeys = useMemo(
    () => (payload ? validMonthKeysForPayload(payload) : []),
    [payload],
  );

  const excludedMonthKeys = useMemo(
    () => (payload ? excludedMonthKeysForPayload(payload) : []),
    [payload],
  );

  const previsaoProximoMes = useMemo(() => {
    if (!dashboard) return null;
    return forecastNextMonth(dashboard.rows, janela).valor;
  }, [dashboard, janela]);

  if (loading) return null;

  if (!payload?.history.length || !payload.services.length) {
    return (
      <section className="panel empty">
        <h3>Distribuir o mês</h3>
        <p className="hint">
          Importe a planilha por equipamento em{' '}
          <a href="/admin/importar">/admin → Importar</a>. O total do mês deve ser a soma dos
          equipamentos.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Distribuir o mês</h2>
      <p className="hint">
        Simulação local — não grava na base. Usa a mesma janela da Visão geral (
        {janela ? `últimos ${janela} meses válidos` : 'todos os válidos'}).
      </p>
      <DistribuicaoMesPanel
        data={payload}
        validMonthKeys={validMonthKeys}
        excludedMonthKeys={excludedMonthKeys}
        janelaPadrao={janela}
        previsaoProximoMes={previsaoProximoMes}
      />
    </section>
  );
}
