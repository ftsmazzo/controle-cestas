import { useData } from '../../context/DataContext';
import DistribuicaoMesPanel from '../../components/DistribuicaoMesPanel';

export default function DistributeMonthPage() {
  const { loading, payload } = useData();

  if (loading) return null;

  if (!payload?.history.length || !payload.services.length) {
    return (
      <section className="panel empty">
        <h3>Distribuir o mês</h3>
        <p className="hint">
          Informe o total de cestas do mês e veja a divisão proporcional por equipamento
          (média dos últimos meses válidos). Requer histórico importado em /admin.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Distribuir o mês</h2>
      <p className="hint">
        Simulação local — não altera a base. Use para planejar a entrega antes de
        registrar o fechamento no admin.
      </p>
      <DistribuicaoMesPanel data={payload} />
    </section>
  );
}
