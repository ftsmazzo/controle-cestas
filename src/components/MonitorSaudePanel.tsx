import { useMemo } from 'react';
import {
  buildSaudeDistribuicao,
  MESES_SAUDE_IDEAIS,
  type SaudeDistribuicao,
  type SaudeNivel,
} from '@shared/monitorSaude';
import type { MonitoramentoResumo } from '@shared/emergencyMonitoring';
import type { ServicesPayload } from '@shared/serviceTypes';
import type { DashboardState } from '@shared/types';
import './MonitorSaudePanel.css';

function num(n: number | null | undefined, dec = 1): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

const FONTE_RATEIO_LABEL: Record<SaudeDistribuicao['consumoFonteRateio'], string> = {
  previsao: 'previsão (série limpa)',
  historico: 'média histórico recente',
  meta: 'limite emergencial',
  ritmo: 'ritmo observado',
};

function nivelGeral(saude: SaudeDistribuicao): SaudeNivel {
  if (saude.estouroMes > 0 || saude.estouroSemana > 0) return 'vermelho';
  if (saude.estouroProjetadoMes > 0 || saude.empenhoAcabaAntesDoPeriodo) {
    return 'vermelho';
  }
  if (saude.nivelLimiteMes === 'vermelho' || saude.nivelLimiteSemana === 'vermelho') {
    return 'vermelho';
  }
  if (
    saude.pctProjecaoMes > 92 ||
    saude.nivelLimiteMes === 'amarelo' ||
    saude.nivelLimiteSemana === 'amarelo'
  ) {
    return 'amarelo';
  }
  return saude.nivelEstoque;
}

interface Props {
  data: ServicesPayload;
  resumo: MonitoramentoResumo;
  dashboard?: DashboardState | null;
}

export default function MonitorSaudePanel({ data, resumo, dashboard }: Props) {
  const saude = useMemo(
    () => buildSaudeDistribuicao(data, resumo, dashboard),
    [data, resumo, dashboard],
  );

  const nivel = nivelGeral(saude);

  const pctBar =
    saude.autonomiaMeses != null && saude.duracaoMesesEmpenho > 0
      ? Math.min(100, (saude.autonomiaMeses / saude.duracaoMesesEmpenho) * 100)
      : 0;

  return (
    <section className={`panel monitor-saude monitor-saude--${nivel}`}>
      <div className="monitor-saude-head">
        <h3>Saúde da distribuição</h3>
        <span className={`monitor-saude-badge monitor-saude-badge--${nivel}`}>
          Índice {saude.indiceSaudeGeral}%
        </span>
      </div>
      <p className="hint monitor-saude-lead">{saude.resumoDecisao}</p>

      {(saude.autonomiaSemanas != null || saude.pctProjecaoMes > 0) && (
        <div className={`monitor-saude-prazo monitor-saude-prazo--${nivel}`}>
          <h4>Prazo para decisão (empenho · 4 meses)</h4>
          {saude.autonomiaSemanas != null && (
            <p className="monitor-saude-prazo-destaque">
              <strong>
                Com ritmo ~{num(saude.ritmoReferencia, 0)}/sem, o empenho dura ~
                {num(saude.autonomiaSemanas, 1)} semana(s)
              </strong>
              {saude.autonomiaDias != null && <> (~{saude.autonomiaDias} dias)</>}
              {saude.ritmoSemanaAtual > saude.ritmoSemanalConsumo && (
                <>
                  {' '}
                  (semana atual: {num(saude.ritmoSemanaAtual, 0)}/sem)
                </>
              )}
              <span className="monitor-saude-prazo-sub">
                {' '}
                · {num(saude.cestasDisponiveis, 0)} cestas restantes no período
              </span>
              {saude.empenhoAcabaAntesDoPeriodo && (
                <span className="monitor-saude-prazo-alerta">
                  {' '}
                  — acaba antes do fim dos {saude.duracaoMesesEmpenho} meses (faltam ~
                  {num(saude.semanasPeriodoRestantes, 0)} sem. no contrato)
                </span>
              )}
            </p>
          )}
          {saude.pctProjecaoMes > 0 && (
            <p className="monitor-saude-prazo-proj">
              Projeção fim do mês:{' '}
              <strong>{num(saude.projecaoMesTotal, 0)}</strong> cestas (
              {num(saude.pctProjecaoMes, 0)}% do teto)
              {saude.estouroProjetadoMes > 0 && (
                <>
                  {' '}
                  · estouro previsto <strong>+{num(saude.estouroProjetadoMes, 0)}</strong>
                </>
              )}
              {saude.semanaProjetadaEstouro != null && (
                <>
                  {' '}
                  · teto estoura na <strong>S{saude.semanaProjetadaEstouro}</strong>
                </>
              )}
            </p>
          )}
        </div>
      )}

      <div className="monitor-saude-autonomia">
        <div className="monitor-saude-autonomia-labels">
          <span>0</span>
          <span className="monitor-saude-meta-line">
            Duração do empenho ({saude.duracaoMesesEmpenho} meses)
          </span>
          <span>{saude.duracaoMesesEmpenho} m</span>
        </div>
        <div
          className="monitor-saude-track"
          role="img"
          aria-label="Meses de empenho ao ritmo atual"
        >
          <div
            className={`monitor-saude-fill monitor-saude-fill--${nivel}`}
            style={{ width: `${pctBar}%` }}
          />
        </div>
        <p className="monitor-saude-autonomia-valor">
          {saude.autonomiaMeses != null ? (
            <>
              <strong>{num(saude.autonomiaMeses)}</strong> meses ao ritmo atual
              <span className="monitor-saude-gap">
                {' '}
                (período:{' '}
                {num(saude.semanasPeriodoTotal - saude.semanasPeriodoRestantes, 0)} sem.
                decorridas ·{' '}
                {num(saude.semanasPeriodoRestantes, 0)} restantes de{' '}
                {num(saude.semanasPeriodoTotal, 0)})
              </span>
            </>
          ) : (
            'Lance envios semanais para calcular autonomia ao ritmo'
          )}
        </p>
      </div>

      <div className="monitor-saude-grid">
        <article className="monitor-saude-card">
          <span className="monitor-saude-card-label">Saldo Banco</span>
          <strong>{num(saude.saldoAtual, 0)}</strong>
          <span className="monitor-saude-card-sub">cestas</span>
        </article>
        <article
          className={`monitor-saude-card${saude.estouroMes > 0 ? ' monitor-saude-card--over' : ''}`}
        >
          <span className="monitor-saude-card-label">Teto mensal</span>
          <strong>{num(saude.limiteMensal, 0)}</strong>
          <span className="monitor-saude-card-sub">
            uso {num(saude.pctUsoLimiteMes, 0)}% · {num(saude.enviadoMes, 0)} enviadas
            {saude.estouroMes > 0
              ? ` · estouro +${num(saude.estouroMes, 0)}`
              : ` · margem ${num(saude.margemMes, 0)}`}
          </span>
        </article>
        <article
          className={`monitor-saude-card${saude.estouroSemana > 0 ? ' monitor-saude-card--over' : ''}`}
        >
          <span className="monitor-saude-card-label">
            Teto semana {resumo.semanaAtual}
          </span>
          <strong>{num(saude.limiteSemanal, 0)}</strong>
          <span className="monitor-saude-card-sub">
            uso {num(saude.pctUsoLimiteSemana, 0)}% · {num(saude.enviadoSemana, 0)} enviadas
          </span>
        </article>
        <article
          className={`monitor-saude-card${saude.estouroProjetadoMes > 0 ? ' monitor-saude-card--over' : ''}`}
        >
          <span className="monitor-saude-card-label">Projeção fim do mês</span>
          <strong>{num(saude.projecaoMesTotal, 0)}</strong>
          <span className="monitor-saude-card-sub">
            {num(saude.pctProjecaoMes, 0)}% do teto
            {saude.semanaProjetadaEstouro != null
              ? ` · estouro S${saude.semanaProjetadaEstouro}`
              : saude.estouroProjetadoMes > 0
                ? ` · +${num(saude.estouroProjetadoMes, 0)}`
                : ''}
          </span>
        </article>
        <article className="monitor-saude-card">
          <span className="monitor-saude-card-label">Ref. rateio</span>
          <strong>{num(saude.consumoReferenciaRateio, 0)}</strong>
          <span className="monitor-saude-card-sub">
            /mês · {FONTE_RATEIO_LABEL[saude.consumoFonteRateio]} (só cotas)
          </span>
        </article>
        <article className="monitor-saude-card">
          <span className="monitor-saude-card-label">Empenho período</span>
          <strong>{num(saude.empenho.restante, 0)}</strong>
          <span className="monitor-saude-card-sub">
            restantes de {num(saude.empenho.totalEmpenho, 0)} · usado{' '}
            {num(saude.empenho.totalConsumido, 0)}
          </span>
        </article>
      </div>

      <div className="monitor-saude-empenho">
        <h4>Empenho {saude.empenho.totalEmpenho.toLocaleString('pt-BR')} cestas</h4>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Limite</th>
                <th>Enviado</th>
                <th>Saldo mês</th>
              </tr>
            </thead>
            <tbody>
              {saude.empenho.meses.map((m) => (
                <tr key={m.mes}>
                  <td>{m.mes}</td>
                  <td>{num(m.metaMensal, 0)}</td>
                  <td>{num(m.enviado, 0)}</td>
                  <td className={m.saldoMes < 0 ? 'empenho-over' : ''}>
                    {m.saldoMes < 0
                      ? `+${num(Math.abs(m.saldoMes), 0)} estouro`
                      : num(m.saldoMes, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="monitor-saude-acoes">
        <h4>Controle desta semana</h4>
        <ul>
          {saude.acoesSemana.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>

      <div className="monitor-saude-legend">
        <span>
          <i className="dot dot-estoque" /> Empenho (35%): meses ao ritmo ÷{' '}
          {saude.duracaoMesesEmpenho} meses do contrato
        </span>
        <span>
          <i className="dot dot-ritmo" /> Teto mês (25%) · projeção (15%) · semana S
          {resumo.semanaAtual} (15%) · empenho (10%)
        </span>
      </div>
    </section>
  );
}
