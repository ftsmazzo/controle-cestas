import { useMemo } from 'react';
import {
  buildSaudeDistribuicao,
  type SaudeDistribuicao,
  type SaudeNivel,
} from '@shared/monitorSaude';
import type { MonitoramentoResumo } from '@shared/emergencyMonitoring';
import { labelFonteProjecao } from '@shared/projecaoOperacionalCiclo';
import type { ServicesPayload } from '@shared/serviceTypes';
import type { DashboardState } from '@shared/types';
import PrintableTable from './ui/PrintableTable';
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
  if (saude.nivelCicloSemana === 'vermelho' || saude.nivelEmpenhoProcesso === 'vermelho') {
    return 'vermelho';
  }
  if (saude.nivelCicloSemana === 'amarelo' || saude.nivelEmpenhoProcesso === 'amarelo') {
    return 'amarelo';
  }
  return 'verde';
}

function NivelBadge({ nivel, label }: { nivel: SaudeNivel; label: string }) {
  return (
    <span className={`monitor-saude-badge monitor-saude-badge--${nivel}`}>{label}</span>
  );
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
  const empenhoProc = saude.saudeEmpenho;
  const pctBarEmpenho =
    empenhoProc && empenhoProc.semanasTotal > 0
      ? Math.min(100, (empenhoProc.semanasDecorridas / empenhoProc.semanasTotal) * 100)
      : 0;

  return (
    <section className={`panel monitor-saude monitor-saude--${nivel}`}>
      <div className="monitor-saude-head">
        <h3>Saúde da distribuição</h3>
        <span className={`monitor-saude-badge monitor-saude-badge--${nivel}`}>
          Índice {saude.indiceSaudeGeral}%
        </span>
      </div>

      <div className="monitor-saude-escopos">
        <article className={`monitor-saude-escopo monitor-saude-escopo--${saude.nivelCicloSemana}`}>
          <div className="monitor-saude-escopo-head">
            <h4>Ciclo e semana</h4>
            <NivelBadge nivel={saude.nivelCicloSemana} label="4 semanas · zera a cada ciclo" />
          </div>
          <p className="hint monitor-saude-lead">{saude.resumoDecisaoCiclo}</p>
          {resumo.novoCicloPlanejamento && (
            <p className="monitor-saude-escopo-nota">
              Novo ciclo em planejamento — contadores de ciclo/semana reiniciam no teto{' '}
              {num(saude.limiteMensal, 0)}.
            </p>
          )}
          {saude.pctProjecaoMes > 0 && (
            <p className="monitor-saude-prazo-proj">
              Projeção fim do {resumo.usaCicloOperacional ? 'ciclo' : 'mês'}:{' '}
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
              {resumo.projecaoFonte && (
                <>
                  {' '}
                  · base: {labelFonteProjecao(resumo.projecaoFonte)}
                </>
              )}
            </p>
          )}
        </article>

        <article
          className={`monitor-saude-escopo monitor-saude-escopo--${saude.nivelEmpenhoProcesso}`}
        >
          <div className="monitor-saude-escopo-head">
            <h4>Empenho do processo</h4>
            <NivelBadge nivel={saude.nivelEmpenhoProcesso} label="16 sem. · cumulativo" />
          </div>
          <p className="hint monitor-saude-lead">{saude.resumoDecisaoEmpenho}</p>
          {empenhoProc && (
            <>
              <div className="monitor-saude-autonomia">
                <div className="monitor-saude-autonomia-labels">
                  <span>0</span>
                  <span className="monitor-saude-meta-line">
                    {empenhoProc.semanasDecorridas}/{empenhoProc.semanasTotal} semanas operacionais
                  </span>
                  <span>{empenhoProc.semanasTotal}</span>
                </div>
                <div
                  className="monitor-saude-track"
                  role="img"
                  aria-label="Progresso do processo em 16 semanas"
                >
                  <div
                    className={`monitor-saude-fill monitor-saude-fill--${saude.nivelEmpenhoProcesso}`}
                    style={{ width: `${pctBarEmpenho}%` }}
                  />
                </div>
                <p className="monitor-saude-autonomia-valor">
                  <strong>{num(empenhoProc.restante, 0)}</strong> cestas restantes · ritmo real ~
                  {num(empenhoProc.ritmoRealMedio, 0)}/sem · sustentável ~
                  {num(empenhoProc.ritmoSustentavel, 0)}/sem · fechamento projetado{' '}
                  <strong>{num(empenhoProc.fechamentoProjetadoProcesso, 0)}</strong> /{' '}
                  {num(empenhoProc.totalEmpenho, 0)}
                </p>
              </div>
            </>
          )}
        </article>
      </div>

      <div className="monitor-saude-grid">
        <article
          className={`monitor-saude-card${saude.estouroMes > 0 ? ' monitor-saude-card--over' : ''}`}
        >
          <span className="monitor-saude-card-label">
            {resumo.usaCicloOperacional ? 'Teto do ciclo' : 'Teto mensal'}
          </span>
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
            {resumo.usaCicloOperacional
              ? `Teto ${resumo.labelSemanaAnalise ?? `S${resumo.semanaNoCiclo ?? resumo.semanaAnalise}`}`
              : `Teto semana ${resumo.semanaAnalise}`}
          </span>
          <strong>{num(saude.limiteSemanal, 0)}</strong>
          <span className="monitor-saude-card-sub">
            uso {num(saude.pctUsoLimiteSemana, 0)}% · {num(saude.enviadoSemana, 0)} enviadas
            {resumo.planejadoSemanaAtual != null
              ? ` · plano ${num(resumo.planejadoSemanaAtual)}`
              : ''}
            {resumo.semanasRestantesCiclo != null
              ? ` · margem ciclo ${num(resumo.margemMes)}`
              : ''}
          </span>
        </article>
        <article
          className={`monitor-saude-card${saude.estouroProjetadoMes > 0 ? ' monitor-saude-card--over' : ''}`}
        >
          <span className="monitor-saude-card-label">
            {resumo.usaCicloOperacional ? 'Projeção fim do ciclo' : 'Projeção fim do mês'}
          </span>
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
          <span className="monitor-saude-card-label">Saldo Banco</span>
          <strong>{num(saude.saldoAtual, 0)}</strong>
          <span className="monitor-saude-card-sub">cestas</span>
        </article>
        <article className="monitor-saude-card">
          <span className="monitor-saude-card-label">Ref. rateio</span>
          <strong>{num(saude.consumoReferenciaRateio, 0)}</strong>
          <span className="monitor-saude-card-sub">
            /mês · {FONTE_RATEIO_LABEL[saude.consumoFonteRateio]} (só cotas)
          </span>
        </article>
        <article className="monitor-saude-card">
          <span className="monitor-saude-card-label">Empenho total</span>
          <strong>{num(saude.empenho.restante, 0)}</strong>
          <span className="monitor-saude-card-sub">
            restantes de {num(saude.empenho.totalEmpenho, 0)} · usado{' '}
            {num(saude.empenho.totalConsumido, 0)}
            {empenhoProc
              ? ` · ${empenhoProc.semanasDecorridas}/${empenhoProc.semanasTotal} sem.`
              : ''}
          </span>
        </article>
      </div>

      <div className="monitor-saude-empenho">
        <h4>Empenho {saude.empenho.totalEmpenho.toLocaleString('pt-BR')} cestas</h4>
        <PrintableTable
          title={`Empenho — ${saude.empenho.totalEmpenho.toLocaleString('pt-BR')} cestas`}
          subtitle="Limite, enviado e saldo por mês do período"
          orientation="portrait"
        >
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
        </PrintableTable>
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
          <i className="dot dot-estoque" /> Ciclo/semana (50%): teto, semana e projeção do ciclo — zera
          a cada 4 semanas
        </span>
        <span>
          <i className="dot dot-ritmo" /> Empenho processo (50%): 5.000 em 16 semanas (1.350 + 1.150×3)
          — cumulativo, não zera entre ciclos
        </span>
      </div>
    </section>
  );
}
