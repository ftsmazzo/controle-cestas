import { Fragment, useMemo } from 'react';
import {
  buildCenarioMitigacao,
  totaisPorSemana,
  type MitigacaoEquipamentoRow,
  type MitigacaoImpacto,
} from '@shared/cenarioMitigacao';
import type { ServicesPayload } from '@shared/serviceTypes';
import { Scale, Sparkles, TrendingDown } from 'lucide-react';
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

function renderUnitRow(r: MitigacaoEquipamentoRow, semanaCount: number) {
  return (
    <tr key={r.servicoId} className={`mit-row mit-row--${r.impacto}`}>
      <td className="mit-cell-nome mit-cell-unidade">{r.servicoNome}</td>
      <td>{num(r.enviadoAteAgora)}</td>
      <td>{num(r.cotaMensal)}</td>
      <td className="mit-cell-muted" title="Teto por semana (cota ÷ semanas do mês)">
        {r.cotaSemanal > 0 ? num(r.cotaSemanal) : '—'}
      </td>
      <td className="mit-cell-muted">{num(r.espacoAteCota)}</td>
      {Array.from({ length: semanaCount }, (_, i) => (
        <td key={i}>
          <strong>{num(r.propostasSemana[i]?.cestas ?? 0)}</strong>
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

  const maxBar = cenario.tetoComGordura;

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
          <span className="mit-badge">
            Fechando {cenario.mesFechamento} · base S{cenario.semanaBaseRitmo}
          </span>
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
              <strong>{num(cenario.tetoOperacional)}</strong> teto −{' '}
              <strong>{num(cenario.enviadoMesAteAgora)}</strong> já gasto ={' '}
              <strong>{num(cenario.saldoRestante1150)}</strong> restantes
              {cenario.gorduraNoPlano > 0 && (
                <>
                  {' '}
                  + <strong>{num(cenario.gorduraNoPlano)}</strong> gordura do período
                </>
              )}{' '}
              → <strong>{num(cenario.orcamentoDistribuir)}</strong> a distribuir nas
              próximas {cenario.semanasPlanejadas.length} semana(s)
            </p>
            {cenario.demandaInercialTotal > cenario.orcamentoDistribuir && (
              <p className="mit-formula-warn">
                Ritmo atual pediria {num(cenario.demandaInercialTotal)} — redistribuição
                ponderada (todos recebem dentro da cota semanal/mensal; cortes maiores em
                quem mais superou média, cota e semana: −{num(cenario.corteTotal)} vs
                ritmo).
              </p>
            )}
          </div>

          <div className="mit-summary-grid">
            <article className="mit-summary-card mit-summary-card--inercial">
              <span className="mit-summary-label">Já gasto ({cenario.mesFechamento})</span>
              <p className="mit-summary-value">{num(cenario.enviadoMesAteAgora)}</p>
              <span className="mit-summary-hint">
                Desde S{cenario.semanaInicioControle} no controle
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--proposta">
              <span className="mit-summary-label">
                <Sparkles size={14} aria-hidden /> A distribuir (2 sem.)
              </span>
              <p className="mit-summary-value">{num(cenario.orcamentoDistribuir)}</p>
              <span className="mit-summary-hint">
                {num(cenario.saldoRestante1150)} até 1.150 +{' '}
                {num(cenario.gorduraNoPlano)} gordura período
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--fechamento">
              <span className="mit-summary-label">Fechamento do mês</span>
              <p className="mit-summary-value">{num(cenario.fechamentoMesProjetado)}</p>
              <span className="mit-summary-hint">
                {num(cenario.enviadoMesAteAgora)} + {num(cenario.propostaTotal)} nas 2 sem.
                {cenario.gorduraUsadaNoPlano > 0
                  ? ` · gordura +${num(cenario.gorduraUsadaNoPlano)}`
                  : ''}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--saldo">
              <span className="mit-summary-label">Ritmo continuaria pedindo</span>
              <p className="mit-summary-value">{num(cenario.demandaInercialTotal)}</p>
              <span className="mit-summary-hint">
                Fecharia em {num(cenario.fechamentoInercial)} — referência
              </span>
            </article>
          </div>

          <div className="mit-bar-chart">
            <div className="mit-bar-labels">
              <span>0</span>
              <span>{num(cenario.tetoOperacional)} operacional</span>
              <span>{num(cenario.tetoComGordura)} contrato</span>
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
              {totaisSem.map((t) => (
                <article key={t.semana} className="mit-week-card">
                  <span className="mit-week-label">
                    S{t.semana} · {t.periodo}
                  </span>
                  <p className="mit-week-value">{num(t.total)}</p>
                  <span className="mit-week-hint">cestas propostas</span>
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

          <div className="table-wrap mit-table-wrap">
            <table className="mit-table">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Enviado</th>
                  <th>Cota mês</th>
                  <th>Cota/sem</th>
                  <th>Espaço cota</th>
                  {cenario.periodosSemana.map((p, i) => (
                    <th key={i}>
                      {p}
                    </th>
                  ))}
                  <th>Ritmo pediria</th>
                  <th>Proposta</th>
                  <th>Corte</th>
                  <th>% acima média</th>
                  <th>Fecha mês</th>
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
                              renderUnitRow(r, cenario.periodosSemana.length),
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
          </div>

          <p className="hint mit-foot">
            Orçamento = saldo até 1.150 + gordura do período (até 200). Cada equipamento
            recebe uma fatia ponderada (participação histórica, atenuada por excessos vs
            média, cota mensal e cota semanal). Nenhuma semana ultrapassa a cota/sem; o
            total mensal respeita o espaço restante na cota.
          </p>
        </>
      )}
    </section>
  );
}
