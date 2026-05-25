import { useData } from '../../context/DataContext';
import RegularPanel from '../../components/RegularPanel';

export default function PriceRegistryPage() {
  const { loading, payload, setPayload } = useData();

  if (loading) return null;

  if (!payload?.history.length) {
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
        Substitui o emergencial: revisão da quantidade mensal real, utilização vs
        contrato e risco de ruptura em 12 meses. Modo consulta.
      </p>
      <RegularPanel data={payload} readOnly onUpdate={setPayload} />
    </section>
  );
}
