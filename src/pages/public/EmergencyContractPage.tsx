import { useData } from '../../context/DataContext';
import EmergencialMonitorPanel from '../../components/EmergencialMonitorPanel';

export default function EmergencyContractPage() {
  const { loading, payload, dashboard } = useData();

  if (loading) return null;

  if (!payload?.history.length) {
    return (
      <section className="panel empty">
        <h3>Monitor emergencial</h3>
        <p>Sem histórico. Importe dados em /admin e configure metas emergenciais.</p>
      </section>
    );
  }

  return (
    <EmergencialMonitorPanel
      data={payload}
      readOnly
      decisionDashboard={dashboard}
      onUpdate={() => {}}
    />
  );
}
