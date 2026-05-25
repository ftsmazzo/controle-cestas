import { serviceUnits } from '@shared/hierarchy';
import EquipamentosPanel from '../../components/EquipamentosPanel';
import { useData } from '../../context/DataContext';

export default function AdminEquipmentsPage() {
  const { payload, reload, setPayload } = useData();

  const servicos = payload ? serviceUnits(payload.services) : [];

  return (
    <>
      {servicos.length > 0 && (
        <section className="panel">
          <h3>Serviços filhos (granularidade futura)</h3>
          <p className="hint">
            {servicos.length} unidade(s) nível serviço detectada(s). Quando a planilha dos 12
            CRAS estiver disponível, importe com <code>level: servico</code> e{' '}
            <code>parentId</code> do equipamento.
          </p>
        </section>
      )}
    <EquipamentosPanel
      section="equipamentos"
      data={payload}
      onDataChange={(d) => {
        setPayload(d);
        if (d) void reload();
      }}
      onReload={() => void reload()}
    />
    </>
  );
}
