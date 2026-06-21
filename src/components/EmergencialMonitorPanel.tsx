import { Fragment, useMemo, useState } from 'react';
import { suggestEmpenhoMeses } from '@shared/empenhoControle';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  buildMonitoramentoResumo,
  registerSaldoSemanal,
  resolveContextoOperacionalAnalise,
  ultimoLancamentoSemanal,
  upsertWeeklyQty,
  type EmergencialMonitoramento,
  type EquipamentoMonitorRow,
} from '@shared/emergencyMonitoring';
import type { ServicesPayload } from '@shared/serviceTypes';
import CoderpPdfImport from './CoderpPdfImport';
import MonitorSaudePanel from './MonitorSaudePanel';
import MonitorSaldoEvolucao from './MonitorSaldoEvolucao';
import MonitorSemanaOperacionalImport from './MonitorSemanaOperacionalImport';
import {
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
  TETO_MENSAL_OPERACIONAL,
} from '@shared/processoEmergencial';
import {
  civilPorIndiceOperacional,
  listarSemanasOperacionaisControle,
  proximaSemanaOperacional,
  refSemanaOperacionalCivil,
} from '@shared/operationalWeeks';
import { labelFonteProjecao } from '@shared/projecaoOperacionalCiclo';
import type { DashboardState } from '@shared/types';
import MonitorAjustesOperacionais from './MonitorAjustesOperacionais';
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
  const mon = data.emergencial.monitoramento;

  const empenhoMesesLista = useMemo(
    () =>
      data.emergencial.empenhoMeses?.length
        ? data.emergencial.empenhoMeses
        : suggestEmpenhoMeses(
            data.emergencial.duracaoMeses,
            MONITOR_CONTROLE_MES_INICIO,
          ),
    [data],
  );

  const semanasOp = useMemo(
    () => listarSemanasOperacionaisControle(mon, empenhoMesesLista),
    [mon, empenhoMesesLista],
  );

  const indiceSugerido = useMemo(() => {
    const ultimo = ultimoLancamentoSemanal(mon);
    if (!ultimo) return semanasOp[0]?.indice ?? 1;
    const prox = proximaSemanaOperacional(
      ultimo.mes,
      ultimo.semana,
      empenhoMesesLista,
    );
    if (prox) return prox.indice;
    const found = semanasOp.find(
      (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
    );
    return found?.indice ?? semanasOp[0]?.indice ?? 1;
  }, [mon, empenhoMesesLista, semanasOp]);

  const [indiceEdit, setIndiceEdit] = useState<number | null>(null);

  const indiceAtivo = indiceEdit ?? indiceSugerido;
  const semanaSel =
    semanasOp.find((s) => s.indice === indiceAtivo) ?? semanasOp[0];
  const mesAtivo = semanaSel?.mes ?? MONITOR_CONTROLE_MES_INICIO;
  const semanaEdit = semanaSel?.semana ?? MONITOR_CONTROLE_SEMANA_INICIO;

  const ctxAnalise = useMemo(
    () =>
      resolveContextoOperacionalAnalise(
        data.emergencial.monitoramento,
        mesAtivo,
        semanaEdit,
        empenhoMesesLista,
      ),
    [data.emergencial.monitoramento, mesAtivo, semanaEdit, empenhoMesesLista],
  );

  /** KPIs, saúde e alertas — ciclo operacional no último lançamento (ou semana à frente) */
  const resumoAnalise = useMemo(
    () =>
      buildMonitoramentoResumo(data, {
        mesReferencia: ctxAnalise.mes,
        semanaReferencia: ctxAnalise.semana,
        mesExibicao: mesAtivo,
        usarCicloOperacional: true,
      }),
    [data, ctxAnalise, mesAtivo],
  );

  /** Grade de lançamentos — mês civil selecionado na aba */
  const resumoTabela = useMemo(
    () =>
      buildMonitoramentoResumo(data, {
        mesReferencia: mesAtivo,
        semanaReferencia: semanaEdit,
        mesExibicao: mesAtivo,
        usarCicloOperacional: false,
      }),
    [data, mesAtivo, semanaEdit],
  );

  const patchMonitoring = (nextMon: EmergencialMonitoramento) => {
    onUpdate({
      ...data,
      emergencial: {
        ...data.emergencial,
        monitoramento: nextMon,
      },
      settings: {
        ...data.settings,
        saldoEstoque: nextMon.saldoAtual,
      },
      regular: {
        ...data.regular,
        saldoAtual: nextMon.saldoAtual,
      },
    });
  };

  const onSelectIndice = (indice: number) => {
    setIndiceEdit(indice);
    const civil = civilPorIndiceOperacional(indice, empenhoMesesLista);
    if (civil && civil.mes !== mon.mesAtivo) {
      patchMonitoring({ ...mon, mesAtivo: civil.mes });
    }
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
        resumoTabela.mes,
        semanaEdit,
        saldo,
      ),
    );
  };

  const renderEquipRow = (eq: EquipamentoMonitorRow) => {
    const ritmoPerigoso =
      !eq.cotaMensalUnica &&
      eq.metaMensal > 0 &&
      eq.pctMes <= 100 &&
      eq.pctSemana <= 95 &&
      eq.pctProjecaoMes > 95;
    return (
    <tr
      key={eq.servicoId}
      className={`row-status-${eq.status}${ritmoPerigoso ? ' row-ritmo-perigoso' : ''}${eq.cotaMensalUnica ? ' row-cota-mes' : ''}`}
      title={eq.alertaEquip ?? undefined}
    >
      <td className="cell-unidade">
        {eq.servicoNome}
        {eq.cotaMensalUnica && (
          <span className="badge badge-cota-mes" title="Entrega única no período de 4 semanas">
            fixo
          </span>
        )}
      </td>
      <td>{eq.metaMensal > 0 ? num(eq.metaMensal) : '—'}</td>
      <td>
        {eq.cotaMensalUnica
          ? '—'
          : eq.metaSemanal > 0
            ? num(eq.metaSemanal)
            : '—'}
      </td>
      {Array.from({ length: resumoTabela.semanasNoMes }, (_, i) => i + 1).map((w) => {
        const val = eq.semanas[w] ?? 0;
        const isEdit = !readOnly && w === semanaEdit;
        const preControle = w < resumoTabela.semanaInicioControle;
        const isAnalise = w === semanaEdit;
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
        {eq.cotaMensalUnica
          ? '—'
          : eq.metaSemanal > 0
            ? `${num(eq.pctSemana, 0)}%`
            : '—'}
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
      mesAtivo,
      semana,
      servicoId,
      quantidade,
    );
    patchMonitoring(mon);
  };

  const riskClass =
    resumoAnalise.estouroMes > 0 ||
    resumoAnalise.estouroSemana > 0 ||
    resumoAnalise.pctMes > 100 ||
    resumoAnalise.estouroProjetadoMes > 0
      ? 'critico'
      : resumoAnalise.pctMes > 90 ||
          resumoAnalise.pctLimiteSemana > 90 ||
          resumoAnalise.pctProjecaoMes > 92
        ? 'atencao'
        : 'ok';

  const semanaCabecalho = (w: number) => {
    const ref = refSemanaOperacionalCivil(resumoTabela.mes, w, empenhoMesesLista);
    if (ref) return { titulo: ref.label, periodo: ref.periodo };
    return { titulo: `S${w}`, periodo: `${resumoTabela.mes} S${w}` };
  };

  const totalSemanaSel = resumoTabela.equipamentos.reduce(
    (s, e) => s + (e.semanas[semanaEdit] ?? 0),
    0,
  );

  const saldoInput = (
    <>
      <label>
        Saldo no Banco (cestas)
        <input
          type="text"
          inputMode="numeric"
          disabled={readOnly}
          placeholder="Ex.: 450"
          value={
            mon.saldoAtual != null ? String(mon.saldoAtual) : ''
          }
          onChange={(e) => {
            const v = e.target.value.trim();
            setSaldo(v === '' ? null : parseQty(v));
          }}
        />
      </label>
      {resumoAnalise.saldoAtualizadoEm && (
        <span className="emerg-saldo-ts">
          Atualizado:{' '}
          {new Date(resumoAnalise.saldoAtualizadoEm).toLocaleString('pt-BR')}
        </span>
      )}
    </>
  );

  return (
    <div className="emerg-monitor">
      <MonitorSemanaOperacionalImport
        data={data}
        empenhoMeses={empenhoMesesLista}
        indice={indiceAtivo}
        onIndiceChange={onSelectIndice}
        onApplyImport={onUpdate}
        saldoSlot={saldoInput}
        readOnly={readOnly}
      />

      {/* —— 2 · Resumo operacional —— */}
      <section className={`panel emerg-monitor-kpis emerg-monitor-kpis--${riskClass} monitor-section`}>
        <h2 className="monitor-section-title">
          <span>2 ·</span> Resumo — {resumoAnalise.labelCiclo ?? mesAtivo}
        </h2>
        {resumoAnalise.ultimaSemanaComDados === 0 && resumoAnalise.enviadoMesTotal === 0 && (
          <p className="alerta-box alerta-nivel-alto">
            Nenhum envio lançado no período. Importe o PDF RME acima e salve.
          </p>
        )}
        {resumoAnalise.alertas.slice(0, 2).map((a, i) => (
          <p key={i} className={`alerta-box alerta-nivel-${a.nivel}`}>
            <strong>{a.titulo}</strong> — {a.descricao}
          </p>
        ))}
        <div className="emerg-kpi-grid">
          <article className="emerg-kpi">
            <span className="emerg-kpi-label">Semana operacional</span>
            <strong>
              {resumoAnalise.labelSemanaAnalise ?? `S${resumoAnalise.semanaAnalise}`}
            </strong>
            <span className="emerg-kpi-sub">
              {resumoAnalise.labelCiclo ?? resumoAnalise.mes}
              {resumoAnalise.modoPlanejamento &&
                ` · histórico ${num(resumoAnalise.enviadoAteBaseRitmo)} no ciclo`}
            </span>
          </article>
          <article className={`emerg-kpi${resumoAnalise.estouroMes > 0 ? ' emerg-kpi--over' : ''}`}>
            <span className="emerg-kpi-label">Uso do período (4 sem.)</span>
            <strong>
              {num(resumoAnalise.enviadoMesTotal)} / {num(resumoAnalise.metaMesTotal)}
            </strong>
            <span className="emerg-kpi-sub">
              {num(resumoAnalise.pctMes, 0)}%
              {resumoAnalise.estouroMes > 0
                ? ` · estouro +${num(resumoAnalise.estouroMes)}`
                : ` · margem ${num(resumoAnalise.margemMes)}`}
            </span>
          </article>
          <article
            className={`emerg-kpi${resumoAnalise.estouroSemana > 0 ? ' emerg-kpi--over' : ''}`}
          >
            <span className="emerg-kpi-label">
              Semana {resumoAnalise.semanaNoCiclo ?? resumoAnalise.semanaAnalise} do período
            </span>
            <strong>
              {num(resumoAnalise.enviadoSemanaAtual)} / {num(resumoAnalise.limiteSemanal)}
            </strong>
            <span className="emerg-kpi-sub">
              {num(resumoAnalise.pctLimiteSemana, 0)}% do teto
              {resumoAnalise.estouroSemana > 0
                ? ` · +${num(resumoAnalise.estouroSemana)}`
                : ` · margem ${num(resumoAnalise.margemSemana)}`}
              {resumoAnalise.planejadoSemanaAtual != null
                ? ` · plano ${num(resumoAnalise.planejadoSemanaAtual)}`
                : ''}
              {resumoAnalise.semanasRestantesCiclo != null
                ? ` · ${resumoAnalise.semanasRestantesCiclo} sem. rest. no período (margem ${num(resumoAnalise.margemMes)})`
                : ''}
            </span>
          </article>
          <article
            className={`emerg-kpi${
              resumoAnalise.empenhoAcabaAntesDoPeriodo ? ' emerg-kpi--over' : ''
            }`}
          >
            <span className="emerg-kpi-label">Saldo do processo</span>
            <strong>
              {num(
                resumoAnalise.saudeEmpenho?.restante ??
                  resumoAnalise.cestasDisponiveisEmpenho,
              )}
            </strong>
            <span className="emerg-kpi-sub">
              {resumoAnalise.saudeEmpenho ? (
                <>
                  {resumoAnalise.saudeEmpenho.semanasDecorridas}/
                  {resumoAnalise.saudeEmpenho.semanasTotal} sem. · sustentável ~
                  {num(resumoAnalise.saudeEmpenho.ritmoSustentavel, 0)}/sem
                  {resumoAnalise.empenhoAcabaAntesDoPeriodo
                    ? ' · fora do trilho'
                    : ` · proj. ${num(resumoAnalise.saudeEmpenho.fechamentoProjetadoProcesso, 0)}/${num(resumoAnalise.saudeEmpenho.totalEmpenho, 0)}`}
                </>
              ) : resumoAnalise.autonomiaSemanasSaldo != null ? (
                <>
                  ~{num(resumoAnalise.autonomiaSemanasSaldo, 1)} sem. restantes
                </>
              ) : (
                'Lance envios para calcular'
              )}
            </span>
          </article>
          <article
            className={`emerg-kpi${
              resumoAnalise.estouroProjetadoMes > 0 ? ' emerg-kpi--over' : ''
            }`}
          >
            <span className="emerg-kpi-label">Projeção fim do período</span>
            <strong>{num(resumoAnalise.projecaoMesTotal)}</strong>
            <span className="emerg-kpi-sub">
              {num(resumoAnalise.pctProjecaoMes, 0)}% do teto
              {resumoAnalise.estouroProjetadoMes > 0
                ? ` · +${num(resumoAnalise.estouroProjetadoMes)}`
                : ''}
              {resumoAnalise.projecaoFonte
                ? ` · ${labelFonteProjecao(resumoAnalise.projecaoFonte)}`
                : ''}
              {resumoAnalise.usaPlanoOperacional
                ? ''
                : ` · ritmo desenv. ~${num(resumoAnalise.ritmoSemanalMedio, 0)}/sem`}
            </span>
          </article>
        </div>

        {semanaSel && (
          <p className="hint">
            Semana selecionada no import: <strong>{semanaSel.periodo}</strong> ·{' '}
            {totalSemanaSel > 0 ? (
              <>
                <strong>{num(totalSemanaSel)}</strong> cestas lançadas
              </>
            ) : (
              'sem lançamento'
            )}
          </p>
        )}
      </section>

      <details className="panel monitor-section monitor-details">
        <summary>Saúde avançada e empenho</summary>
        <MonitorSaudePanel
          data={data}
          resumo={resumoAnalise}
          dashboard={decisionDashboard}
        />
      </details>

      <details className="panel monitor-section monitor-details">
        <summary>Evolução do saldo no banco</summary>
        <MonitorSaldoEvolucao data={data} />
      </details>

      {!readOnly && resumoAnalise.cicloAtual != null && (
        <details className="panel monitor-section monitor-details">
          <summary>Ajustes do período {resumoAnalise.cicloAtual} (fixos / perdas)</summary>
          <MonitorAjustesOperacionais
            data={data}
            cicloAtual={resumoAnalise.cicloAtual}
            onUpdate={onUpdate}
          />
        </details>
      )}

      <details className="panel monitor-section monitor-details">
        <summary>
          Grade civil completa — {resumoTabela.mes} (referência antiga, só consulta)
        </summary>
        <p className="hint">
          Tabela legada por mês civil. Para o dia a dia use o seletor{' '}
          <strong>semana qua–ter</strong> e o PDF acima. Cotas atuais = plano
          264/semana; estudo histórico {PERIODO_REFERENCIA_INICIO}–
          {PERIODO_REFERENCIA_FIM}.
        </p>
        <PrintableTable
          title={`Distribuição por setor — ${resumoTabela.mes}`}
          subtitle={`Lançamento S${semanaEdit} · grade civil · KPIs no período operacional (${resumoAnalise.labelCiclo ?? ''})`}
          wrapClassName="emerg-monitor-table-wrap"
          orientation="landscape"
        >
          <table className="emerg-monitor-table">
            <thead>
              <tr>
                <th rowSpan={2}>Equipamento</th>
                <th rowSpan={2} title="Rateio ref. ao mês civil da grade — KPIs usam o período operacional">
                  Teto grade
                </th>
                <th rowSpan={2}>Cota/sem</th>
                {Array.from({ length: resumoTabela.semanasNoMes }, (_, i) => i + 1).map(
                  (w) => (
                    <th
                      key={w}
                      colSpan={1}
                      className={
                        w < resumoTabela.semanaInicioControle
                          ? 'sem-head sem-head-pre'
                          : 'sem-head'
                      }
                    >
                      {semanaCabecalho(w).titulo}
                      <span className="sem-range">
                        {semanaCabecalho(w).periodo}
                        {w < resumoTabela.semanaInicioControle ? ' · pré' : ''}
                      </span>
                    </th>
                  ),
                )}
                <th rowSpan={2}>Total</th>
                <th rowSpan={2}>% grade</th>
                <th rowSpan={2}>% sem. {semanaEdit}</th>
                <th rowSpan={2} title="Se o ritmo das semanas de controle continuar">
                  % proj. grade
                </th>
                <th rowSpan={2}>Status</th>
              </tr>
            </thead>
            <tbody>
              {resumoTabela.familias.map((fam) => {
                const metaFam = fam.itens.reduce((s, e) => s + e.metaMensal, 0);
                const envFam = fam.itens.reduce((s, e) => s + e.totalEnviado, 0);
                const colSpan = 3 + resumoTabela.semanasNoMes;
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
              {!resumoTabela.familias.length &&
                resumoTabela.equipamentos.map((eq) => renderEquipRow(eq))}
            </tbody>
            <tfoot>
              <tr>
                <td>
                  <strong>TOTAL</strong>
                </td>
                <td>{num(resumoTabela.metaMesTotal)}</td>
                <td>—</td>
                {Array.from({ length: resumoTabela.semanasNoMes }, (_, i) => i + 1).map(
                  (w) => (
                    <td key={w}>
                      <strong>
                        {num(
                          resumoTabela.equipamentos.reduce(
                            (s, e) => s + (e.semanas[w] ?? 0),
                            0,
                          ),
                        )}
                      </strong>
                    </td>
                  ),
                )}
                <td>
                  <strong>{num(resumoTabela.enviadoMesTotal)}</strong>
                </td>
                <td>{num(resumoTabela.pctMes, 0)}%</td>
                <td>{num(resumoTabela.pctLimiteSemana, 0)}%</td>
                <td
                  className={
                    resumoTabela.pctProjecaoMes > 100
                      ? 'cell-over-limit'
                      : resumoTabela.pctProjecaoMes > 92
                        ? 'cell-projecao-alerta'
                        : ''
                  }
                >
                  {num(resumoTabela.pctProjecaoMes, 0)}%
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </PrintableTable>
        <p className="hint">
          Envios reais por semana (colunas verdes = já lançadas). Ao mudar a semana no seletor, o
          histórico permanece.           KPIs e mitigação usam o <strong>período operacional</strong> (4 semanas
          qua–ter, teto 1.150), não o mês civil desta grade.
        </p>
      </details>

      <details className="panel monitor-section monitor-details">
        <summary>
          Setup histórico {PERIODO_REFERENCIA_INICIO}–{PERIODO_REFERENCIA_FIM} (rateio / Coderp)
        </summary>
        <p className="hint">
          Importação do PDF longo de requisição — base do estudo que definiu as
          cotas por equipamento. Use uma vez; o fluxo semanal é o PDF RME acima.
        </p>
        {!readOnly && (
          <CoderpPdfImport data={data} onApply={(next) => onUpdate(next)} />
        )}
        {resumoTabela.allocation && (
          <>
          <p className="hint">
            Cotas orientativas ao teto {num(TETO_MENSAL_OPERACIONAL)}/período.
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
                {resumoTabela.allocation.linhas.map((l) => {
                  const env =
                    resumoTabela.equipamentos.find((e) => e.servicoId === l.servicoId)
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
          </>
        )}
      </details>

    </div>
  );
}
