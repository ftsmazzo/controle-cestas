import './PublicProgressBar.css';

export type ProgressBarTone = 'verde' | 'amarelo' | 'vermelho' | 'neutro';

/** Saldo restante do ciclo/período — verde com folga, vermelho perto de zerar */
export function toneFromPctRestante(pctRestante: number): ProgressBarTone {
  if (pctRestante <= 10) return 'vermelho';
  if (pctRestante <= 25) return 'amarelo';
  return 'verde';
}

export function pctRestante(usado: number, total: number): number {
  if (total <= 0) return 100;
  return Math.max(0, ((total - usado) / total) * 100);
}

interface Props {
  pct: number;
  tone?: ProgressBarTone;
  label?: string;
  showPct?: boolean;
  size?: 'sm' | 'md';
}

export default function PublicProgressBar({
  pct,
  tone = 'neutro',
  label,
  showPct = true,
  size = 'md',
}: Props) {
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div
      className={`public-progress public-progress--${size}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="public-progress-track">
        <div
          className={`public-progress-fill public-progress-fill--${tone}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showPct && (
        <span className="public-progress-pct">{Math.round(clamped)}%</span>
      )}
    </div>
  );
}
