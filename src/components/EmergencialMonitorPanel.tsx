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
import MonitorSaldoEvolucao from './MonitorSaldoEvolucao';
import RegistroSemanalPdfImport from './RegistroSemanalPdfImport';
import { TOTAL_MENSAL_EMERGENCIAL_PADRAO } from '@shared/requisicaoHistorico';
import { TETO_MENSAL_OPERACIONAL } from '@shared/processoEmergencial';
import type { DashboardState } from '@shared/types';
import PrintableTable from './ui/PrintableTable';
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
  const [semanaEdit, setSemanaEdit] = useState(MONITOR_CONTROLE_SEMANA_INICIO);

  const resumo = useMemo(
    () => buildMonitoramentoResumo(data, { semanaReferencia: semanaEdit }),
    [data, semanaEdit],
  );

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
        const isAnalise = w === resumo.semanaAnalise;
        const hasDados = val > 0;
        return (
          <td
            key={w}
            className={
              isEdit
                ? 'cell-edit-week'
                : isAnalise
                  ? 'cell-week-analise'
                  : hasDados
                    ? 'cell-week-filled'
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
      {/* —— 1 · Situação agora —— */}
      <section className={`panel emerg-monitor-kpis emerg-monitor-kpis--${riskClass} monitor-section`}>
        <h2 className="monitor-section-title">
          <span>1 ·</span> Situação agora — {resumo.mes}
        </h2>
        {resumo.ultimaSemanaComDados === 0 && resumo.enviadoMesTotal === 0 && (
          <p className="alerta-box alerta-nivel-alto">
            Nenhum envio lançado em <strong>{resumo.mes}</strong>. Importe o PDF RME da semana ou
            confira se o <strong>mês monitorado</strong> está correto.
          </p>
        )}
        {resumo.modoPlanejamento && (
          <p className="alerta-box alerta-nivel-moderado">
            Monitorando <strong>S{resumo.semanaAnalise}</strong> (sem lançamento ainda). Histórico
            até <strong>S{resumo.ultimaSemanaComDados}</strong>:{' '}
            <strong>{num(resumo.enviadoAteBaseRitmo)}</strong> cestas no mês — projeções e ritmo
            usam esse histórico para orientar a próxima semana.
          </p>
        )}
        <p className="hint">
          Teto <strong>{num(TETO_MENSAL_OPERACIONAL)}</strong>/mês · empenho{' '}
          <strong>{num(data.emergencial.empenhoTotalCestas ?? 4800)}</strong> · ponto zero S
          {resumo.semanaInicioControle} (
          {weekDateRangeLabel(year, month, resumo.semanaInicioControle)}).{' '}
          {readOnly ? 'Consulta.' : 'Importe o PDF da semana abaixo e salve.'}
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
                    {w === resumo.semanaAnalise ? ' — em análise' : ''}
                    {w === resumo.semanaAtual && w !== resumo.semanaAnalise
                      ? ' — civil hoje'
                      : ''}
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

        <RegistroSemanalPdfImport
          data={data}
          mes={resumo.mes}
          semana={semanaEdit}
          readOnly={readOnly}
          onApply={(next) => onUpdate(next)}
        />

        <div className="emerg-kpi-grid">
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Semana no mês</span>
            <strong>
              S{resumo.semanaAnalise} / {resumo.semanasNoMes}
            </strong>
            <span className="emerg-kpi-sub">
              {weekDateRangeLabel(year, month, resumo.semanaAnalise)} ({resumo.mes})
              {resumo.modoPlanejamento &&
                ` · histórico até S${resumo.ultimaSemanaComDados}`}
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
            <span className="emerg-kpi-label">Semana {resumo.semanaAnalise}</span>
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

        <MonitorSaudePanel
          data={data}
          resumo={resumo}
          dashboard={decisionDashboard}
        />
      </section>

      {/* —— 2 · Evolução do saldo —— */}
      <section className="panel monitor-section">
        <h2 className="monitor-section-title">
          <span>2 ·</span> Evolução do empenho (saldo caindo)
        </h2>
        <MonitorSaldoEvolucao data={data} />
      </section>

      {/* —— 3 · Distribuição e correção —— */}
      {resumo.alertas.length > 0 && (
        <section className="panel monitor-section">
          <h2 className="monitor-section-title">
            <span>3 ·</span> Correção de rota
          </h2>
          {resumo.alertas.map((a, i) => (
            <p key={i} className={`alerta-box alerta-nivel-${a.nivel}`}>
              <strong>{a.titulo}</strong> — {a.descricao}
            </p>
          ))}
        </section>
      )}

      <section className="panel monitor-section">
        <h2 className="monitor-section-title">
          <span>3 ·</span> Distribuição por setor — {resumo.mes}
          {!readOnly && (
            <span className="hint-inline">
              {' '}
              (envio real via PDF · semana {semanaEdit})
            </span>
          )}
        </h2>
        {!resumo.allocation && (
          <p className="alerta-box alerta-nivel-moderado">
            Importe a <strong>requisição Coderp</strong> abaixo e/ou a planilha pivot em Admin →
            Importar. Defina {TOTAL_MENSAL_EMERGENCIAL_PADRAO} cestas/mês em Contratos →
            Emergencial.
          </p>
        )}
        <PrintableTable
          title={`Distribuição por setor — ${resumo.mes}`}
          subtitle={`Semana de análise S${resumo.semanaAnalise} · envio real via PDF`}
          wrapClassName="emerg-monitor-table-wrap"
          orientation="landscape"
        >
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
                <th rowSpan={2}>% sem. {resumo.semanaAnalise}</th>
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
        </PrintableTable>
        <p className="hint">
          Envios reais por semana (colunas verdes = já lançadas). Ao mudar a semana no seletor, o
          histórico permanece. <strong>% sem.</strong> = teto na S{resumo.semanaAnalise}.{' '}
          <strong>% proj. mês</strong> = ritmo até S{resumo.semanaBaseRitmo} projetado até o fim do
          mês. Badge <em>Ritmo</em> = semana ok, mas projeção alta.
        </p>
      </section>

      {resumo.allocation && (
        <details className="panel emerg-meta-ref">
          <summary>Referência rateio (histórico Set/25–Mar/26)</summary>
          {!readOnly && (
            <CoderpPdfImport data={data} onApply={(next) => onUpdate(next)} />
          )}
          <p className="hint">
            Cotas por setor a partir do histórico sem racionamento — só orienta o rateio do teto{' '}
            {num(TETO_MENSAL_OPERACIONAL)}/mês.
          </p>
          <PrintableTable
            title="Referência de rateio (Set/25–Mar/26)"
            subtitle={`Cotas orientativas ao teto ${num(TETO_MENSAL_OPERACIONAL)}/mês`}
            orientation="landscape"
          >
            <table>
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Cota mês</th>
                  <th>Enviado</th>
                  <th>Falta</th>
                </tr>
              </thead>
              <tbody>
                {resumo.allocation.linhas.map((l) => {
                  const env =
                    resumo.equipamentos.find((e) => e.servicoId === l.servicoId)
                      ?.totalEnviado ?? 0;
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
          </PrintableTable>
        </details>
      )}

    </div>
  );
}
