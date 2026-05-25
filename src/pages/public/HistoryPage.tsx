import { useEffect, useMemo, useState } from 'react';
import {
  detectPeriodoPresetId,
  PERIODO_ESTUDO_PRESETS,
  periodoPresetById,
  resolvePeriodoEstudo,
} from '@shared/methodologyCalendar';
import { isMonthKeyInRange } from '@shared/monthUtils';
import { useData } from '../../context/DataContext';
import ConsumptionHeatmap from '../../components/ConsumptionHeatmap';

function num(n: number | null, dec = 0): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

export default function HistoryPage() {
  const { loading, payload, dashboard } = useData();
  const [periodoId, setPeriodoId] = useState(PERIODO_ESTUDO_PRESETS[0].id);

  useEffect(() => {
    if (!payload) return;
    const per = resolvePeriodoEstudo(payload.settings?.methodology);
    setPeriodoId(detectPeriodoPresetId(per.from, per.to));
  }, [payload]);

  const periodo = useMemo(() => {
    const preset = periodoPresetById(periodoId);
    return { from: preset.from, to: preset.to, label: preset.label };
  }, [periodoId]);

  const resumo = useMemo(() => {
    if (!dashboard) return null;
    const rows = dashboard.rows.filter((r) =>
      isMonthKeyInRange(r.mes, periodo.from, periodo.to),
    );
    const validos = rows.filter((r) => r.usoNoModelo === 'Sim');
    const totais = rows.map((r) => r.total);
    const validosTotais = validos.map((r) => r.total);
    const soma = totais.reduce((a, b) => a + b, 0);
    const mediaValida =
      validosTotais.length > 0
        ? validosTotais.reduce((a, b) => a + b, 0) / validosTotais.length
        : null;
    return {
      meses: rows.length,
      mesesValidos: validos.length,
      soma,
      mediaValida,
      pico: totais.length ? Math.max(...totais) : null,
      menor: validosTotais.length ? Math.min(...validosTotais) : null,
    };
  }, [dashboard, periodo]);

  if (loading) return null;

  if (!payload?.history.length || !dashboard) {
    return (
      <section className="panel empty">
        <p>Importe o histórico em /admin para visualizar o mapa de consumo.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2>Consumo por equipamento</h2>
      <p className="hint">
        Visão consolidada por período. Detalhe mês a mês só no mapa de calor abaixo.
      </p>

      <div className="upload-row consumo-filtros">
        <label>
          Período de estudo
          <select
            value={periodoId}
            onChange={(e) => setPeriodoId(e.target.value)}
          >
            {PERIODO_ESTUDO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {resumo && (
        <div className="consumo-resumo-grid">
          <div className="consumo-resumo-item">
            <span className="kpi-label">Período</span>
            <strong>{periodo.label}</strong>
          </div>
          <div className="consumo-resumo-item">
            <span className="kpi-label">Meses no recorte</span>
            <strong>
              {resumo.meses} ({resumo.mesesValidos} válidos p/ modelo)
            </strong>
          </div>
          <div className="consumo-resumo-item">
            <span className="kpi-label">Soma consumo</span>
            <strong>{num(resumo.soma)} cestas</strong>
          </div>
          <div className="consumo-resumo-item">
            <span className="kpi-label">Média (meses válidos)</span>
            <strong>{num(resumo.mediaValida)}</strong>
          </div>
          <div className="consumo-resumo-item">
            <span className="kpi-label">Pico no período</span>
            <strong>{num(resumo.pico)}</strong>
          </div>
          <div className="consumo-resumo-item">
            <span className="kpi-label">Menor mês válido</span>
            <strong>{num(resumo.menor)}</strong>
          </div>
        </div>
      )}

      <h3 className="consumo-heatmap-title">Mapa de calor — equipamento × mês</h3>
      <ConsumptionHeatmap
        services={payload.services}
        history={payload.history}
        rangeFrom={periodo.from}
        rangeTo={periodo.to}
      />
      <p className="hint">
        Para alterar o período padrão do painel e da previsão, use{' '}
        <a href="/admin/metodologia">Admin → Metodologia</a>.
      </p>
    </section>
  );
}
