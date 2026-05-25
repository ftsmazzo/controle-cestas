import type { AssistancePayload } from '@shared/assistanceTypes';
import { useData } from '../../context/DataContext';

export default function AdminAssistancePage() {
  const { payload, loading } = useData();

  if (loading) return null;

  const assistance: AssistancePayload | undefined = payload?.assistance;
  const count = assistance?.records.length ?? 0;

  return (
    <section className="panel">
      <h2>Atendimentos SEMAS (fase 4)</h2>
      <p className="hint">
        Dimensão preparada para correlacionar famílias/atendimentos com consumo de cestas por
        serviço. Importação será habilitada quando os dados estiverem padronizados.
      </p>
      <p>
        Registros carregados: <strong>{count}</strong>
      </p>
      {assistance?.sourceFile && (
        <p className="meta">Fonte: {assistance.sourceFile}</p>
      )}
    </section>
  );
}
