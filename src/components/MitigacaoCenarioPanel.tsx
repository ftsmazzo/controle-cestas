import { Fragment, useMemo } from 'react';
import {
  buildCenarioMitigacao,
  totaisPorSemana,
  type MitigacaoEquipamentoRow,
  type MitigacaoImpacto,
} from '@shared/cenarioMitigacao';
import type { ServicesPayload } from '@shared/serviceTypes';
import { CheckCircle2, Scale, Sparkles, TrendingDown } from 'lucide-react';
import PrintableTable from './ui/PrintableTable';
import './MitigacaoCenarioPanel.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function impactoLabel(i: MitigacaoImpacto): string {
  if (i === 'forte') return 'Forte';
  if (i === 'moderado') return 'Moderado';
  if (i === 'leve') return 'Leve';
  return '—';
}

interface Props {
  payload: ServicesPayload;
}

function barPct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.min(100, (value / max) * 100);
}

function renderUnitRow(
  r: MitigacaoEquipamentoRow,
  semanaCount: number,
  semanasLancadas: boolean[],
) {
  return (
    <tr key={r.servicoId} className={`mit-row mit-row--${r.impacto}`}>
      <td className="mit-cell-nome mit-cell-unidade">{r.servicoNome}</td>
      <td>{num(r.enviadoAteAgora)}</td>
      <td>{num(r.cotaMensal)}</td>
      <td
        className="mit-cell-muted"
        title={
          r.cotaMensalUnica
            ? 'Cota mensal única — entra no teto do ciclo (94), sem rateio semanal'
            : 'Teto por semana (cota ÷ 4 sem. operacionais)'
        }
      >
        {r.cotaMensalUnica
          ? r.cotaMensal > 0
            ? `${num(r.cotaMensal)} mês`
            : '—'
          : r.cotaSemanal > 0
            ? num(r.cotaSemanal)
            : '—'}
      </td>
      <td className="mit-cell-muted">{num(r.espacoAteCota)}</td>
      {Array.from({ length: semanaCount }, (_, i) => (
        <td key={i} className={r.cotaMensalUnica ? 'mit-cell-muted' : undefined}>
          {r.cotaMensalUnica ? (
            '—'
          ) : (
            <strong
              className={semanasLancadas[i] ? 'mit-lancado' : undefined}
              title={
                semanasLancadas[i]
                  ? 'Semana já lançada no Monitor'
                  : 'Proposta / a lançar'
              }
            >
              {num(r.propostasSemana[i]?.cestas ?? 0)}
            </strong>
          )}
        </td>
      ))}
      <td className="mit-cell-muted">{num(r.demandaInercial2sem)}</td>
      <td>
        <strong className="mit-proposta">{num(r.proposta2sem)}</strong>
      </td>
      <td className={r.corte2sem > 0 ? 'mit-corte' : 'mit-cell-muted'}>
        {r.corte2sem > 0 ? `−${num(r.corte2sem)}` : '—'}
      </td>
      <td
        className={
          r.pctAcimaMedia > 0 ? 'mit-over mit-cell-prioridade' : 'mit-cell-muted'
        }
        title="Excesso vs média histórica mensal (já enviado)"
      >
        {r.mediaHistorica > 0 && r.pctAcimaMedia > 0
          ? `+${num(r.pctAcimaMedia, 0)}%`
          : '—'}
      </td>
      <td>{num(r.fechamentoMes)}</td>
      <td className={r.vsCotaMesPct > 100 ? 'mit-over' : ''}>
        {r.cotaMensal > 0 ? `${num(r.vsCotaMesPct, 0)}%` : '—'}
      </td>
      <td>
        {r.impacto !== 'nenhum' ? (
          <span className={`mit-impact mit-impact--${r.impacto}`}>
            {impactoLabel(r.impacto)}
          </span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

export default function MitigacaoCenarioPanel({ payload }: Props) {
  const cenario = useMemo(() => buildCenarioMitigacao(payload, 2), [payload]);
  const totaisSem = useMemo(() => totaisPorSemana(cenario), [cenario]);

  const maxBar = cenario.tetoMaximoCiclo ?? cenario.tetoComGordura;
  const usaPlanoJun =
    cenario.cicloAtual === 1 &&
    cenario.planoJunS1Total > 0 &&
    cenario.entregaInvertidaJun;

  return (
    <section className="panel mit-panel">
      <header className="mit-head">
        <div>
          <h2 className="mit-title">
            <Scale size={20} aria-hidden />
            Cenário de mitigação — próximas {cenario.semanasPlanejadas.length || 2}{' '}
            semana(s)
          </h2>
          <p className="mit-sub">{cenario.resumoCurto}</p>
        </div>
        <div className="mit-badges">
          <span className="mit-badge">{cenario.labelCiclo}</span>
          <span className="mit-badge">
            Referência {cenario.semanaReferenciaLabel}
          </span>
          {usaPlanoJun ? (
            <span
              className="mit-badge mit-badge--gordura"
              title="Plano aprovado com gordura: Jun S1 valores maiores, Jun S2 corte drástico"
            >
              Plano Jun S1 {num(cenario.planoJunS1Total)} · S2{' '}
              {num(cenario.planoJunS2Total)}
            </span>
          ) : (
            cenario.entregaInvertidaJun && (
              <span
                className="mit-badge mit-badge--gordura"
                title="Volumes Jun S1/S2 trocados conforme entrega real"
              >
                Jun S1↔S2 invertido
              </span>
            )
          )}
          <span className="mit-badge mit-badge--gordura">
            Gordura período:{' '}
            <strong>
              {num(cenario.gorduraPeriodoRestante)}/{num(cenario.gorduraPeriodoTotal)}
            </strong>
          </span>
        </div>
      </header>

      {!cenario.temDados ? (
        <div className="mit-empty-box">
          <p className="hint mit-empty">
            {cenario.mensagemAjuda || cenario.resumoCurto}
          </p>
          {cenario.ultimoLancamentoLabel && (
            <p className="hint mit-empty-meta">
              Último lançamento no banco: <strong>{cenario.ultimoLancamentoLabel}</strong>
            </p>
          )}
          {cenario.motivoVazio === 'sem_lancamentos' && (
            <p className="hint mit-empty-meta">
              Admin → <a href="/admin/monitoramento">Monitor</a> → importar PDF →{' '}
              <strong>Salvar</strong> → voltar aqui e pressionar F5.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mit-formula-box">
            <p>
              <strong>{num(cenario.tetoMaximoCiclo)}</strong> teto do ciclo
              {cenario.cicloAtual === 1 ? ' (1.150 + 200 gordura)' : ''} −{' '}
              <strong>{num(cenario.reservaCotasFixas)}</strong> fixas (SAICA/WARAOS/Mãos
              Dadas) − <strong>{num(cenario.enviadoCicloAteAgora)}</strong> já gasto ={' '}
              <strong>{num(cenario.saldoRestante1150)}</strong> saldo ciclo ·{' '}
              <strong>{num(cenario.orcamentoFlexivel)}</strong> flexível restante →{' '}
              <strong>{num(cenario.orcamentoDistribuir)}</strong> nas próximas{' '}
              {cenario.semanasPlanejadas.length} semana(s)
              {usaPlanoJun ? ' (plano aprovado Jun)' : ''}
            </p>
            {!usaPlanoJun &&
              cenario.demandaInercialTotal > cenario.orcamentoDistribuir && (
              <p className="mit-formula-warn">
                Normal pediria {num(cenario.demandaInercialTotal)} — com{' '}
                {num(cenario.orcamentoDistribuir)} reduzimos o prejuízo, mas ainda faltam{' '}
                {num(cenario.deficitVsInercial)} vs ritmo. Passo 1: −
                {num(cenario.reducaoSemanaPressaoPct)}% na semana de maior pressão
                {cenario.semanaPressaoLabel
                  ? ` (${cenario.semanaPressaoLabel})`
                  : ''}
                . Passo 2 (se precisar): corte extra em quem superou a média.
              </p>
            )}
          </div>

          {usaPlanoJun && cenario.conformidadePlano && (
            <div
              className={`mit-conformidade ${
                cenario.conformidadePlano.conformeGeral
                  ? 'mit-conformidade--ok'
                  : 'mit-conformidade--warn'
              }`}
            >
              <CheckCircle2 size={18} aria-hidden />
              <p>{cenario.conformidadePlano.mensagem}</p>
              <ul className="mit-conformidade-list">
                {cenario.conformidadePlano.semanas.map((s) => (
                  <li key={`${s.mes}-S${s.semana}`}>
                    <strong>{s.label}</strong>
                    {s.jaLancada ? (
                      <>
                        {' '}
                        lançado {num(s.lancadoFlex)} · plano {num(s.planejadoFlex)}
                        {s.conforme ? ' ✓' : ` (Δ ${num(s.delta)})`}
                      </>
                    ) : (
                      <> · plano {num(s.planejadoFlex)} (a lançar)</>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mit-summary-grid">
            <article className="mit-summary-card mit-summary-card--inercial">
              <span className="mit-summary-label">
                Acumulado no ciclo até {cenario.semanaReferenciaLabel}
              </span>
              <p className="mit-summary-value">{num(cenario.enviadoCicloAteAgora)}</p>
              <span className="mit-summary-hint">
                {cenario.labelCiclo} · ponto zero {cenario.semanaInicioControleLabel}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--proposta">
              <span className="mit-summary-label">
                <Sparkles size={14} aria-hidden />
                {usaPlanoJun ? 'A lançar (sem. restantes)' : 'A distribuir (2 sem.)'}
              </span>
              <p className="mit-summary-value">
                {num(usaPlanoJun ? cenario.propostaFuturaTotal : cenario.orcamentoDistribuir)}
              </p>
              <span className="mit-summary-hint">
                {usaPlanoJun
                  ? `Saldo ciclo ${num(cenario.saldoCicloAposPlano)} até teto ${num(cenario.tetoMaximoCiclo)}`
                  : `${num(cenario.saldoRestante1150)} saldo flexível no ciclo`}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--fechamento">
              <span className="mit-summary-label">Fechamento do ciclo</span>
              <p className="mit-summary-value">
                {num(cenario.fechamentoCicloProjetado)}
              </p>
              <span className="mit-summary-hint">
                {num(cenario.enviadoMesAteAgora)} enviado
                {cenario.propostaFuturaTotal > 0
                  ? ` + ${num(cenario.propostaFuturaTotal)} a lançar`
                  : ''}{' '}
                / teto {num(cenario.tetoMaximoCiclo)}
                {cenario.dentroDoTetoCiclo ? ' ✓' : ' ⚠'}
              </span>
            </article>
            <article
              className={`mit-summary-card mit-summary-card--saldo ${
                usaPlanoJun ? 'mit-summary-card--conforme' : ''
              }`}
            >
              <span className="mit-summary-label">
                {usaPlanoJun ? 'Controle nos trilhos' : 'Ainda falta vs ritmo'}
              </span>
              <p className="mit-summary-value">
                {usaPlanoJun
                  ? cenario.dentroDoTetoCiclo
                    ? 'Sim'
                    : 'Atenção'
                  : num(cenario.deficitVsInercial)}
              </p>
              <span className="mit-summary-hint">
                {usaPlanoJun
                  ? `Gordura ciclo 1: ${num(cenario.gorduraUsadaNoPlano)} de 200 usada`
                  : `Ritmo pediria ${num(cenario.demandaInercialTotal)} nas 2 sem.`}
              </span>
            </article>
          </div>

          <div className="mit-bar-chart">
            <div className="mit-bar-labels">
              <span>0</span>
              <span>{num(cenario.tetoOperacional)} base</span>
              <span>{num(cenario.tetoMaximoCiclo)} teto ciclo</span>
            </div>
            <div className="mit-bar-track">
              <div
                className="mit-bar-zone mit-bar-zone--operacional"
                style={{ width: `${barPct(cenario.tetoOperacional, maxBar)}%` }}
              />
              <div
                className="mit-bar-zone mit-bar-zone--gordura"
                style={{
                  left: `${barPct(cenario.tetoOperacional, maxBar)}%`,
                  width: `${barPct(cenario.gorduraMesDisponivel, maxBar)}%`,
                }}
              />
              <div
                className="mit-bar-marker mit-bar-marker--inercial"
                style={{ left: `${barPct(cenario.fechamentoInercial, maxBar)}%` }}
                title={`Inercial: ${num(cenario.fechamentoInercial)}`}
              />
              <div
                className="mit-bar-marker mit-bar-marker--proposta"
                style={{
                  left: `${barPct(cenario.fechamentoMesProjetado, maxBar)}%`,
                }}
                title={`Proposta: ${num(cenario.fechamentoMesProjetado)}`}
              />
              <div
                className="mit-bar-marker mit-bar-marker--atual"
                style={{ left: `${barPct(cenario.enviadoMesAteAgora, maxBar)}%` }}
                title={`Atual: ${num(cenario.enviadoMesAteAgora)}`}
              />
            </div>
            <div className="mit-bar-legend">
              <span>
                <i className="mit-dot mit-dot--atual" /> Enviado
              </span>
              <span>
                <i className="mit-dot mit-dot--proposta" /> Proposta
              </span>
              <span>
                <i className="mit-dot mit-dot--inercial" /> Inercial
              </span>
              <span>
                <i className="mit-dot mit-dot--gordura" /> Gordura ({num(cenario.gorduraMesDisponivel)})
              </span>
            </div>
          </div>

          {totaisSem.length > 0 && (
            <div className="mit-week-cards">
              {totaisSem.map((t, i) => (
                <article
                  key={t.semana}
                  className={
                    i === cenario.semanaPressaoIdx
                      ? 'mit-week-card mit-week-card--pressao'
                      : 'mit-week-card'
                  }
                >
                  <span className="mit-week-label">
                    {t.label}
                    {i === cenario.semanaPressaoIdx ? ' · −55%' : ''}
                  </span>
                  <p className="mit-week-value">{num(t.total)}</p>
                  <span className="mit-week-hint">{t.periodo.split('(')[1]?.replace(')', '') ?? t.periodo}</span>
                </article>
              ))}
              <article className="mit-week-card mit-week-card--corte">
                <span className="mit-week-label">
                  <TrendingDown size={14} aria-hidden /> Economia
                </span>
                <p className="mit-week-value">{num(cenario.corteTotal)}</p>
                <span className="mit-week-hint">vs ritmo atual</span>
              </article>
            </div>
          )}

          <PrintableTable
            title="Plano de mitigação por equipamento"
            subtitle={`Referência ${cenario.semanaReferenciaLabel} · orçamento ${num(cenario.orcamentoDistribuir)} cestas nas próximas semanas`}
            wrapClassName="mit-table-wrap"
            orientation="landscape"
          >
            <table className="mit-table">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Enviado</th>
                  <th>Cota mês</th>
                  <th>Cota/sem</th>
                  <th>Espaço cota</th>
                  {cenario.semanasPlanejadasLabels.map((label, i) => (
                    <th key={i} title={cenario.periodosSemana[i]}>
                      {label}
                    </th>
                  ))}
                  <th>Ritmo pediria</th>
                  <th>Proposta</th>
                  <th>Corte</th>
                  <th>% acima média</th>
                  <th>Acum. pós</th>
                  <th>% cota</th>
                  <th>Impacto</th>
                </tr>
              </thead>
              <tbody>
                {cenario.familias.map((fam) => {
                  const showChildren = fam.itens.length > 1;
                  const envFam = fam.itens.reduce((s, r) => s + r.enviadoAteAgora, 0);
                  const propFam = fam.itens.reduce((s, r) => s + r.proposta2sem, 0);
                  const inerFam = fam.itens.reduce(
                    (s, r) => s + r.demandaInercial2sem,
                    0,
                  );
                  const corteFam = fam.itens.reduce((s, r) => s + r.corte2sem, 0);
                  return (
                    <Fragment key={fam.familiaId}>
                      <tr className="mit-row-familia">
                        <td>
                          <strong>{fam.familiaNome}</strong>
                          <span className="mit-familia-sub">
                            {fam.itens.length} un. · proposta {num(propFam)}
                          </span>
                        </td>
                        <td>
                          <strong>{num(envFam)}</strong>
                        </td>
                        <td colSpan={3} />
                        {cenario.periodosSemana.map((_, i) => {
                          const t = fam.itens.reduce(
                            (sum, r) => sum + (r.propostasSemana[i]?.cestas ?? 0),
                            0,
                          );
                          return (
                            <td key={i}>
                              <strong>{num(t)}</strong>
                            </td>
                          );
                        })}
                        <td>{num(inerFam)}</td>
                        <td>
                          <strong>{num(propFam)}</strong>
                        </td>
                        <td className={corteFam > 0 ? 'mit-corte' : ''}>
                          {corteFam > 0 ? `−${num(corteFam)}` : '—'}
                        </td>
                        <td colSpan={4} />
                      </tr>
                      {showChildren
                        ? fam.itens
                            .sort(
                              (a, b) =>
                                b.pctAcimaMedia - a.pctAcimaMedia ||
                                b.corte2sem - a.corte2sem,
                            )
                            .map((r) =>
                              renderUnitRow(
                                r,
                                cenario.periodosSemana.length,
                                cenario.semanasAlvoLancadas,
                              ),
                            )
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>TOTAL</strong>
                  </td>
                  <td>
                    <strong>{num(cenario.enviadoMesAteAgora)}</strong>
                  </td>
                  <td colSpan={3} />
                  {totaisSem.map((t, i) => (
                    <td key={i}>
                      <strong>{num(t.total)}</strong>
                    </td>
                  ))}
                  <td>
                    <strong>{num(cenario.demandaInercialTotal)}</strong>
                  </td>
                  <td>
                    <strong>{num(cenario.propostaTotal)}</strong>
                  </td>
                  <td className={cenario.corteTotal > 0 ? 'mit-corte' : ''}>
                    {cenario.corteTotal > 0 ? (
                      <strong>−{num(cenario.corteTotal)}</strong>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td />
                  <td>
                    <strong>{num(cenario.fechamentoMesProjetado)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </PrintableTable>

          <p className="hint mit-foot">
            Controle por <strong>semana civil</strong> (Mai S3 = ponto zero). Orçamento
            das próximas semanas = saldo até 1.150 + gordura do período, rateado por
            cota/sem. −55% na semana de maior pressão; depois corte em quem superou a
            média.
          </p>
        </>
      )}
    </section>
  );
}
