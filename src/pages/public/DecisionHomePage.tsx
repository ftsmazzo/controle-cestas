import { useMemo } from 'react';
import { buildMonitoramentoResumo } from '@shared/emergencyMonitoring';
import { buildEmpenhoControle } from '@shared/empenhoControle';
import { computeAutonomiaOperacional } from '@shared/empenhoControle';
import {
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
  TETO_MENSAL_OPERACIONAL,
  TETO_CONTRATUAL_MENSAL,
} from '@shared/processoEmergencial';
import {
  Activity,
  CalendarRange,
  Package,
  ShieldAlert,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import CessaoEquipamentosTable from '../../components/CessaoEquipamentosTable';
import TopEstourosRetomadaCard from '../../components/TopEstourosRetomadaCard';

function num(n: number | null | undefined, dec = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function saudePill(
  autonomiaMeses: number | null,
  mesesRestantes: number,
  empenhoAcabaAntes: boolean,
): { label: string; mod: 'verde' | 'amarelo' | 'vermelho' } {
  if (empenhoAcabaAntes) return { label: 'VERMELHO', mod: 'vermelho' };
  if (autonomiaMeses == null) return { label: 'AMARELO', mod: 'amarelo' };
  if (autonomiaMeses >= mesesRestantes) return { label: 'VERDE', mod: 'verde' };
  if (autonomiaMeses >= mesesRestantes * 0.5) return { label: 'AMARELO', mod: 'amarelo' };
  return { label: 'VERMELHO', mod: 'vermelho' };
}

export default function DecisionHomePage() {
  const { loading, payload } = useData();

  const emergencial = useMemo(() => {
    if (!payload) return null;
    const resumo = buildMonitoramentoResumo(payload);
    const empenho = buildEmpenhoControle(payload);
    const autonomia = computeAutonomiaOperacional(
      payload,
      resumo.ritmoSemanalMedio,
      resumo.enviadoSemanaAtual,
      resumo.mes,
      resumo.semanaAnalise,
    );
    const pill = saudePill(
      autonomia.autonomiaMeses,
      autonomia.mesesPeriodoRestantes,
      autonomia.empenhoAcabaAntesDoPeriodo,
    );
    return { resumo, empenho, autonomia, pill };
  }, [payload]);

  if (loading) return null;

  if (!payload || !emergencial) {
    return (
      <section className="panel empty">
        <h3>Processo emergencial não configurado</h3>
        <p className="hint">
          Acesse <a href="/admin/monitoramento">Admin → Monitor</a> e use{' '}
          <strong>Preparar processo</strong> para iniciar o acompanhamento.
        </p>
      </section>
    );
  }

  const { empenho, autonomia, pill } = emergencial;

  return (
    <>
      <section className={`home-kpi-strip home-kpi-strip--${pill.mod}`}>
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <ShieldAlert size={20} />
          </span>
          <span className="home-kpi-label">Autonomia ao ritmo atual</span>
          {autonomia.autonomiaMeses != null ? (
            <p className="home-kpi-value-line">
              <span className="home-kpi-number">{num(autonomia.autonomiaMeses)}</span>
              <span className="home-kpi-unit">meses</span>
            </p>
          ) : (
            <p className="home-kpi-value-line home-kpi-value-line--muted">
              <span className="home-kpi-number">—</span>
              <span className="home-kpi-hint">Lance semanas no Monitor</span>
            </p>
          )}
          <span className={`home-kpi-pill home-kpi-pill--${pill.mod}`}>{pill.label}</span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Activity size={20} />
          </span>
          <span className="home-kpi-label">Teto operacional</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(TETO_MENSAL_OPERACIONAL, 0)}</span>
            <span className="home-kpi-unit">/mês</span>
          </p>
          <span className="home-kpi-hint">
            Contrato {num(TETO_CONTRATUAL_MENSAL, 0)} · margem 50/mês
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <span className="home-kpi-label">Referência histórica</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-text">
              {PERIODO_REFERENCIA_INICIO} – {PERIODO_REFERENCIA_FIM}
            </span>
          </p>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Package size={20} />
          </span>
          <span className="home-kpi-label">Saldo empenho</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">{num(empenho.restante, 0)}</span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          <span className="home-kpi-hint">
            de {num(empenho.totalEmpenho, 0)} · usado {num(empenho.totalConsumido, 0)}
          </span>
        </article>
      </section>

      <TopEstourosRetomadaCard payload={payload} />

      <CessaoEquipamentosTable payload={payload} />

      <p className="hint decision-foot-link">
        Acompanhamento semanal detalhado:{' '}
        <a href="/contrato-emergencial">Monitor emergencial</a>
        {' · '}
        <a href="/admin/monitoramento">Admin</a>
      </p>
    </>
  );
}
