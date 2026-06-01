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

function renderUnitRow(r: MitigacaoEquipamentoRow, semanas: number[]) {
  return (
    <tr key={r.servicoId} className={`mit-row mit-row--${r.impacto}`}>
      <td className="mit-cell-nome mit-cell-unidade">{r.servicoNome}</td>
      <td>{num(r.enviadoAteAgora)}</td>
      <td className="mit-cell-muted">{num(r.ritmoSemanal)}</td>
      {semanas.map((s) => {
        const p = r.propostasSemana.find((x) => x.semana === s);
        return (
          <td key={s}>
            <strong>{num(p?.cestas ?? 0)}</strong>
          </td>
        );
      })}
      <td>{num(r.demandaInercial2sem)}</td>
      <td>
        <strong className="mit-proposta">{num(r.proposta2sem)}</strong>
      </td>
      <td className={r.corte2sem > 0 ? 'mit-corte' : 'mit-cell-muted'}>
        {r.corte2sem > 0 ? `−${num(r.corte2sem)}` : '—'}
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
            {cenario.mes} · base S{cenario.semanaBaseRitmo}
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
        <p className="hint mit-empty">
          Importe PDFs semanais em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a> para montar a proposta.
        </p>
      ) : (
        <>
          <div className="mit-summary-grid">
            <article className="mit-summary-card mit-summary-card--inercial">
              <span className="mit-summary-label">Ritmo inercial (2 sem.)</span>
              <p className="mit-summary-value">{num(cenario.demandaInercialTotal)}</p>
              <span className="mit-summary-hint">
                Fecharia em {num(cenario.fechamentoInercial)}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--proposta">
              <span className="mit-summary-label">
                <Sparkles size={14} aria-hidden /> Proposta mitigada
              </span>
              <p className="mit-summary-value">{num(cenario.propostaTotal)}</p>
              <span className="mit-summary-hint">
                {cenario.corteTotal > 0
                  ? `Corte −${num(cenario.corteTotal)} vs inercial`
                  : 'Sem corte necessário'}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--fechamento">
              <span className="mit-summary-label">Fechamento do mês</span>
              <p className="mit-summary-value">{num(cenario.fechamentoMesProjetado)}</p>
              <span className="mit-summary-hint">
                Teto {num(cenario.tetoOperacional)}
                {cenario.gorduraUsadaNoPlano > 0
                  ? ` · gordura +${num(cenario.gorduraUsadaNoPlano)}`
                  : ''}
              </span>
            </article>
            <article className="mit-summary-card mit-summary-card--saldo">
              <span className="mit-summary-label">Saldo empenho pós-plano</span>
              <p className="mit-summary-value">{num(cenario.saldoEmpenhoPosPlano)}</p>
              <span className="mit-summary-hint">
                de {num(cenario.saldoEmpenhoRestante)} restantes
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
                  <th>Ritmo/sem</th>
                  {cenario.semanasPlanejadas.map((s) => (
                    <th key={s}>
                      S{s}
                      <span className="mit-th-range">
                        {cenario.periodosSemana[cenario.semanasPlanejadas.indexOf(s)]}
                      </span>
                    </th>
                  ))}
                  <th>Inercial</th>
                  <th>Proposta</th>
                  <th>Corte</th>
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
                        <td />
                        {cenario.semanasPlanejadas.map((s) => {
                          const t = fam.itens.reduce(
                            (sum, r) =>
                              sum +
                              (r.propostasSemana.find((p) => p.semana === s)?.cestas ?? 0),
                            0,
                          );
                          return (
                            <td key={s}>
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
                        <td colSpan={3} />
                      </tr>
                      {showChildren
                        ? fam.itens
                            .sort((a, b) => b.corte2sem - a.corte2sem)
                            .map((r) => renderUnitRow(r, cenario.semanasPlanejadas))
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
                  <td />
                  {totaisSem.map((t) => (
                    <td key={t.semana}>
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
                  <td>
                    <strong>{num(cenario.fechamentoMesProjetado)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="hint mit-foot">
            Proposta prioriza cortes em quem já estourou a cota mensal; unidades abaixo
            do teto recebem rateio proporcional ao histórico. Gordura de até{' '}
            {num(cenario.gorduraMesDisponivel)}/mês ({num(cenario.gorduraPeriodoTotal)}{' '}
            no período) só entra se necessário para reduzir impacto.
          </p>
        </>
      )}
    </section>
  );
}
