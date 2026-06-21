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
  registerSaldoSemanal,
  ultimoLancamentoSemanal,
} from '@shared/emergencyMonitoring';
import {
  civilPorIndiceOperacional,
  listarSemanasOperacionaisControle,
  proximaSemanaOperacional,
} from '@shared/operationalWeeks';
import { buildVisaoPublicaOperacional } from '@shared/visaoPublicaOperacional';
import { consumptionUnits } from '@shared/serviceFamilies';
import type { ServicesPayload } from '@shared/serviceTypes';
import { getWeeklyQty } from '@shared/weeklyQty';
import MonitorSemanaOperacionalImport from './MonitorSemanaOperacionalImport';
import PublicProgressBar, { toneFromPctRestante } from './ui/PublicProgressBar';
import './AdminMonitorSemanal.css';

function num(n: number | null | undefined, dec = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : Math.max(0, Math.round(v));
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
  const semanaSel =
    semanas.find((s) => s.indice === indiceAtivo) ?? semanasVisiveis[0];

  const visao = useMemo(
    () => buildVisaoPublicaOperacional(data),
    [data],
  );

  const linhasSemana = useMemo(() => {
    if (!semanaSel) return [];
    const cfg = data.emergencial.monitoramento;
    return consumptionUnits(data.services)
      .map((u) => ({
        nome: u.nome,
        qty: getWeeklyQty(cfg, semanaSel.mes, semanaSel.semana, u.id),
      }))
      .filter((r) => r.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [data, semanaSel]);

  const totalSemana = linhasSemana.reduce((s, r) => s + r.qty, 0);

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

  const setSaldo = (saldo: number | null) => {
    if (!semanaSel) return;
    if (saldo == null) {
      patchMonitoring({
        ...mon,
        saldoAtual: null,
        saldoAtualizadoEm: new Date().toISOString(),
      });
      return;
    }
    patchMonitoring(
      registerSaldoSemanal(mon, semanaSel.mes, semanaSel.semana, saldo),
    );
  };

  const saldoInput = (
    <label className="admin-monitor-saldo">
      Saldo no banco
      <input
        type="text"
        inputMode="numeric"
        placeholder="Ex.: 450"
        value={mon.saldoAtual != null ? String(mon.saldoAtual) : ''}
        onChange={(e) => {
          const v = e.target.value.trim();
          setSaldo(v === '' ? null : parseQty(v));
        }}
      />
    </label>
  );

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
        saldoSlot={saldoInput}
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

          {semanaSel && (
            <section className="panel admin-monitor-lancamentos">
              <h3>
                Lançamentos — {semanaSel.periodo}
                {semanaSel.temDados ? (
                  <span className="hint-inline">
                    {' '}
                    · total {num(totalSemana)} cestas
                  </span>
                ) : (
                  <span className="hint-inline"> · vazio</span>
                )}
              </h3>
              {linhasSemana.length === 0 ? (
                <p className="hint">Nenhum equipamento nesta semana. Importe o PDF acima.</p>
              ) : (
                <table className="admin-monitor-lancamentos-table">
                  <thead>
                    <tr>
                      <th>Equipamento</th>
                      <th>Cestas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasSemana.map((r) => (
                      <tr key={r.nome}>
                        <td>{r.nome}</td>
                        <td>{num(r.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{num(totalSemana)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </section>
          )}
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
        Histórico de referência (Set/2025–Mar/2026) e importações antigas ficam
        em <a href="/admin/importar">Admin → Importar</a> — não entram neste
        fluxo semanal.
      </p>
    </div>
  );
}
