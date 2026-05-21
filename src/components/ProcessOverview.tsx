import { useMemo } from 'react';
import { aggregateHistoryByMonth, analyzeEmergencial, analyzeRegular } from '@shared/processAnalysis';
import { buildDashboard } from '@shared/buildDashboard';
import type { ServicesPayload } from '@shared/serviceTypes';
import MethodologyBanner from './MethodologyBanner';
import './ProcessPanels.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

export default function ProcessOverview({ data }: { data: ServicesPayload | null }) {
  const rowsGeral = useMemo(() => {
    if (!data?.history.length) return undefined;
    return buildDashboard(aggregateHistoryByMonth(data.history), 'Resumo').rows;
  }, [data]);

  const analise = useMemo(() => {
    if (!data?.history.length || !data.emergencial || !data.regular) return null;
    return {
      emergencial: analyzeEmergencial(data.emergencial, data.services, data.history),
      regular: analyzeRegular(data.regular, data.history),
    };
  }, [data]);

  if (!data?.history.length) {
    return (
      <section className="panel">
        <p className="hint">
          Importe os equipamentos na aba <strong>Equipamentos</strong> para ver o panorama dos
          dois processos.
        </p>
      </section>
    );
  }

  if (!analise) {
    return (
      <section className="panel">
        <p className="hint">Carregando panorama dos processos…</p>
      </section>
    );
  }

  const em = analise.emergencial;
  const reg = analise.regular;

  return (
    <section className="panel process-overview">
      {rowsGeral && <MethodologyBanner rows={rowsGeral} compact />}
      <h2>Dois processos em paralelo</h2>
      <div className="process-cards">
        <article className="process-card emergencial-card">
          <h3>Processo emergencial</h3>
          <p className="process-meta">
            {data.emergencial.duracaoMeses} meses · {num(data.emergencial.cestasPorMes)}/mês
          </p>
          <p>
            Distribui o volume <strong>por equipamento</strong> para não faltar cestas no curto
            prazo. Use a aba Emergencial para ver a divisão mês a mês.
          </p>
          {em.alertas.length > 0 ? (
            <span className="badge badge-warn">{em.alertas.length} alerta(s)</span>
          ) : (
            <span className="badge badge-ok">Sem alertas críticos</span>
          )}
        </article>

        <article className="process-card regular-card">
          <h3>Processo regular</h3>
          <p className="process-meta">
            {data.regular.duracaoMeses} meses · contrato {num(data.regular.totalContratoAnual)}/ano
          </p>
          <p>
            Levantamento do <strong>total mensal</strong>, previsão e risco de ruptura / contrato.
            Preencha os 12 meses na aba Regular.
          </p>
          <p>
            Autonomia:{' '}
            <strong>
              {reg.autonomiaMeses != null ? `${reg.autonomiaMeses.toFixed(1)} meses` : '—'}
            </strong>{' '}
            · Risco: <strong>{reg.riscoRuptura}</strong>
          </p>
          {reg.alertas.length > 0 ? (
            <span className="badge badge-warn">{reg.alertas.length} alerta(s)</span>
          ) : (
            <span className="badge badge-ok">Monitorar</span>
          )}
        </article>
      </div>

      {(em.alertas.length > 0 || reg.alertas.length > 0) && (
        <div className="alertas-resumo">
          <h4>Alertas consolidados</h4>
          <ul>
            {em.alertas.slice(0, 3).map((a, i) => (
              <li key={`e-${i}`} className={`alerta-nivel-${a.nivel}`}>
                <strong>[Emergencial]</strong> {a.titulo}
              </li>
            ))}
            {reg.alertas.slice(0, 3).map((a, i) => (
              <li key={`r-${i}`} className={`alerta-nivel-${a.nivel}`}>
                <strong>[Regular]</strong> {a.titulo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
