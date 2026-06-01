import { Fragment, useMemo, useState } from 'react';
import { suggestEmpenhoMeses } from '@shared/empenhoControle';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  buildMonitoramentoResumo,
  leadingDaysBeforeFirstMondayWeek,
  registerSaldoSemanal,
  upsertWeeklyQty,
  weekDateRangeLabel,
  type EmergencialMonitoramento,
  type EquipamentoMonitorRow,
} from '@shared/emergencyMonitoring';
import { getYearMonth, parseMonthKey } from '@shared/monthUtils';
import type { ServicesPayload } from '@shared/serviceTypes';
import CoderpPdfImport from './CoderpPdfImport';
import MonitorSaudePanel from './MonitorSaudePanel';
import RegistroSemanalPdfImport from './RegistroSemanalPdfImport';
import { TOTAL_MENSAL_EMERGENCIAL_PADRAO } from '@shared/requisicaoHistorico';
import type { DashboardState } from '@shared/types';
import './EmergencialMonitorPanel.css';

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
  readOnly?: boolean;
  decisionDashboard?: DashboardState | null;
}

export default function EmergencialMonitorPanel({
  data,
  onUpdate,
  readOnly,
  decisionDashboard,
}: Props) {
  const resumo = useMemo(() => buildMonitoramentoResumo(data), [data]);

  const mesesMonitor = useMemo(() => {
    const fromEmpenho = data.emergencial.empenhoMeses?.length
      ? data.emergencial.empenhoMeses
      : suggestEmpenhoMeses(data.emergencial.duracaoMeses, MONITOR_CONTROLE_MES_INICIO);
    const merged = new Map<string, { mes: string; total: number }>();
    for (const m of fromEmpenho) {
      const plan = data.emergencial.plans.find((p) => p.mes === m);
      merged.set(m, {
        mes: m,
        total: plan?.totalDisponivel ?? data.emergencial.cestasPorMes,
      });
    }
    for (const p of data.emergencial.plans) {
      if (!merged.has(p.mes)) merged.set(p.mes, { mes: p.mes, total: p.totalDisponivel });
    }
    return [...merged.values()].sort(
      (a, b) => parseMonthKey(a.mes) - parseMonthKey(b.mes),
    );
  }, [data]);

  const [semanaEdit, setSemanaEdit] = useState(MONITOR_CONTROLE_SEMANA_INICIO);

  const ym = getYearMonth(resumo.mes);
  const year = ym?.year ?? new Date().getFullYear();
  const month = ym?.month ?? new Date().getMonth() + 1;
  const diasAntesPrimeiraSemana = useMemo(
    () => leadingDaysBeforeFirstMondayWeek(year, month),
    [year, month],
  );

  const patchMonitoring = (mon: EmergencialMonitoramento) => {
    onUpdate({
      ...data,
      emergencial: {
        ...data.emergencial,
        monitoramento: mon,
      },
      settings: {
        ...data.settings,
        saldoEstoque: mon.saldoAtual,
      },
      regular: {
        ...data.regular,
        saldoAtual: mon.saldoAtual,
      },
    });
  };

  const setMesAtivo = (mes: string) => {
    const mon = { ...data.emergencial.monitoramento, mesAtivo: mes };
    const ini =
      parseMonthKey(mes) ===
      parseMonthKey(mon.mesInicioControle ?? MONITOR_CONTROLE_MES_INICIO)
        ? (mon.semanaInicioControle ?? MONITOR_CONTROLE_SEMANA_INICIO)
        : 1;
    setSemanaEdit(ini);
    patchMonitoring(mon);
  };

  const setSaldo = (saldo: number | null) => {
    if (saldo == null) {
      patchMonitoring({
        ...data.emergencial.monitoramento,
        saldoAtual: null,
        saldoAtualizadoEm: new Date().toISOString(),
      });
      return;
    }
    patchMonitoring(
      registerSaldoSemanal(
        data.emergencial.monitoramento,
        resumo.mes,
        semanaEdit,
        saldo,
      ),
    );
  };

  const renderEquipRow = (eq: EquipamentoMonitorRow) => {
    const ritmoPerigoso =
      eq.metaMensal > 0 &&
      eq.pctMes <= 100 &&
      eq.pctSemana <= 95 &&
      eq.pctProjecaoMes > 95;
    return (
    <tr
      key={eq.servicoId}
      className={`row-status-${eq.status}${ritmoPerigoso ? ' row-ritmo-perigoso' : ''}`}
      title={eq.alertaEquip ?? undefined}
    >
      <td className="cell-unidade">{eq.servicoNome}</td>
      <td>{eq.metaMensal > 0 ? num(eq.metaMensal) : '—'}</td>
      <td>{eq.metaSemanal > 0 ? num(eq.metaSemanal) : '—'}</td>
      {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map((w) => {
        const val = eq.semanas[w] ?? 0;
        const isEdit = !readOnly && w === semanaEdit;
        const preControle = w < resumo.semanaInicioControle;
        return (
          <td
            key={w}
            className={
              isEdit
                ? 'cell-edit-week'
                : preControle
                  ? 'cell-pre-controle'
                  : ''
            }
            title={
              preControle
                ? 'Antes do ponto zero — não entra no ritmo'
                : undefined
            }
          >
            {isEdit ? (
              <input
                type="text"
                inputMode="numeric"
                className="cell-qty-input"
                value={val > 0 ? String(val) : ''}
                placeholder="0"
                onChange={(e) =>
                  setWeekly(eq.servicoId, w, parseQty(e.target.value))
                }
              />
            ) : (
              (val > 0 ? num(val) : '·')
            )}
          </td>
        );
      })}
      <td>
        <strong>{num(eq.totalEnviado)}</strong>
      </td>
      <td className={eq.pctMes > 100 ? 'cell-over-limit' : ''}>
        {eq.metaMensal > 0 ? `${num(eq.pctMes, 0)}%` : '—'}
      </td>
      <td
        className={
          eq.pctSemana > 100
            ? 'cell-over-limit'
            : eq.pctSemana > 90
              ? 'cell-near-limit'
              : ''
        }
      >
        {eq.metaSemanal > 0 ? `${num(eq.pctSemana, 0)}%` : '—'}
      </td>
      <td
        className={
          eq.pctProjecaoMes > 100
            ? 'cell-over-limit'
            : eq.pctProjecaoMes > 92 || ritmoPerigoso
              ? 'cell-projecao-alerta'
              : ''
        }
        title={eq.alertaEquip ?? undefined}
      >
        {eq.metaMensal > 0 ? `${num(eq.pctProjecaoMes, 0)}%` : '—'}
        {ritmoPerigoso && eq.status === 'ok' && (
          <span className="badge badge-ritmo" title={eq.alertaEquip ?? ''}>
            Ritmo
          </span>
        )}
      </td>
      <td>
        <span className={`badge badge-${eq.status}`}>
          {eq.status === 'ok'
            ? ritmoPerigoso
              ? 'Ritmo ↑'
              : 'OK'
            : eq.status === 'atencao'
              ? 'Perto teto'
              : eq.status === 'critico'
                ? 'Estouro'
                : '—'}
        </span>
      </td>
    </tr>
  );
  };

  const setWeekly = (
    servicoId: string,
    semana: number,
    quantidade: number,
  ) => {
    const mon = upsertWeeklyQty(
      data.emergencial.monitoramento,
      resumo.mes,
      semana,
      servicoId,
      quantidade,
    );
    patchMonitoring(mon);
  };

  const riskClass =
    resumo.estouroMes > 0 ||
    resumo.estouroSemana > 0 ||
    resumo.pctMes > 100 ||
    resumo.estouroProjetadoMes > 0
      ? 'critico'
      : resumo.pctMes > 90 ||
          resumo.pctLimiteSemana > 90 ||
          resumo.pctProjecaoMes > 92
        ? 'atencao'
        : 'ok';

  return (
    <div className="emerg-monitor">
      <section className={`panel emerg-monitor-kpis emerg-monitor-kpis--${riskClass}`}>
        <h2>Monitoramento semanal — {resumo.mes}</h2>
        <p className="hint">
          <strong>Teto do mês:</strong>{' '}
          {num(resumo.metaMesTotal || TOTAL_MENSAL_EMERGENCIAL_PADRAO)} cestas (não ultrapassar).{' '}
          <strong>Teto/semana (total):</strong> ~{num(resumo.limiteSemanal)}. Cotas por unidade =
          rateio do teto (Coderp + planilha).{' '}
          {readOnly
            ? 'Consulta pública.'
            : 'Envios reais via PDF RME semanal. Acima do teto = alerta crítico.'}{' '}
          <strong>Ponto zero:</strong> semana {resumo.semanaInicioControle} de{' '}
          {data.emergencial.monitoramento.mesInicioControle ??
            MONITOR_CONTROLE_MES_INICIO}{' '}
          ({weekDateRangeLabel(
            year,
            month,
            resumo.semanaInicioControle,
          )}
          ). Semanas seg–dom variam por mês
          {diasAntesPrimeiraSemana
            ? ` (dias ${diasAntesPrimeiraSemana.start}–${diasAntesPrimeiraSemana.end} ficam fora da S1)`
            : ''}
          . Anteriores ao ponto zero: só registro, não entram no ritmo.
        </p>

        <div className="emerg-monitor-toolbar">
          <label>
            Mês monitorado
            <select
              value={resumo.mes}
              disabled={readOnly}
              onChange={(e) => setMesAtivo(e.target.value)}
            >
              {mesesMonitor.map((p) => (
                <option key={p.mes} value={p.mes}>
                  {p.mes} — teto {num(p.total)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Semana do registro (PDF)
            <select
              value={semanaEdit}
              onChange={(e) => setSemanaEdit(Number(e.target.value))}
            >
              {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map(
                (w) => (
                  <option key={w} value={w}>
                    Semana {w} ({weekDateRangeLabel(year, month, w)})
                    {w < resumo.semanaInicioControle ? ' — pré-controle' : ''}
                    {w === resumo.semanaAtual ? ' — atual' : ''}
                  </option>
                ),
              )}
            </select>
          </label>
          {!readOnly && (
            <label>
              Ponto zero (semana)
              <select
                value={
                  data.emergencial.monitoramento.semanaInicioControle ??
                  MONITOR_CONTROLE_SEMANA_INICIO
                }
                onChange={(e) =>
                  patchMonitoring({
                    ...data.emergencial.monitoramento,
                    semanaInicioControle: Number(e.target.value),
                    mesInicioControle:
                      data.emergencial.monitoramento.mesInicioControle ??
                      resumo.mes,
                  })
                }
              >
                {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map(
                  (w) => (
                    <option key={w} value={w}>
                      S{w} ({weekDateRangeLabel(year, month, w)})
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          <label>
            Saldo no Banco (cestas)
            <input
              type="text"
              inputMode="numeric"
              disabled={readOnly}
              placeholder="Ex.: 450"
              value={
                data.emergencial.monitoramento.saldoAtual != null
                  ? String(data.emergencial.monitoramento.saldoAtual)
                  : ''
              }
              onChange={(e) => {
                const v = e.target.value.trim();
                setSaldo(v === '' ? null : parseQty(v));
              }}
            />
          </label>
          {resumo.saldoAtualizadoEm && (
            <span className="emerg-saldo-ts">
              Atualizado:{' '}
              {new Date(resumo.saldoAtualizadoEm).toLocaleString('pt-BR')}
            </span>
          )}
        </div>

        <div className="emerg-kpi-grid">
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Semana no mês</span>
            <strong>
              S{resumo.semanaAtual} / {resumo.semanasNoMes}
            </strong>
            <span className="emerg-kpi-sub">
              {weekDateRangeLabel(year, month, resumo.semanaAtual)} ({resumo.mes})
            </span>
          </article>
          <article className={`emerg-kpi${resumo.estouroMes > 0 ? ' emerg-kpi--over' : ''}`}>
            <span className="emerg-kpi-label">Uso do teto mensal</span>
            <strong>
              {num(resumo.enviadoMesTotal)} / {num(resumo.metaMesTotal)}
            </strong>
            <span className="emerg-kpi-sub">
              {num(resumo.pctMes, 0)}%
              {resumo.estouroMes > 0
                ? ` · estouro +${num(resumo.estouroMes)}`
                : ` · margem ${num(resumo.margemMes)}`}
            </span>
          </article>
          <article
            className={`emerg-kpi${resumo.estouroSemana > 0 ? ' emerg-kpi--over' : ''}`}
          >
            <span className="emerg-kpi-label">Semana {resumo.semanaAtual}</span>
            <strong>
              {num(resumo.enviadoSemanaAtual)} / {num(resumo.limiteSemanal)}
            </strong>
            <span className="emerg-kpi-sub">
              {num(resumo.pctLimiteSemana, 0)}% do teto
              {resumo.estouroSemana > 0
                ? ` · +${num(resumo.estouroSemana)}`
                : ` · margem ${num(resumo.margemSemana)}`}
            </span>
          </article>
          <article
            className={`emerg-kpi${
              resumo.empenhoAcabaAntesDoPeriodo ? ' emerg-kpi--over' : ''
            }`}
          >
            <span className="emerg-kpi-label">Empenho / autonomia</span>
            <strong>{num(resumo.cestasDisponiveisEmpenho)}</strong>
            <span className="emerg-kpi-sub">
              {resumo.autonomiaSemanasSaldo != null ? (
                <>
                  ~{num(resumo.autonomiaSemanasSaldo, 1)} sem. ao ritmo ~
                  {num(resumo.ritmoSemanalReferencia, 0)}/sem
                  {resumo.autonomiaDiasSaldo != null &&
                    ` (${resumo.autonomiaDiasSaldo} dias)`}
                  {resumo.empenhoAcabaAntesDoPeriodo &&
                    ` · faltam ${resumo.semanasPeriodoRestantes} sem. no período`}
                </>
              ) : (
                'Lance envios para calcular'
              )}
            </span>
          </article>
          <article
            className={`emerg-kpi${
              resumo.estouroProjetadoMes > 0 ? ' emerg-kpi--over' : ''
            }`}
          >
            <span className="emerg-kpi-label">Projeção fim do mês</span>
            <strong>{num(resumo.projecaoMesTotal)}</strong>
            <span className="emerg-kpi-sub">
              {num(resumo.pctProjecaoMes, 0)}% do teto
              {resumo.semanaProjetadaEstouro != null
                ? ` · estouro S${resumo.semanaProjetadaEstouro}`
                : resumo.estouroProjetadoMes > 0
                  ? ` · +${num(resumo.estouroProjetadoMes)}`
                  : ''}
              {' '}
              · ritmo ~{num(resumo.ritmoSemanalMedio, 0)}/sem
            </span>
          </article>
        </div>
      </section>

      <RegistroSemanalPdfImport
        data={data}
        mes={resumo.mes}
        semana={semanaEdit}
        readOnly={readOnly}
        onApply={(next) => onUpdate(next)}
      />

      <MonitorSaudePanel
        data={data}
        resumo={resumo}
        dashboard={decisionDashboard}
      />

      {!readOnly && (
        <CoderpPdfImport data={data} onApply={(next) => onUpdate(next)} />
      )}

      {resumo.historicoSaldo.length > 0 && (
        <section className="panel">
          <h3>Histórico de saldo (semana a semana)</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Semana</th>
                  <th>Saldo</th>
                  <th>Registrado em</th>
                </tr>
              </thead>
              <tbody>
                {[...resumo.historicoSaldo]
                  .reverse()
                  .slice(0, 24)
                  .map((h, i) => {
                    const hym = getYearMonth(h.mes);
                    const hy = hym?.year ?? year;
                    const hm = hym?.month ?? month;
                    return (
                    <tr key={`${h.mes}-${h.semana}-${i}`}>
                      <td>{h.mes}</td>
                      <td>
                        S{h.semana} ({weekDateRangeLabel(hy, hm, h.semana)})
                      </td>
                      <td>
                        <strong>{num(h.saldo)}</strong>
                      </td>
                      <td>
                        {new Date(h.registradoEm).toLocaleString('pt-BR')}
                      </td>
                    </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {resumo.alertas.length > 0 && (
        <section className="panel">
          <h3>Alertas</h3>
          {resumo.alertas.map((a, i) => (
            <p key={i} className={`alerta-box alerta-nivel-${a.nivel}`}>
              <strong>{a.titulo}</strong> — {a.descricao}
            </p>
          ))}
        </section>
      )}

      <section className="panel">
        <h3>
          Tetos e envios por unidade — {resumo.mes}
          {!readOnly && (
            <span className="hint-inline">
              {' '}
              (envio real via PDF · semana {semanaEdit})
            </span>
          )}
        </h3>
        {!resumo.allocation && (
          <p className="alerta-box alerta-nivel-moderado">
            Importe a <strong>requisição Coderp</strong> abaixo e/ou a planilha pivot em Admin →
            Importar. Defina {TOTAL_MENSAL_EMERGENCIAL_PADRAO} cestas/mês em Contratos →
            Emergencial.
          </p>
        )}
        <div className="table-wrap emerg-monitor-table-wrap">
          <table className="emerg-monitor-table">
            <thead>
              <tr>
                <th rowSpan={2}>Equipamento</th>
                <th rowSpan={2}>Teto mês</th>
                <th rowSpan={2}>Teto/sem</th>
                {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map(
                  (w) => (
                    <th
                      key={w}
                      colSpan={1}
                      className={
                        w < resumo.semanaInicioControle
                          ? 'sem-head sem-head-pre'
                          : 'sem-head'
                      }
                    >
                      S{w}
                      <span className="sem-range">
                        {weekDateRangeLabel(year, month, w)}
                        {w < resumo.semanaInicioControle ? ' · pré' : ''}
                      </span>
                    </th>
                  ),
                )}
                <th rowSpan={2}>Total</th>
                <th rowSpan={2}>% mês</th>
                <th rowSpan={2}>% sem. {resumo.semanaAtual}</th>
                <th rowSpan={2} title="Se o ritmo das semanas de controle continuar">
                  % proj. mês
                </th>
                <th rowSpan={2}>Status</th>
              </tr>
            </thead>
            <tbody>
              {resumo.familias.map((fam) => {
                const metaFam = fam.itens.reduce((s, e) => s + e.metaMensal, 0);
                const envFam = fam.itens.reduce((s, e) => s + e.totalEnviado, 0);
                const colSpan = 3 + resumo.semanasNoMes;
                return (
                  <Fragment key={fam.familiaId}>
                    <tr className="row-familia">
                      <td colSpan={colSpan}>
                        <strong>{fam.familiaNome}</strong>
                        <span className="familia-sub">
                          {fam.itens.length} unidade(s)
                          {metaFam > 0 ? ` · teto ${num(metaFam)}` : ''}
                        </span>
                      </td>
                      <td>
                        <strong>{num(envFam)}</strong>
                      </td>
                      <td>
                        {metaFam > 0
                          ? `${num((envFam / metaFam) * 100, 0)}%`
                          : '—'}
                      </td>
                      <td />
                      <td />
                      <td />
                    </tr>
                    {fam.itens.map((eq) => renderEquipRow(eq))}
                  </Fragment>
                );
              })}
              {!resumo.familias.length &&
                resumo.equipamentos.map((eq) => renderEquipRow(eq))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>TOTAL</strong>
                </td>
                <td>{num(resumo.metaMesTotal)}</td>
                <td>—</td>
                {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map(
                  (w) => (
                    <td key={w}>
                      <strong>
                        {num(
                          resumo.equipamentos.reduce(
                            (s, e) => s + (e.semanas[w] ?? 0),
                            0,
                          ),
                        )}
                      </strong>
                    </td>
                  ),
                )}
                <td>
                  <strong>{num(resumo.enviadoMesTotal)}</strong>
                </td>
                <td>{num(resumo.pctMes, 0)}%</td>
                <td>{num(resumo.pctLimiteSemana, 0)}%</td>
                <td
                  className={
                    resumo.pctProjecaoMes > 100
                      ? 'cell-over-limit'
                      : resumo.pctProjecaoMes > 92
                        ? 'cell-projecao-alerta'
                        : ''
                  }
                >
                  {num(resumo.pctProjecaoMes, 0)}%
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="hint">
          Envios reais por semana. <strong>% sem.</strong> = uso do teto na semana{' '}
          {resumo.semanaAtual}. <strong>% proj. mês</strong> = se o ritmo do período de
          controle continuar até o fim do mês (verde na semana pode ainda estourar o teto).
          Badge <em>Ritmo</em> = semana ok, mas projeção alta — ajustar na próxima semana.
        </p>
      </section>

      {resumo.allocation && (
        <section className="panel emerg-meta-ref">
          <h3>Referência — meta projetada ({resumo.mes})</h3>
          <p className="hint">
            Valores calculados pela divisão proporcional ao histórico (fixos
            reservados primeiro). Use como guia semanal: meta ÷ {resumo.semanasNoMes}{' '}
            semanas.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Alocado mês</th>
                  <th>Enviado</th>
                  <th>Falta</th>
                </tr>
              </thead>
              <tbody>
                {resumo.allocation.linhas.map((l) => {
                  const env = resumo.equipamentos.find(
                    (e) => e.servicoId === l.servicoId,
                  )?.totalEnviado ?? 0;
                  const falta = Math.max(0, l.alocado - env);
                  return (
                    <tr key={l.servicoId}>
                      <td>{l.servicoNome}</td>
                      <td>{num(l.alocado)}</td>
                      <td>{num(env)}</td>
                      <td className={falta > 0 ? 'falta-positiva' : ''}>
                        {falta > 0 ? num(falta) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
