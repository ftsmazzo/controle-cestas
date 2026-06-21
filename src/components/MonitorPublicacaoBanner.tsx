import { useMemo } from 'react';
import { buildVisaoPublicaOperacional } from '@shared/visaoPublicaOperacional';
import type { ServicesPayload } from '@shared/serviceTypes';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export default function MonitorPublicacaoBanner({
  payload,
}: {
  payload: ServicesPayload;
}) {
  const visao = useMemo(
    () => buildVisaoPublicaOperacional(payload),
    [payload],
  );

  if (!visao) {
    return (
      <section className="panel monitor-pub-banner monitor-pub-banner--empty">
        <p>
          <strong>Publicação:</strong> importe o PDF da semana que fechou (terça),
          confira os totais e clique em <strong>Salvar</strong>. O painel público
          mostrará consumo e cotas para a semana de pedidos (quarta).
        </p>
      </section>
    );
  }

  return (
    <section className="panel monitor-pub-banner">
      <h2 className="monitor-pub-title">O que o painel público mostra após Salvar</h2>
      <div className="monitor-pub-grid">
        <div>
          <span className="monitor-pub-label">Período (4 semanas)</span>
          <strong>
            {num(visao.enviadoPeriodo)} / {num(visao.tetoPeriodo)}
          </strong>
          <span className="hint">restam {num(visao.restantePeriodo)}</span>
        </div>
        <div>
          <span className="monitor-pub-label">Saldo processo</span>
          <strong>
            {num(visao.saldoProcesso)} / {num(visao.totalProcesso)}
          </strong>
        </div>
        <div>
          <span className="monitor-pub-label">Semana fechada</span>
          <strong>{visao.semanaFechadaPeriodo}</strong>
          <span className="hint">{num(visao.enviadoSemanaFechada)} cestas</span>
        </div>
        <div>
          <span className="monitor-pub-label">Cotas pedidos (quarta)</span>
          <strong>{visao.semanaPedidosPeriodo}</strong>
          <span className="hint">{num(visao.totalCotaSemanaPedidos)} cestas</span>
        </div>
      </div>
    </section>
  );
}
