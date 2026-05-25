import {
  DECISION_NUMBERS_LEGEND,
  type DecisionNumbers,
} from '@shared/decisionNumbers';
import {
  VOLUME_CENARIO_LABELS,
  VOLUME_CENARIO_LEGEND,
  type VolumeCenario,
} from '@shared/forecastCenarios';
import './DecisionNumbersLegend.css';

function num(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function deltaVsContrato(v: number | null, contrato: number): string {
  if (v == null) return '';
  const d = v - contrato;
  return ` (${d >= 0 ? '+' : ''}${d.toLocaleString('pt-BR')} vs contrato)`;
}

function CenariosRow({
  titulo,
  c,
  contratoMensal,
}: {
  titulo: string;
  c: VolumeCenario | null;
  contratoMensal: number;
}) {
  if (!c) {
    return (
      <tr>
        <th scope="row">{titulo}</th>
        <td colSpan={4}>—</td>
      </tr>
    );
  }
  return (
    <tr>
      <th scope="row">{titulo}</th>
      <td>
        {num(c.menor)}
        <span className="dn-delta">{deltaVsContrato(c.menor, contratoMensal)}</span>
      </td>
      <td className="dn-ref">
        <strong>{num(c.referencia)}</strong>
        <span className="dn-delta">{deltaVsContrato(c.referencia, contratoMensal)}</span>
      </td>
      <td>
        {num(c.maior)}
        <span className="dn-delta">{deltaVsContrato(c.maior, contratoMensal)}</span>
      </td>
      <td className="dn-medio">
        <strong>{num(c.medio)}</strong>
        <span className="dn-delta">{deltaVsContrato(c.medio, contratoMensal)}</span>
      </td>
    </tr>
  );
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
      <h4 className="decision-numbers-title">Cenários de cessão (cestas/mês)</h4>
      <p className="dn-intro">{DECISION_NUMBERS_LEGEND.cenarios}</p>

      <div className="dn-cenarios-wrap">
        <table className="dn-cenarios-table">
          <thead>
            <tr>
              <th scope="col">Período</th>
              <th scope="col" title={VOLUME_CENARIO_LEGEND.menor}>
                {VOLUME_CENARIO_LABELS.menor}
              </th>
              <th scope="col" title={VOLUME_CENARIO_LEGEND.referencia}>
                {VOLUME_CENARIO_LABELS.referencia}
              </th>
              <th scope="col" title={VOLUME_CENARIO_LEGEND.maior}>
                {VOLUME_CENARIO_LABELS.maior}
              </th>
              <th scope="col" title={VOLUME_CENARIO_LEGEND.medio}>
                {VOLUME_CENARIO_LABELS.medio}
              </th>
            </tr>
          </thead>
          <tbody>
            <CenariosRow
              titulo="Próximo mês"
              c={n.cenariosProximoMes}
              contratoMensal={contratoMensal}
            />
            <CenariosRow
              titulo={`Média jun–dez${n.mesesPrevisaoJunDez.length ? ` (${n.mesesPrevisaoJunDez.length}m)` : ''}`}
              c={n.cenariosMediaJunDez}
              contratoMensal={contratoMensal}
            />
          </tbody>
        </table>
      </div>

      <details className="dn-details">
        <summary>Referência histórica e divisão por equipamento</summary>
        <div className="decision-numbers-grid">
          <article className="dn-card">
            <span className="dn-label">Média período nota (Abr/25+)</span>
            <strong className="dn-value">{num(n.mediaNotaPeriodo)}</strong>
            <p className="dn-desc">
              Base da regressão. Média limpa total: {num(n.mediaLimpaHistorica)} (
              {n.mesesMediaLimpa} meses).
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
      </details>

      <p className="dn-footer">
        Contrato vigente: <strong>{num(contratoMensal)}/mês</strong> · Último mês válido:{' '}
        <strong>{n.ultimoMesValido ?? '—'}</strong>
      </p>
    </div>
  );
}
