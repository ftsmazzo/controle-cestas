import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import RegularPanel from '../../components/RegularPanel';
import type { ServicesPayload } from '@shared/serviceTypes';

export default function PriceRegistryPage() {
  const { loading, payload, snapshot } = useData();
  const [local, setLocal] = useState<ServicesPayload | null>(null);

  useEffect(() => {
    if (payload) setLocal(payload);
  }, [payload]);

  if (loading) return null;

  if (!payload?.history.length || !local) {
    return (
      <section className="panel empty">
        <h3>Registro de Preço (anual)</h3>
        <p>Sem histórico para revisão da quantidade mensal necessária.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Registro de Preço — contrato anual</h2>
      <p className="hint">
        Simulação local dos 12 meses do registro. Não altera a Visão geral nem o banco (modo
        consulta).
      </p>
      <RegularPanel
        data={local}
        readOnly
        onUpdate={setLocal}
        decisionSnapshot={snapshot}
      />
    </section>
  );
}
