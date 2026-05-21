import { useCallback, useEffect, useState } from 'react';
import type { ServicesPayload } from '@shared/serviceTypes';
import { fetchServices, saveServices } from '../lib/servicesApi';
import EmergencialPanel from './EmergencialPanel';
import EquipamentosPanel from './EquipamentosPanel';
import ProcessOverview from './ProcessOverview';
import RegularPanel from './RegularPanel';
import './ProcessPanels.css';

type SubTab = 'visao' | 'emergencial' | 'regular' | 'equipamentos';

interface Props {
  onDashboardSynced?: () => void;
}

export default function ProcessHub({ onDashboardSynced }: Props) {
  const [data, setData] = useState<ServicesPayload | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('visao');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchServices());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onUpdate = async (next: ServicesPayload) => {
    const saved = await saveServices(next);
    setData(saved);
  };

  return (
    <div>
      <nav className="process-subtabs">
        {(
          [
            ['visao', 'Panorama'],
            ['emergencial', 'Emergencial (4 meses)'],
            ['regular', 'Regular (12 meses)'],
            ['equipamentos', 'Equipamentos'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={subTab === id ? 'process-subtab active' : 'process-subtab'}
            onClick={() => setSubTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}

      {subTab === 'visao' && <ProcessOverview data={data} />}

      {subTab === 'equipamentos' && (
        <EquipamentosPanel
          data={data}
          onDataChange={setData}
          onReload={load}
          onDashboardSynced={onDashboardSynced}
        />
      )}

      {data?.history.length && subTab === 'emergencial' && (
        <EmergencialPanel data={data} onUpdate={(n) => void onUpdate(n)} />
      )}

      {data?.history.length && subTab === 'regular' && (
        <RegularPanel data={data} onUpdate={(n) => void onUpdate(n)} />
      )}

      {subTab === 'emergencial' && !data?.history.length && (
        <section className="panel empty">
          <p>Importe equipamentos antes de configurar o processo emergencial.</p>
        </section>
      )}

      {subTab === 'regular' && !data?.history.length && (
        <section className="panel empty">
          <p>Importe equipamentos antes de configurar o processo regular.</p>
        </section>
      )}
    </div>
  );
}
