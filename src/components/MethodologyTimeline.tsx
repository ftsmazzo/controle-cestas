import type { ProcessedMonthRow } from '@shared/types';
import { listMesesOperacionais } from '@shared/methodology';
import './MethodologyTimeline.css';

interface Props {
  rows: ProcessedMonthRow[];
}

export default function MethodologyTimeline({ rows }: Props) {
  const items = listMesesOperacionais(
    rows.map((r) => ({ mes: r.mes, status: r.status })),
  );

  return (
    <section className="panel methodology-timeline">
      <h3>Linha do tempo metodológica</h3>
      <p className="hint">
        Meses visíveis no histórico. Cores indicam se o mês entra na média e na previsão.
      </p>
      <div className="timeline-track">
        {items.map((m) => (
          <div
            key={m.mes}
            className="timeline-chip"
            style={{ background: m.cor }}
            title={`${m.titulo}\n${m.descricao}`}
          >
            <span className="timeline-mes">{m.mes}</span>
            <span className="timeline-tag">
              {m.excluirDoModelo ? 'Fora do modelo' : 'Válido'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
