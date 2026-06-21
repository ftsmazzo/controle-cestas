import { useMemo, useState } from 'react';
import {
  CalendarRange,
  Package,
  Target,
  TrendingDown,
} from 'lucide-react';
import { suggestEmpenhoMeses } from '@shared/empenhoControle';
import {
  MONITOR_CONTROLE_MES_INICIO,
  ultimoLancamentoSemanal,
} from '@shared/emergencyMonitoring';
import {
  civilPorIndiceOperacional,
  listarSemanasOperacionaisControle,
  proximaSemanaOperacional,
} from '@shared/operationalWeeks';
import { buildVisaoPublicaOperacional } from '@shared/visaoPublicaOperacional';
import type { ServicesPayload } from '@shared/serviceTypes';
import MonitorSemanaOperacionalImport from './MonitorSemanaOperacionalImport';
import PublicProgressBar, { toneFromPctRestante } from './ui/PublicProgressBar';
import './AdminMonitorSemanal.css';

function num(n: number | null | undefined, dec = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  data: ServicesPayload;
  onUpdate: (next: ServicesPayload) => void;
}

export default function AdminMonitorSemanal({ data, onUpdate }: Props) {
  const mon = data.emergencial.monitoramento;

  const empenhoMeses = useMemo(
    () =>
      data.emergencial.empenhoMeses?.length
        ? data.emergencial.empenhoMeses
        : suggestEmpenhoMeses(
            data.emergencial.duracaoMeses,
            MONITOR_CONTROLE_MES_INICIO,
          ),
    [data],
  );

  const semanas = useMemo(
    () => listarSemanasOperacionaisControle(mon, empenhoMeses),
    [mon, empenhoMeses],
  );

  const indiceSugerido = useMemo(() => {
    const ultimo = ultimoLancamentoSemanal(mon);
    if (!ultimo) return semanas[0]?.indice ?? 1;
    const prox = proximaSemanaOperacional(
      ultimo.mes,
      ultimo.semana,
      empenhoMeses,
    );
    if (prox) return prox.indice;
    const found = semanas.find(
      (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
    );
    return found?.indice ?? semanas[0]?.indice ?? 1;
  }, [mon, empenhoMeses, semanas]);

  /** Só semanas já usadas + a sugerida — sem lista infinita no futuro */
  const semanasVisiveis = useMemo(() => {
    const comDados = semanas.filter((s) => s.temDados).map((s) => s.indice);
    const teto = Math.max(indiceSugerido, ...comDados, 1);
    return semanas.filter((s) => s.indice <= teto);
  }, [semanas, indiceSugerido]);

  const [indiceEdit, setIndiceEdit] = useState<number | null>(null);
  const indiceAtivo = indiceEdit ?? indiceSugerido;

  const visao = useMemo(
    () => buildVisaoPublicaOperacional(data),
    [data],
  );

  const patchMonitoring = (nextMon: typeof mon) => {
    onUpdate({
      ...data,
      emergencial: { ...data.emergencial, monitoramento: nextMon },
      settings: { ...data.settings, saldoEstoque: nextMon.saldoAtual },
      regular: { ...data.regular, saldoAtual: nextMon.saldoAtual },
    });
  };

  const onSelectIndice = (indice: number) => {
    setIndiceEdit(indice);
    const civil = civilPorIndiceOperacional(indice, empenhoMeses);
    if (civil && civil.mes !== mon.mesAtivo) {
      patchMonitoring({ ...mon, mesAtivo: civil.mes });
    }
  };

  const pill = visao?.semaforoPeriodo ?? 'verde';
  const pctRestantePeriodo = visao
    ? Math.max(0, 100 - visao.pctPeriodo)
    : 100;
  const pctRestanteProcesso = visao
    ? Math.max(0, 100 - visao.pctProcesso)
    : 100;

  return (
    <div className="admin-monitor-semanal">
      <MonitorSemanaOperacionalImport
        data={data}
        empenhoMeses={empenhoMeses}
        semanas={semanasVisiveis}
        indice={indiceAtivo}
        indiceSugerido={indiceSugerido}
        onIndiceChange={onSelectIndice}
        onApplyImport={onUpdate}
      />

      {visao ? (
        <>
          <section className={`home-kpi-strip home-kpi-strip--${pill} admin-monitor-kpis`}>
            <p className="admin-monitor-kpis-lead hint">
              Prévia idêntica ao{' '}
              <a href="/" target="_blank" rel="noreferrer">
                painel público
              </a>{' '}
              após <strong>Salvar</strong> (último lançamento no banco).
            </p>
            <div className="admin-monitor-kpi-grid">
              <article className="home-kpi-tile home-kpi-tile--primary">
                <span className="home-kpi-icon" aria-hidden>
                  <Target size={20} />
                </span>
                <span className="home-kpi-label">Período (4 semanas)</span>
                <p className="home-kpi-value-line">
                  <span className="home-kpi-number">{num(visao.enviadoPeriodo)}</span>
                  <span className="home-kpi-unit">/ {num(visao.tetoPeriodo)}</span>
                </p>
                <PublicProgressBar
                  pct={pctRestantePeriodo}
                  tone={toneFromPctRestante(pctRestantePeriodo)}
                  label={`Saldo: ${num(visao.restantePeriodo)} cestas`}
                />
                <span className="home-kpi-hint">{visao.cicloLabel}</span>
              </article>
              <article className="home-kpi-tile">
                <span className="home-kpi-icon" aria-hidden>
                  <Package size={20} />
                </span>
                <span className="home-kpi-label">Saldo do processo</span>
                <p className="home-kpi-value-line">
                  <span className="home-kpi-number">{num(visao.saldoProcesso)}</span>
                </p>
                <PublicProgressBar
                  pct={pctRestanteProcesso}
                  tone={toneFromPctRestante(pctRestanteProcesso)}
                  label={`de ${num(visao.totalProcesso)}`}
                />
              </article>
              <article className="home-kpi-tile">
                <span className="home-kpi-icon" aria-hidden>
                  <CalendarRange size={20} />
                </span>
                <span className="home-kpi-label">Semana que fechou</span>
                <p className="home-kpi-value-line">
                  <span className="home-kpi-number">
                    {num(visao.enviadoSemanaFechada)}
                  </span>
                </p>
                <span className="home-kpi-hint">
                  {visao.semanaFechadaPeriodo}
                </span>
              </article>
              <article className="home-kpi-tile">
                <span className="home-kpi-icon" aria-hidden>
                  <TrendingDown size={20} />
                </span>
                <span className="home-kpi-label">Cotas próxima quarta</span>
                <p className="home-kpi-value-line">
                  <span className="home-kpi-number">
                    {num(visao.totalCotaSemanaPedidos)}
                  </span>
                </p>
                <span className="home-kpi-hint">{visao.semanaPedidosPeriodo}</span>
              </article>
            </div>
          </section>
        </>
      ) : (
        <section className="panel empty">
          <p className="hint">
            Importe o primeiro PDF semanal e salve para ver os números alinhados
            ao painel público.
          </p>
        </section>
      )}

      <p className="hint admin-monitor-foot">
        Consumo por equipamento e semana:{' '}
        <a href="/admin/consumo">Admin → Consumo semanal</a>. Saldo físico no
        Banco e parâmetros do lote:{' '}
        <a href="/admin/processo">Admin → Processo</a>.
      </p>
    </div>
  );
}
