import { familiaUnits, consumptionUnits } from '@shared/hierarchy';
import { childrenOf } from '@shared/serviceFamilies';
import EquipamentosPanel from '../../components/EquipamentosPanel';
import { useData } from '../../context/DataContext';

export default function AdminEquipmentsPage() {
  const { payload, reload, setPayload } = useData();

  const familias = payload ? familiaUnits(payload.services) : [];
  const unidades = payload ? consumptionUnits(payload.services) : [];

  return (
    <>
      {payload && unidades.length > 0 && (
        <section className="panel">
          <h3>Granularidade — famílias e unidades</h3>
          <p className="hint">
            <strong>CRAS</strong> e <strong>CREAS</strong> são famílias; cada uma
            &quot;abre&quot; em unidades (12 CRAS, 5 CREAS). A distribuição e o
            monitoramento semanal usam só as <strong>unidades</strong>, não o total
            agregado da família.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Família</th>
                  <th>Unidades</th>
                </tr>
              </thead>
              <tbody>
                {familias.map((f) => {
                  const kids = childrenOf(payload.services, f.id);
                  return (
                    <tr key={f.id}>
                      <td>
                        <strong>{f.nome}</strong>
                      </td>
                      <td>
                        {kids.length
                          ? kids.map((u) => u.nome).join(', ')
                          : '— (importe planilha por unidade)'}
                      </td>
                    </tr>
                  );
                })}
                {familias.length === 0 && (
                  <tr>
                    <td colSpan={2}>
                      Nenhuma família explícita — {unidades.length} unidade(s) no
                      cadastro. Importe planilha com CRAS 1…12 ou use import PDF
                      Coderp.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <EquipamentosPanel
        section="equipamentos"
        data={payload}
        onDataChange={setPayload}
        onReload={() => void reload()}
      />
    </>
  );
}
