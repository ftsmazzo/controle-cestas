import { AlertTriangle } from 'lucide-react';
import type { AlertaEstouroSemanal } from '@shared/visaoPublicaOperacional';
import './PublicAlertaEstouroSemana.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  alertas: AlertaEstouroSemanal[];
  semanaPedidosPeriodo: string;
}

export default function PublicAlertaEstouroSemana({
  alertas,
  semanaPedidosPeriodo,
}: Props) {
  if (!alertas.length) return null;

  return (
    <section className="panel public-alerta-estouro">
      <header className="public-alerta-estouro-head">
        <h2>
          <AlertTriangle size={22} aria-hidden />
          Atenção — estouro na semana que fechou
        </h2>
        <p className="hint public-alerta-estouro-sub">
          {alertas.length} equipamento{alertas.length > 1 ? 's' : ''} pediu
          acima da cota semanal. Para{' '}
          <strong>{semanaPedidosPeriodo}</strong>, a cota foi reduzida pelo
          excesso — use os valores ajustados na tabela abaixo.
        </p>
      </header>

      <div className="public-alerta-estouro-grid">
        {alertas.map((a) => (
          <article key={a.servicoId} className="public-alerta-estouro-card">
            <h3>{a.servicoNome}</h3>
            <p className="public-alerta-estouro-excesso">
              <strong>+{num(a.excesso)}</strong>
              <span> acima da cota ({num(a.pctAcima, 0)}%)</span>
            </p>
            <dl className="public-alerta-estouro-dl">
              <div>
                <dt>Enviou ({a.semanaFechadaLabel})</dt>
                <dd>
                  {num(a.enviadoSemana)} / {num(a.cotaSemanaPrevista)}
                </dd>
              </div>
              <div>
                <dt>Cota plano</dt>
                <dd>{num(a.cotaPlanoProximaSemana)}</dd>
              </div>
              <div className="public-alerta-estouro-ajuste">
                <dt>Pedir na próxima semana</dt>
                <dd>
                  <strong>{num(a.cotaAjustadaProximaSemana)}</strong>
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
