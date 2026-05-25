import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronDown,
  FileCheck,
  Layers,
  Scale,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  DECISION_NUMBERS_LEGEND,
  type DecisionNumbers,
} from '@shared/decisionNumbers';
import {
  VOLUME_CENARIO_LABELS,
  VOLUME_CENARIO_LEGEND,
  type VolumeCenario,
} from '@shared/forecastCenarios';
import MetricCard from './ui/MetricCard';
import './DecisionNumbersLegend.css';

function num(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function deltaInfo(
  v: number,
  contrato: number,
): { text: string; tone: 'up' | 'down' | 'neutral' } {
  const d = v - contrato;
  const text = `${d >= 0 ? '+' : ''}${d.toLocaleString('pt-BR')} vs contrato`;
  if (d > 0) return { text, tone: 'up' };
  if (d < 0) return { text, tone: 'down' };
  return { text, tone: 'neutral' };
}

function CenarioGrid({
  c,
  contratoMensal,
  compact,
}: {
  c: VolumeCenario | null;
  contratoMensal: number;
  compact?: boolean;
}) {
  if (!c) {
    return <p className="dn-empty">Sem cenários calculados.</p>;
  }

  const cards = [
    {
      key: 'menor',
      label: VOLUME_CENARIO_LABELS.menor,
      value: c.menor,
      variant: 'menor' as const,
      icon: <ArrowDownLeft size={16} strokeWidth={2.25} />,
      hint: compact ? undefined : VOLUME_CENARIO_LEGEND.menor,
    },
    {
      key: 'referencia',
      label: VOLUME_CENARIO_LABELS.referencia,
      value: c.referencia,
      variant: 'referencia' as const,
      icon: <Target size={16} strokeWidth={2.25} />,
      hint: compact ? undefined : VOLUME_CENARIO_LEGEND.referencia,
      size: compact ? ('sm' as const) : ('lg' as const),
    },
    {
      key: 'maior',
      label: VOLUME_CENARIO_LABELS.maior,
      value: c.maior,
      variant: 'maior' as const,
      icon: <ArrowUpRight size={16} strokeWidth={2.25} />,
      hint: compact ? undefined : VOLUME_CENARIO_LEGEND.maior,
    },
    {
      key: 'medio',
      label: VOLUME_CENARIO_LABELS.medio,
      value: c.medio,
      variant: 'medio' as const,
      icon: <Scale size={16} strokeWidth={2.25} />,
      hint: compact ? undefined : VOLUME_CENARIO_LEGEND.medio,
    },
  ];

  return (
    <div className={`dn-cenario-grid${compact ? ' dn-cenario-grid--compact' : ''}`}>
      {cards.map((card) => {
        const d = deltaInfo(card.value, contratoMensal);
        return (
          <MetricCard
            key={card.key}
            label={card.label}
            value={num(card.value)}
            icon={card.icon}
            variant={card.variant}
            size={card.size ?? (compact ? 'sm' : 'md')}
            delta={d.text}
            deltaTone={d.tone}
            hint={card.hint}
            className={card.key === 'referencia' ? 'dn-card-hero' : undefined}
          />
        );
      })}
    </div>
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

  const refDelta =
    n.previsaoProximoMes != null
      ? deltaInfo(n.previsaoProximoMes, contratoMensal)
      : null;
  const gapPct =
    n.previsaoProximoMes != null && contratoMensal > 0
      ? Math.min(150, Math.round((n.previsaoProximoMes / contratoMensal) * 100))
      : 0;

  const junDezLabel = `Média jun–dez${n.mesesPrevisaoJunDez.length ? ` (${n.mesesPrevisaoJunDez.length} meses)` : ''}`;

  return (
    <section className={`decision-numbers-legend${compact ? ' compact' : ''}`}>
      <header className="dn-header">
        <div className="dn-header__title">
          <span className="dn-header__icon" aria-hidden>
            <BarChart3 size={22} strokeWidth={2} />
          </span>
          <div>
            <h2 className="decision-numbers-title">Cenários de cessão</h2>
            <p className="dn-intro">{DECISION_NUMBERS_LEGEND.cenarios}</p>
          </div>
        </div>
        <div className="dn-header__badges">
          <span className="dn-badge dn-badge--contract">
            Contrato {num(contratoMensal)}/mês
          </span>
          <span className="dn-badge">
            Último válido: {n.ultimoMesValido ?? '—'}
          </span>
        </div>
      </header>

      {!compact && refDelta && (
        <div className="dn-contract-bar">
          <div className="dn-contract-bar__labels">
            <span>Contrato {num(contratoMensal)}</span>
            <span className={`dn-contract-bar__gap dn-contract-bar__gap--${refDelta.tone}`}>
              Referência {num(n.previsaoProximoMes)} ({refDelta.text})
            </span>
          </div>
          <div className="dn-contract-bar__track">
            <span className="dn-contract-bar__fill" style={{ width: `${gapPct}%` }} />
          </div>
        </div>
      )}

      <div className="dn-periods">
        <div className="dn-period">
          <h3 className="dn-period__title">
            <Calendar size={16} />
            Próximo mês de entrega
          </h3>
          <CenarioGrid
            c={n.cenariosProximoMes}
            contratoMensal={contratoMensal}
            compact={compact}
          />
        </div>
        <div className="dn-period">
          <h3 className="dn-period__title">
            <TrendingUp size={16} />
            {junDezLabel}
          </h3>
          <CenarioGrid
            c={n.cenariosMediaJunDez}
            contratoMensal={contratoMensal}
            compact={compact}
          />
        </div>
      </div>

      <details className="dn-details">
        <summary>
          <Layers size={15} />
          Referência histórica e divisão por equipamento
          <ChevronDown size={16} className="dn-details-chevron" />
        </summary>
        <div className="decision-numbers-grid">
          <MetricCard
            label="Média período nota (Abr/25+)"
            value={num(n.mediaNotaPeriodo)}
            icon={<TrendingUp size={16} />}
            variant="primary"
            size="sm"
            hint={`Média limpa total: ${num(n.mediaLimpaHistorica)} (${n.mesesMediaLimpa} meses).`}
          />
          <MetricCard
            label={`Média janela (${janelaLabel})`}
            value={num(n.mediaJanela)}
            icon={<BarChart3 size={16} />}
            size="sm"
            hint={DECISION_NUMBERS_LEGEND.mediaJanela}
          />
          <MetricCard
            label="Ref. pré-ruptura (3m)"
            value={num(n.referenciaPreRuptura)}
            icon={<FileCheck size={16} />}
            size="sm"
            hint={DECISION_NUMBERS_LEGEND.referenciaPreRuptura}
          />
          <MetricCard
            label="Soma médias equipamentos"
            value={num(n.somaMediasEquipamentos)}
            icon={<Layers size={16} />}
            variant="muted"
            size="sm"
            hint={`${n.mesesSomaMediasEquip.join(' · ') || '—'}. ${DECISION_NUMBERS_LEGEND.somaMediasEquipamentos}`}
          />
        </div>
      </details>
    </section>
  );
}