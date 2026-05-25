import { useData } from '../../context/DataContext';
import EmergencialPanel from '../../components/EmergencialPanel';

export default function EmergencyContractPage() {
  const { loading, payload, dashboard } = useData();

  if (loading) return null;

  if (!payload?.history.length) {
    return (
      <section className="panel empty">
        <h3>Contrato emergencial</h3>
        <p>Sem histórico. Configure metas após importar dados em /admin.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Contrato emergencial</h2>
      <p className="hint">
        Monitoramento do processo de curto prazo (ex.: 1.200 cestas/mês × 4 meses).
        Distribuição por equipamento com base no histórico — modo consulta (não grava).
      </p>
      <EmergencialPanel
        data={payload}
        readOnly
        onUpdate={() => {}}
        decisionDashboard={dashboard}
      />
    </section>
  );
}
