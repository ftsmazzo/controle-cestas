import type { ReactNode } from 'react';
import './MetricCard.css';

export type MetricVariant =
  | 'default'
  | 'primary'
  | 'menor'
  | 'referencia'
  | 'maior'
  | 'medio'
  | 'muted'
  | 'success'
  | 'warning'
  | 'danger';

interface Props {
  label: string;
  value: string;
  icon?: ReactNode;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  hint?: string;
  variant?: MetricVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function MetricCard({
  label,
  value,
  icon,
  delta,
  deltaTone = 'neutral',
  hint,
  variant = 'default',
  size = 'md',
  className = '',
}: Props) {
  return (
    <article
      className={`metric-card metric-card--${variant} metric-card--${size}${className ? ` ${className}` : ''}`}
    >
      <span className="metric-card__glow" aria-hidden />
      <div className="metric-card__head">
        {icon && <span className="metric-card__icon">{icon}</span>}
        <span className="metric-card__label">{label}</span>
      </div>
      <strong className="metric-card__value">{value}</strong>
      {delta && (
        <span className={`metric-card__delta metric-card__delta--${deltaTone}`}>
          {delta}
        </span>
      )}
      {hint && <p className="metric-card__hint">{hint}</p>}
    </article>
  );
}
