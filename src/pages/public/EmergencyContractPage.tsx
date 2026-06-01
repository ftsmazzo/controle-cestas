import { useState } from 'react';
import { useData } from '../../context/DataContext';
import EmergencialMonitorPanel from '../../components/EmergencialMonitorPanel';
import EmergencialPanel from '../../components/EmergencialPanel';

export default function EmergencyContractPage() {
  const { loading, payload, dashboard } = useData();
  const [showDistrib, setShowDistrib] = useState(false);

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
    <>
      <EmergencialMonitorPanel
        data={payload}
        readOnly
        onUpdate={() => {}}
      />

      <section className="panel">
        <button
          type="button"
          className="secondary"
          onClick={() => setShowDistrib((v) => !v)}
        >
          {showDistrib ? 'Ocultar' : 'Ver'} simulação de distribuição
        </button>
      </section>

      {showDistrib && (
        <EmergencialPanel
          data={payload}
          readOnly
          onUpdate={() => {}}
          decisionDashboard={dashboard}
        />
      )}
    </>
  );
}
