import { AlertTriangle, Info } from 'lucide-react';
import type { AlertaEstouroSemanal } from '@shared/visaoPublicaOperacional';
import './PublicAlertaEstouroSemana.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  alertas: AlertaEstouroSemanal[];
  semanaPedidosPeriodo: string;
}

function CardPenalidade({ a }: { a: AlertaEstouroSemanal }) {
  return (
    <article className="public-alerta-estouro-card public-alerta-estouro-card--penalidade">
      <h3>{a.servicoNome}</h3>
      <p className="public-alerta-estouro-excesso">
        <strong>−{num(a.excessoPenalizavel)}</strong>
        <span> na próxima semana</span>
      </p>
      <dl className="public-alerta-estouro-dl">
        <div>
          <dt>Semana que fechou</dt>
          <dd>
            {num(a.enviadoSemana)} / {num(a.cotaSemanaPrevista)} (+{num(a.excessoSemanal)})
          </dd>
        </div>
        <div>
          <dt>Período (4 sem.)</dt>
          <dd>
            {num(a.enviadoPeriodo)} / {num(a.cotaPeriodo)} — estourou
          </dd>
        </div>
        <div className="public-alerta-estouro-ajuste">
          <dt>Pedir na próxima semana</dt>
          <dd>
            <span className="public-alerta-estouro-riscado">{num(a.cotaPlanoProximaSemana)}</span>
            <strong>{num(a.cotaAjustadaProximaSemana)}</strong>
          </dd>
        </div>
      </dl>
      <p className="public-alerta-estouro-motivo">{a.motivo}</p>
    </article>
  );
}

function CardCompensacao({ a }: { a: AlertaEstouroSemanal }) {
  return (
    <article className="public-alerta-estouro-card public-alerta-estouro-card--compensacao">
      <h3>{a.servicoNome}</h3>
      <p className="public-alerta-estouro-excesso public-alerta-estouro-excesso--info">
        <strong>+{num(a.excessoSemanal)}</strong>
        <span> nesta semana · sem desconto</span>
      </p>
      <dl className="public-alerta-estouro-dl">
        <div>
          <dt>Semana que fechou</dt>
          <dd>
            {num(a.enviadoSemana)} / {num(a.cotaSemanaPrevista)}
          </dd>
        </div>
        {a.semanaAnteriorLabel && a.enviadoSemanaAnterior != null && (
          <div>
            <dt>Semana anterior ({a.semanaAnteriorLabel})</dt>
            <dd>
              {num(a.enviadoSemanaAnterior)} / {num(a.cotaSemanaAnterior ?? 0)}
            </dd>
          </div>
        )}
        <div>
          <dt>Período (4 sem.)</dt>
          <dd>
            {num(a.enviadoPeriodo)} / {num(a.cotaPeriodo)}
            {a.saldoPeriodo >= 0 && (
              <span className="public-alerta-estouro-ok">
                {' '}
                · saldo {num(a.saldoPeriodo)}
              </span>
            )}
          </dd>
        </div>
        <div className="public-alerta-estouro-ajuste public-alerta-estouro-ajuste--ok">
          <dt>Cota próxima semana</dt>
          <dd>
            <strong>{num(a.cotaPlanoProximaSemana)}</strong> (plano mantido)
          </dd>
        </div>
      </dl>
      <p className="public-alerta-estouro-motivo">{a.motivo}</p>
    </article>
  );
}

export default function PublicAlertaEstouroSemana({
  alertas,
  semanaPedidosPeriodo,
}: Props) {
  if (!alertas.length) return null;

  const penalidades = alertas.filter((a) => a.aplicaDesconto);
  const compensacoes = alertas.filter((a) => !a.aplicaDesconto);

  return (
    <section className="panel public-alerta-estouro">
      <header className="public-alerta-estouro-head">
        <h2>
          <AlertTriangle size={22} aria-hidden />
          Análise da semana que fechou
        </h2>
        <p className="hint public-alerta-estouro-sub">
          A cota é <strong>semanal</strong>, mas a régua principal é o{' '}
          <strong>período de 4 semanas</strong> (1.056 flexíveis). Passar da
          cota de uma semana não gera desconto se o equipamento ainda estiver
          dentro do período — por exemplo, por não ter pedido na semana
          anterior.
        </p>
      </header>

      {penalidades.length > 0 && (
        <div className="public-alerta-estouro-bloco">
          <h3 className="public-alerta-estouro-bloco-title public-alerta-estouro-bloco-title--penalidade">
            Desconto na próxima semana ({penalidades.length})
          </h3>
          <p className="hint public-alerta-estouro-bloco-hint">
            Estouraram o teto do período — use os valores ajustados na tabela
            para <strong>{semanaPedidosPeriodo}</strong>.
          </p>
          <div className="public-alerta-estouro-grid">
            {penalidades.map((a) => (
              <CardPenalidade key={a.servicoId} a={a} />
            ))}
          </div>
        </div>
      )}

      {compensacoes.length > 0 && (
        <div className="public-alerta-estouro-bloco">
          <h3 className="public-alerta-estouro-bloco-title public-alerta-estouro-bloco-title--compensacao">
            <Info size={18} aria-hidden />
            Compensação no período ({compensacoes.length})
          </h3>
          <p className="hint public-alerta-estouro-bloco-hint">
            Acima da cota desta semana, mas ainda dentro do saldo das 4
            semanas — sem desconto. Cotas da tabela permanecem as do plano.
          </p>
          <div className="public-alerta-estouro-grid">
            {compensacoes.map((a) => (
              <CardCompensacao key={a.servicoId} a={a} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
