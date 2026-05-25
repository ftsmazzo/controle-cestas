import { useData } from '../../context/DataContext';
import DecisionDashboard from '../../components/DecisionDashboard';
import MethodologyTimeline from '../../components/MethodologyTimeline';

function num(n: number | null, dec = 1): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

export default function DecisionHomePage() {
  const { loading, dashboard, snapshot, payload } = useData();

  if (loading) return null;

  if (!dashboard) {
    return (
      <section className="panel empty">
        <h3>Sem dados publicados</h3>
        <p className="hint">
          O histórico por equipamento ainda não foi importado na área administrativa.
          Após a carga, este painel exibirá risco de ruptura, autonomia e tendências.
        </p>
      </section>
    );
  }

  const riskClass =
    dashboard.kpis.riscoRuptura === 'Verde'
      ? 'risk-verde'
      : dashboard.kpis.riscoRuptura === 'Amarelo'
        ? 'risk-amarelo'
        : 'risk-vermelho';

  return (
    <>
      <section className={`kpi-card risk-strip ${riskClass}`}>
        <span className="kpi-label">Autonomia de estoque</span>
        <strong>{num(dashboard.kpis.autonomiaMeses)} meses</strong>
        <span className="risk-badge">{dashboard.kpis.riscoRuptura}</span>
        {snapshot.saldoEstoque != null && (
          <span className="hint" style={{ marginLeft: '1rem' }}>
            Saldo: {num(snapshot.saldoEstoque, 0)} cestas
          </span>
        )}
      </section>

      <MethodologyTimeline rows={dashboard.rows} />

      <DecisionDashboard
        dashboard={dashboard}
        contratoMensal={payload?.settings?.contratoMensal ?? 1200}
      />

      <section className="panel apresentacao">
        <h2>Objetivo deste painel</h2>
        <p>
          Apoiar a <strong>decisão sobre estoque e contrato</strong>: consumo médio com
          meses distorcidos (COVID/2022, racionamento/2023, ruptura Abr e parcial Mai/2026)
          excluídos do modelo, mas sempre visíveis no histórico.
        </p>
      </section>
    </>
  );
}
