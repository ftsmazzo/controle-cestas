import { useCallback, useEffect, useState } from 'react';
import type { ServicesPayload } from '@shared/serviceTypes';
import { useAppMode } from '../context/AppModeContext';
import { fetchServices, saveServices } from '../lib/servicesApi';
import DistribuicaoMesPanel from './DistribuicaoMesPanel';
import EmergencialPanel from './EmergencialPanel';
import EquipamentosPanel from './EquipamentosPanel';
import ProcessOverview from './ProcessOverview';
import RegularPanel from './RegularPanel';
import './ProcessPanels.css';

type SubTab = 'distribuir' | 'visao' | 'emergencial' | 'regular' | 'equipamentos';

interface Props {
  onDashboardSynced?: () => void;
  /** Abre direto em Equipamentos ao vir da Visão geral */
  initialSubTab?: SubTab;
  onInitialSubTabApplied?: () => void;
}

export default function ProcessHub({
  onDashboardSynced,
  initialSubTab,
  onInitialSubTabApplied,
}: Props) {
  const { readOnly, adminPath } = useAppMode();
  const [data, setData] = useState<ServicesPayload | null>(null);
  const defaultSub: SubTab =
    readOnly && initialSubTab === 'equipamentos' ? 'distribuir' : (initialSubTab ?? 'distribuir');
  const [subTab, setSubTab] = useState<SubTab>(defaultSub);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialSubTab) {
      const next =
        readOnly && initialSubTab === 'equipamentos' ? 'distribuir' : initialSubTab;
      setSubTab(next);
      onInitialSubTabApplied?.();
    }
  }, [initialSubTab, onInitialSubTabApplied, readOnly]);

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
    if (readOnly) return;
    const saved = await saveServices(next);
    setData(saved);
  };

  const subtabs = (
    [
      ['distribuir', 'Distribuir mês'],
      ['equipamentos', 'Importar histórico'],
      ['visao', 'Panorama'],
      ['emergencial', 'Emergencial (4 meses)'],
      ['regular', 'Regular (12 meses)'],
    ] as const
  ).filter(([id]) => !readOnly || id !== 'equipamentos');

  return (
    <div>
      {readOnly && (
        <p className="hint process-readonly-hint">
          Modo consulta: distribuição e análises locais. Importação e alteração da base em{' '}
          <a href={adminPath}>{adminPath}</a>.
        </p>
      )}
      <nav className="process-subtabs">
        {subtabs.map(([id, label]) => (
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

      {subTab === 'distribuir' && !data?.history.length && (
        <section className="panel empty">
          <p>
            {readOnly ? (
              <>
                Histórico ainda não disponível neste painel público. A carga de dados é feita em{' '}
                <a href={adminPath}>{adminPath}</a>.
              </>
            ) : (
              <>
                Primeiro importe o histórico na aba <strong>Importar histórico</strong>. Depois
                volte aqui para informar o total do mês e ver a divisão por equipamento.
              </>
            )}
          </p>
        </section>
      )}

      {subTab === 'distribuir' && data?.history.length && data.services.length > 0 && (
        <DistribuicaoMesPanel data={data} />
      )}

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
        <EmergencialPanel
          data={data}
          readOnly={readOnly}
          onUpdate={(n) => void onUpdate(n)}
        />
      )}

      {data?.history.length && subTab === 'regular' && (
        <RegularPanel
          data={data}
          readOnly={readOnly}
          onUpdate={(n) => void onUpdate(n)}
        />
      )}

      {subTab === 'emergencial' && !data?.history.length && (
        <section className="panel empty">
          <p>
            {readOnly
              ? 'Dados do processo emergencial indisponíveis.'
              : 'Importe equipamentos antes de configurar o processo emergencial.'}
          </p>
        </section>
      )}

      {subTab === 'regular' && !data?.history.length && (
        <section className="panel empty">
          <p>
            {readOnly
              ? 'Dados do processo regular indisponíveis.'
              : 'Importe equipamentos antes de configurar o processo regular.'}
          </p>
        </section>
      )}
    </div>
  );
}
