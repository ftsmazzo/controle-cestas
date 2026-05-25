import { resolveJanelaAnaliseMeses } from '@shared/methodologyCalendar';
import {
  CalendarRange,
  Package,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import DecisionDashboard from '../../components/DecisionDashboard';

function num(n: number | null, dec = 1): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function riskModifier(risco: string): string {
  if (risco === 'Verde') return 'verde';
  if (risco === 'Vermelho') return 'vermelho';
  return 'amarelo';
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

  const janela = resolveJanelaAnaliseMeses(payload?.settings?.methodology);
  const autonomia = dashboard.kpis.autonomiaMeses;
  const risco = dashboard.kpis.riscoRuptura;
  const riskMod = riskModifier(risco);

  const janelaLabel =
    janela != null && janela > 0
      ? `Últimos ${janela} meses válidos`
      : 'Todos os meses válidos';

  return (
    <>
      <section className={`home-kpi-strip home-kpi-strip--${riskMod}`}>
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <ShieldAlert size={20} />
          </span>
          <span className="home-kpi-label">Autonomia de estoque</span>
          {autonomia != null ? (
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">{num(autonomia)}</span>
              <span className="home-kpi-unit">meses</span>
            </p>
          ) : (
            <p className="home-kpi-value-line home-kpi-value-line--muted">
              <span className="home-kpi-number">—</span>
              <span className="home-kpi-hint">
                Informe o saldo em <a href="/admin/contratos">Admin → Contratos</a>
              </span>
            </p>
          )}
          <span className={`home-kpi-pill home-kpi-pill--${riskMod}`}>{risco}</span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Wallet size={20} />
          </span>
          <span className="home-kpi-label">Contrato</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(payload?.settings?.contratoMensal ?? 1200, 0)}
            </span>
            <span className="home-kpi-unit">/mês</span>
          </p>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <span className="home-kpi-label">Janela de análise</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-text">{janelaLabel}</span>
          </p>
        </article>

        {snapshot.saldoEstoque != null && (
          <article className="home-kpi-tile">
            <span className="home-kpi-icon" aria-hidden>
              <Package size={20} />
            </span>
            <span className="home-kpi-label">Saldo em estoque</span>
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">{num(snapshot.saldoEstoque, 0)}</span>
              <span className="home-kpi-unit">cestas</span>
            </p>
          </article>
        )}
      </section>

      <DecisionDashboard
        dashboard={dashboard}
        contratoMensal={payload?.settings?.contratoMensal ?? 1200}
        janelaAnaliseMeses={janela}
        history={payload?.history ?? []}
        services={payload?.services ?? []}
      />
    </>
  );
}
