import { useMemo } from 'react';
import {
  buildMonitoramentoResumo,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  resolveContextoPainelPublico,
} from '@shared/emergencyMonitoring';
import { buildCenarioMitigacao } from '@shared/cenarioMitigacao';
import { buildEmpenhoControle, computeAutonomiaOperacional } from '@shared/empenhoControle';
import {
  TETO_MENSAL_OPERACIONAL,
  TETO_CONTRATUAL_MENSAL,
} from '@shared/processoEmergencial';
import {
  Activity,
  CalendarRange,
  Package,
  ShieldAlert,
  Target,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import CessaoEquipamentosTable from '../../components/CessaoEquipamentosTable';
import TopEstourosRetomadaCard from '../../components/TopEstourosRetomadaCard';
import MitigacaoCenarioPanel from '../../components/MitigacaoCenarioPanel';

function num(n: number | null | undefined, dec = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function saudeCiclo(
  enviado: number,
  teto: number,
  dentroDoTeto: boolean,
): { label: string; mod: 'verde' | 'amarelo' | 'vermelho' } {
  const pct = teto > 0 ? (enviado / teto) * 100 : 0;
  if (!dentroDoTeto || pct > 100) return { label: 'VERMELHO', mod: 'vermelho' };
  if (pct >= 90) return { label: 'AMARELO', mod: 'amarelo' };
  return { label: 'VERDE', mod: 'verde' };
}

export default function DecisionHomePage() {
  const { loading, payload } = useData();

  const emergencial = useMemo(() => {
    if (!payload) return null;
    const ctx = resolveContextoPainelPublico(payload.emergencial);
    const resumo = buildMonitoramentoResumo(payload, {
      mesReferencia: ctx.mes,
      semanaReferencia: ctx.semanaReferencia,
      usarCicloOperacional: true,
    });
    const empenho = buildEmpenhoControle(payload);
    const cenario = buildCenarioMitigacao(payload, 2);
    const autonomia = computeAutonomiaOperacional(
      payload,
      resumo.ritmoSemanalMedio,
      resumo.enviadoSemanaAtual,
      resumo.mes,
      resumo.semanaAnalise,
    );
    const tetoCiclo = resumo.metaMesTotal;
    const fechamentoProjetado =
      cenario.fechamentoCicloProjetado ?? resumo.enviadoMesTotal;
    const pill = saudeCiclo(
      fechamentoProjetado,
      tetoCiclo,
      cenario.dentroDoTetoCiclo ?? fechamentoProjetado <= tetoCiclo,
    );
    return { resumo, empenho, autonomia, cenario, pill, ctx };
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

  const { empenho, autonomia, cenario, pill, resumo } = emergencial;

  return (
    <>
      <section className={`home-kpi-strip home-kpi-strip--${pill.mod}`}>
        <article className="home-kpi-tile home-kpi-tile--primary">
          <span className="home-kpi-icon" aria-hidden>
            <Target size={20} />
          </span>
          <span className="home-kpi-label">
            {resumo.labelCiclo ?? 'Ciclo operacional'}
          </span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(resumo.enviadoMesTotal, 0)}
            </span>
            <span className="home-kpi-unit">/ {num(resumo.metaMesTotal, 0)}</span>
          </p>
          <span className="home-kpi-hint">
            Fechamento projetado {num(cenario.fechamentoCicloProjetado, 0)} ·{' '}
            {cenario.dentroDoTetoCiclo ? 'dentro do teto' : 'acima do teto'}
          </span>
          <span className={`home-kpi-pill home-kpi-pill--${pill.mod}`}>
            {pill.label}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <Activity size={20} />
          </span>
          <span className="home-kpi-label">Ritmo de entrega (real)</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(resumo.ritmoSemanalMedio, 0)}
            </span>
            <span className="home-kpi-unit">cestas/sem</span>
          </p>
          <span className="home-kpi-hint">
            Empenho dura ~{num(autonomia.autonomiaSemanas, 0)} sem ao ritmo atual
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <ShieldAlert size={20} />
          </span>
          <span className="home-kpi-label">Teto por ciclo</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-number">
              {num(TETO_MENSAL_OPERACIONAL, 0)}
            </span>
            <span className="home-kpi-unit">cestas</span>
          </p>
          <span className="home-kpi-hint">
            Ciclo 1: 1.350 (1.150 + 200 gordura) · contrato{' '}
            {num(TETO_CONTRATUAL_MENSAL, 0)}
          </span>
        </article>

        <article className="home-kpi-tile">
          <span className="home-kpi-icon" aria-hidden>
            <CalendarRange size={20} />
          </span>
          <span className="home-kpi-label">Ponto zero</span>
          <p className="home-kpi-value-line">
            <span className="home-kpi-text">
              {MONITOR_CONTROLE_MES_INICIO} S{MONITOR_CONTROLE_SEMANA_INICIO}
            </span>
          </p>
          <span className="home-kpi-hint">
            Âncora operacional — independente do mês no Admin
          </span>
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

      <MitigacaoCenarioPanel payload={payload} />

      <CessaoEquipamentosTable payload={payload} />
    </>
  );
}
