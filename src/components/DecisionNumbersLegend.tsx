import {
  DECISION_NUMBERS_LEGEND,
  type DecisionNumbers,
} from '@shared/decisionNumbers';
import './DecisionNumbersLegend.css';

function num(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface Props {
  numbers: DecisionNumbers;
  contratoMensal?: number;
  compact?: boolean;
}

export default function DecisionNumbersLegend({
  numbers: n,
  contratoMensal = 1200,
  compact,
}: Props) {
  const janelaLabel =
    n.janelaMeses != null && n.janelaMeses > 0
      ? `últimos ${n.janelaMeses} válidos`
      : 'todos os válidos';

  return (
    <div className={`decision-numbers-legend${compact ? ' compact' : ''}`}>
      <h4 className="decision-numbers-title">Parâmetros de decisão (fonte única)</h4>
      <div className="decision-numbers-grid">
        <article className="dn-card dn-card--primary">
          <span className="dn-label">Previsão próximo mês</span>
          <strong className="dn-value">{num(n.previsaoProximoMes)}</strong>
          <p className="dn-desc">{DECISION_NUMBERS_LEGEND.previsaoProximoMes}</p>
        </article>
        <article className="dn-card dn-card--primary">
          <span className="dn-label">Média previsão jun–dez</span>
          <strong className="dn-value">{num(n.mediaPrevisaoJunDez)}</strong>
          <p className="dn-desc">{DECISION_NUMBERS_LEGEND.mediaPrevisaoJunDez}</p>
        </article>
        <article className="dn-card">
          <span className="dn-label">Média período nota (Abr/25+)</span>
          <strong className="dn-value">{num(n.mediaNotaPeriodo)}</strong>
          <p className="dn-desc">
            Base da regressão — alinhada à nota ~1.351. Média limpa total:{' '}
            {num(n.mediaLimpaHistorica)} ({n.mesesMediaLimpa} meses).
          </p>
        </article>
        <article className="dn-card">
          <span className="dn-label">Média janela ({janelaLabel})</span>
          <strong className="dn-value">{num(n.mediaJanela)}</strong>
          <p className="dn-desc">{DECISION_NUMBERS_LEGEND.mediaJanela}</p>
        </article>
        <article className="dn-card">
          <span className="dn-label">Ref. pré-ruptura (3m)</span>
          <strong className="dn-value">{num(n.referenciaPreRuptura)}</strong>
          <p className="dn-desc">{DECISION_NUMBERS_LEGEND.referenciaPreRuptura}</p>
        </article>
        <article className="dn-card dn-card--ref">
          <span className="dn-label">Soma médias equipamentos</span>
          <strong className="dn-value">{num(n.somaMediasEquipamentos)}</strong>
          <p className="dn-desc">
            Janela: {n.mesesSomaMediasEquip.join(' · ') || '—'}.{' '}
            {DECISION_NUMBERS_LEGEND.somaMediasEquipamentos}
          </p>
        </article>
      </div>
      <p className="dn-footer">
        Contrato vigente: <strong>{num(contratoMensal)}/mês</strong> · Último mês válido:{' '}
        <strong>{n.ultimoMesValido ?? '—'}</strong>
      </p>
    </div>
  );
}
