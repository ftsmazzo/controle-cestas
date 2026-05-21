import { NOTA_METODOLOGICA_RESUMO, listMesesOperacionais } from '@shared/methodology';
import type { ProcessedMonthRow } from '@shared/types';
import './MethodologyBanner.css';

interface Props {
  rows?: ProcessedMonthRow[];
  compact?: boolean;
}

export default function MethodologyBanner({ rows, compact }: Props) {
  const meses = rows?.length ? listMesesOperacionais(rows) : [];
  const distorcidos = meses.filter((m) => m.excluirDoModelo);

  return (
    <section className={`methodology-banner ${compact ? 'compact' : ''}`}>
      <h3>⚠ Contexto operacional (não distorce a análise)</h3>
      <p>{NOTA_METODOLOGICA_RESUMO}</p>
      {distorcidos.length > 0 && (
        <ul className="meses-distorcao">
          {distorcidos.map((m) => (
            <li key={m.mes} style={{ borderLeftColor: m.cor }}>
              <strong>{m.mes}</strong> — {m.titulo}
              {!compact && <span className="mes-desc">{m.descricao}</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="legenda-modelo">
        <span className="dot dot-valido" /> Entra no modelo (média, tendência, risco)
        <span className="dot dot-excluido" /> Excluído do modelo (só leitura gerencial)
      </p>
    </section>
  );
}
