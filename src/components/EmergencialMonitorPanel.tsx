import { useMemo, useState } from 'react';
import {
  buildMonitoramentoResumo,
  upsertWeeklyQty,
  weekDateRangeLabel,
  weekOfMonth,
  type EmergencialMonitoramento,
} from '@shared/emergencyMonitoring';
import { getYearMonth, parseMonthKey } from '@shared/monthUtils';
import type { ServicesPayload } from '@shared/serviceTypes';
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
}

export default function EmergencialMonitorPanel({
  data,
  onUpdate,
  readOnly,
}: Props) {
  const [semanaEdit, setSemanaEdit] = useState(() => weekOfMonth());

  const resumo = useMemo(() => buildMonitoramentoResumo(data), [data]);

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
    patchMonitoring({
      ...data.emergencial.monitoramento,
      mesAtivo: mes,
    });
  };

  const setSaldo = (saldo: number | null) => {
    patchMonitoring({
      ...data.emergencial.monitoramento,
      saldoAtual: saldo,
      saldoAtualizadoEm: new Date().toISOString(),
    });
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
    resumo.pctRitmoGeral < 70
      ? 'critico'
      : resumo.pctRitmoGeral < 90
        ? 'atencao'
        : 'ok';

  return (
    <div className="emerg-monitor">
      <section className={`panel emerg-monitor-kpis emerg-monitor-kpis--${riskClass}`}>
        <h2>Monitoramento emergencial — produção</h2>
        <p className="hint">
          Acompanhamento <strong>semanal por equipamento</strong> (CRAS 1, CREAS II, SAICA…),
          alinhado às planilhas do Banco. Metas por equipamento vêm da{' '}
          <strong>distribuição projetada</strong> do mês ({num(resumo.metaMesTotal)} cestas
          totais).
          {readOnly
            ? ' Modo consulta — alterações em /admin/monitoramento.'
            : ' Registre envios e saldo toda semana.'}
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
                    {w === resumo.semanaAtual ? ' — atual' : ''}
                  </option>
                ),
              )}
            </select>
          </label>
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
          Envios por equipamento — {resumo.mes}
          {!readOnly && (
            <span className="hint-inline">
              {' '}
              (editando semana {semanaEdit})
            </span>
          )}
        </h3>
        {!resumo.allocation && (
          <p className="alerta-box alerta-nivel-moderado">
            Calcule a distribuição em Contratos → Emergencial para ver metas por
            equipamento, ou importe histórico em Admin.
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
                    <th key={w} colSpan={1} className="sem-head">
                      S{w}
                      <span className="sem-range">
                        {weekDateRangeLabel(year, month, w)}
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
              {resumo.equipamentos.map((eq) => (
                <tr key={eq.servicoId} className={`row-status-${eq.status}`}>
                  <td>{eq.servicoNome}</td>
                  <td>{eq.metaMensal > 0 ? num(eq.metaMensal) : '—'}</td>
                  <td>{eq.metaSemanal > 0 ? num(eq.metaSemanal) : '—'}</td>
                  {Array.from({ length: resumo.semanasNoMes }, (_, i) => i + 1).map(
                    (w) => {
                      const val = eq.semanas[w] ?? 0;
                      const isEdit = !readOnly && w === semanaEdit;
                      return (
                        <td key={w} className={isEdit ? 'cell-edit-week' : ''}>
                          {isEdit ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              className="cell-qty-input"
                              value={val > 0 ? String(val) : ''}
                              placeholder="0"
                              onChange={(e) =>
                                setWeekly(
                                  eq.servicoId,
                                  w,
                                  parseQty(e.target.value),
                                )
                              }
                            />
                          ) : (
                            val > 0 ? num(val) : '·'
                          )}
                        </td>
                      );
                    },
                  )}
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
              ))}
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
          Totais por semana devem bater com o relatório RME do Banco (requisitante =
          equipamento). Relatório Coderp: consumo por SETOR CRAS/CREAS.
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
