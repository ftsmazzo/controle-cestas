import { Fragment, useMemo } from 'react';
import { buildTopEstourosRetomada } from '@shared/topEstourosRetomada';
import type { ServicesPayload } from '@shared/serviceTypes';
import { AlertTriangle } from 'lucide-react';
import './TopEstourosRetomadaCard.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  payload: ServicesPayload;
}

export default function TopEstourosRetomadaCard({ payload }: Props) {
  const top = useMemo(() => buildTopEstourosRetomada(payload, 4), [payload]);

  return (
    <section className="panel top-estouros-panel">
      <header className="top-estouros-head">
        <div>
          <h2 className="top-estouros-title">
            <AlertTriangle size={20} aria-hidden />
            Maiores estouros na retomada
          </h2>
          <p className="top-estouros-sub">
            Equipamentos que pediram <strong>acima da cota</strong> e{' '}
            <strong>acima da média histórica</strong> no período de controle (
            {top.mes}, S{top.semanaInicioControle}–S{top.semanaBaseRitmo}).
          </p>
        </div>
      </header>

      {!top.temDados ? (
        <p className="hint top-estouros-empty">
          Importe o PDF semanal em{' '}
          <a href="/admin/monitoramento">Admin → Monitor</a>, clique em{' '}
          <strong>Salvar</strong> e atualize esta página (F5).
        </p>
      ) : !top.items.length ? (
        <p className="hint top-estouros-empty">
          Nenhum equipamento estourou cota e média ao mesmo tempo neste período.
        </p>
      ) : (
        <div className="top-estouros-grid">
          {top.items.map((item, i) => (
            <article key={item.servicoId} className="top-estouro-card">
              <span className="top-estouro-rank">#{i + 1}</span>
              <h3 className="top-estouro-nome">{item.servicoNome}</h3>
              <p className="top-estouro-enviado">
                <strong>{num(item.enviadoRetomada)}</strong>
                <span> cestas enviadas</span>
              </p>
              <dl className="top-estouro-metrics">
                <div className="top-estouro-metric top-estouro-metric--cota">
                  <dt>vs cota</dt>
                  <dd>
                    {num(item.cotaMensal)} →{' '}
                    <strong className="top-estouro-over">
                      +{num(item.excessoCota)} ({num(item.pctCota, 0)}%)
                    </strong>
                  </dd>
                </div>
                <div className="top-estouro-metric top-estouro-metric--media">
                  <dt>vs média</dt>
                  <dd>
                    {num(item.mediaHistorica)} →{' '}
                    <strong className="top-estouro-over">
                      +{num(item.excessoMedia)} ({num(item.pctMedia, 0)}%)
                    </strong>
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
