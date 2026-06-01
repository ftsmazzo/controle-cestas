import { Fragment, useMemo, useState } from 'react';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  buildMonitoramentoResumo,
  registerSaldoSemanal,
  upsertWeeklyQty,
  weekDateRangeLabel,
  weekOfMonth,
  type EmergencialMonitoramento,
  type EquipamentoMonitorRow,
} from '@shared/emergencyMonitoring';
import { getYearMonth, parseMonthKey } from '@shared/monthUtils';
import type { ServicesPayload } from '@shared/serviceTypes';
import CoderpPdfImport from './CoderpPdfImport';
import MonitorSaudePanel from './MonitorSaudePanel';
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

  const [semanaEdit, setSemanaEdit] = useState(MONITOR_CONTROLE_SEMANA_INICIO);

  const ym = getYearMonth(resumo.mes);
  const year = ym?.year ?? new Date().getFullYear();
  const month = ym?.month ?? new Date().getMonth() + 1;

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

  const renderEquipRow = (eq: EquipamentoMonitorRow) => (
    <tr key={eq.servicoId} className={`row-status-${eq.status}`}>
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
      <td>{eq.metaMensal > 0 ? `${num(eq.pctMes, 0)}%` : '—'}</td>
      <td>
        <span className={`badge badge-${eq.status}`}>
          {eq.status === 'ok'
            ? 'OK'
            : eq.status === 'atencao'
              ? 'Atenção'
              : eq.status === 'critico'
                ? 'Crítico'
                : '—'}
        </span>
      </td>
    </tr>
  );

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
    resumo.pctRitmoGeral < 70
      ? 'critico'
      : resumo.pctRitmoGeral < 90
        ? 'atencao'
        : 'ok';

  return (
    <div className="emerg-monitor">
      <section className={`panel emerg-monitor-kpis emerg-monitor-kpis--${riskClass}`}>
        <h2>Monitoramento semanal — {resumo.mes}</h2>
        <p className="hint">
          <strong>Meta do mês:</strong> {num(resumo.metaMesTotal || TOTAL_MENSAL_EMERGENCIAL_PADRAO)}{' '}
          cestas (fixos reservados primeiro; flexíveis proporcionais ao histórico requisição +
          planilha). <strong>Meta/semana</strong> = meta da unidade ÷ {resumo.semanasNoMes}.{' '}
          {readOnly
            ? 'Consulta pública.'
            : 'Registre o que o Banco enviou cada semana (dados reais dos documentos).'}{' '}
          <strong>Ponto zero:</strong> semana {resumo.semanaInicioControle} de{' '}
          {data.emergencial.monitoramento.mesInicioControle ??
            MONITOR_CONTROLE_MES_INICIO}{' '}
          ({weekDateRangeLabel(
            year,
            month,
            resumo.semanaInicioControle,
          )}{' '}
          — inclui envios ~18–22 e 25–29/mai). Semanas anteriores: só registro, não
          entram no ritmo.
        </p>

        <div className="emerg-monitor-toolbar">
          <label>
            Mês monitorado
            <select
              value={resumo.mes}
              disabled={readOnly}
              onChange={(e) => setMesAtivo(e.target.value)}
            >
              {data.emergencial.plans.map((p) => (
                <option key={p.mes} value={p.mes}>
                  {p.mes} — meta {num(p.totalDisponivel)}
                </option>
              ))}
              {!data.emergencial.plans.some(
                (p) => parseMonthKey(p.mes) === parseMonthKey(resumo.mes),
              ) && <option value={resumo.mes}>{resumo.mes}</option>}
            </select>
          </label>
          <label>
            Semana para lançamento
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
            <span className="emerg-kpi-label">Semana civil</span>
            <strong>
              {resumo.semanaAtual} / {resumo.semanasNoMes}
            </strong>
          </article>
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Enviado no mês</span>
            <strong>
              {num(resumo.enviadoMesTotal)} / {num(resumo.metaMesTotal)}
            </strong>
            <span className="emerg-kpi-sub">{num(resumo.pctMes, 0)}% da meta</span>
          </article>
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Ritmo até hoje</span>
            <strong>{num(resumo.pctRitmoGeral, 0)}%</strong>
            <span className="emerg-kpi-sub">
              {num(resumo.enviadoAcumulado)} de {num(resumo.metaAcumuladaEsperada)}{' '}
              esperados
            </span>
          </article>
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Saldo / autonomia</span>
            <strong>{num(resumo.saldoAtual)}</strong>
            <span className="emerg-kpi-sub">
              {resumo.autonomiaSemanasSaldo != null
                ? `~${num(resumo.autonomiaSemanasSaldo, 1)} sem.`
                : 'Informe saldo'}
            </span>
          </article>
        </div>
      </section>

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
          Metas e envios por unidade — {resumo.mes}
          {!readOnly && (
            <span className="hint-inline"> (lançamento semana {semanaEdit})</span>
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
                <th rowSpan={2}>Meta mês</th>
                <th rowSpan={2}>Meta/sem</th>
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
                          {metaFam > 0 ? ` · meta ${num(metaFam)}` : ''}
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
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="hint">
          Colunas S1–S4: o que foi <strong>enviado</strong>. Meta/sem: cota proporcional das{' '}
          {num(resumo.metaMesTotal)} cestas após reservar os serviços <strong>fixos</strong>.
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
