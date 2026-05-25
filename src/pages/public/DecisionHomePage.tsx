import { useData } from '../../context/DataContext';
import DecisionDashboard from '../../components/DecisionDashboard';

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
          Em <a href="/admin/importar">/admin → Importar</a> envie a planilha por equipamento.
          Use <strong>Limpar tudo</strong> antes se quiser recomeçar do zero.
        </p>
      </section>
    );
  }

  const janela =
    payload?.settings?.methodology.janelaAnaliseMeses ??
    payload?.settings?.methodology.janelaMediaMeses ??
    8;

  const riskClass =
    dashboard.kpis.riscoRuptura === 'Verde'
      ? 'risk-verde'
      : dashboard.kpis.riscoRuptura === 'Amarelo'
        ? 'risk-amarelo'
        : 'risk-vermelho';

  return (
    <>
      <section className={`kpi-card risk-strip ${riskClass}`}>
        <div className="risk-strip-grid">
          <div>
            <span className="kpi-label">Autonomia de estoque</span>
            <strong>{num(dashboard.kpis.autonomiaMeses)} meses</strong>
            <span className="risk-badge">{dashboard.kpis.riscoRuptura}</span>
          </div>
          <div>
            <span className="kpi-label">Contrato</span>
            <strong>{num(payload?.settings?.contratoMensal ?? 1200, 0)}/mês</strong>
          </div>
          <div>
            <span className="kpi-label">Janela de análise</span>
            <strong>{janela ? `Últimos ${janela} meses válidos` : 'Todos os válidos'}</strong>
          </div>
          {snapshot.saldoEstoque != null && (
            <div>
              <span className="kpi-label">Saldo</span>
              <strong>{num(snapshot.saldoEstoque, 0)}</strong>
            </div>
          )}
        </div>
      </section>

      <DecisionDashboard
        dashboard={dashboard}
        contratoMensal={payload?.settings?.contratoMensal ?? 1200}
        janelaAnaliseMeses={janela}
      />
    </>
  );
}
