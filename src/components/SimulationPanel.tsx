import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardState } from '@shared/types';
import {
  evaluateContractScenario,
  presetsFromDashboard,
  type ContractScenarioResult,
  type ScenarioPreset,
  type ScenarioRisk,
} from '@shared/simulation';
import PrintableTable from './ui/PrintableTable';
import './SimulationPanel.css';

function parseInputInt(s: string): number | null {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) || v <= 0 ? null : v;
}

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function riskLabel(r: ScenarioRisk): string {
  const map: Record<ScenarioRisk, string> = {
    baixo: 'Baixo',
    moderado: 'Moderado',
    alto: 'Alto',
    critico: 'Crítico',
  };
  return map[r];
}

function newId(): string {
  return `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface Props {
  dashboard: DashboardState;
  defaultTotalContrato?: number;
}

export default function SimulationPanel({
  dashboard,
  defaultTotalContrato = 14400,
}: Props) {
  const [totalContrato, setTotalContrato] = useState(String(defaultTotalContrato));
  const [consumoInput, setConsumoInput] = useState('');
  const [cenarioLabel, setCenarioLabel] = useState('');
  const [presets, setPresets] = useState<ScenarioPreset[]>(() =>
    presetsFromDashboard(dashboard),
  );

  useEffect(() => {
    setPresets(presetsFromDashboard(dashboard));
  }, [dashboard]);

  const totalNum = useMemo(() => parseInputInt(totalContrato) ?? 14400, [totalContrato]);

  const preview = useMemo(() => {
    const consumo = parseInputInt(consumoInput);
    if (consumo === null) return null;
    return evaluateContractScenario(
      totalNum,
      consumo,
      cenarioLabel.trim() || 'Cenário personalizado',
    );
  }, [totalContrato, consumoInput, cenarioLabel, totalNum]);

  const addPreset = useCallback(
    (label: string, consumo: number) => {
      setPresets((prev) => {
        if (prev.some((p) => p.consumoMensal === consumo && p.label === label)) return prev;
        return [...prev, { id: newId(), label, consumoMensal: consumo }];
      });
    },
    [],
  );

  const addFromInput = () => {
    const consumo = parseInputInt(consumoInput);
    if (consumo === null) return;
    const label = cenarioLabel.trim() || `Cenário ${num(consumo)}/mês`;
    addPreset(label, consumo);
    setConsumoInput('');
    setCenarioLabel('');
  };

  const updatePresetConsumo = (id: string, value: string) => {
    const n = parseInputInt(value);
    if (n === null) return;
    setPresets((prev) =>
      prev.map((p) => (p.id === id ? { ...p, consumoMensal: Math.round(n) } : p)),
    );
  };

  const removePreset = (id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const atalhos = presetsFromDashboard(dashboard);

  return (
    <section className="panel simulation-panel">
      <h2>Simulação de contrato (cenários dinâmicos)</h2>
      <p className="hint">
        Ajuste o volume total do contrato e teste consumos mensais. Use atalhos do
        histórico ou crie cenários personalizados para comparar duração e risco.
      </p>

      <div className="sim-controls">
        <label>
          Total do contrato (cestas)
          <input
            type="text"
            inputMode="numeric"
            value={totalContrato}
            onChange={(e) => setTotalContrato(e.target.value)}
          />
        </label>
        <label>
          Consumo mensal a testar
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ex.: 1750"
            value={consumoInput}
            onChange={(e) => setConsumoInput(e.target.value)}
          />
        </label>
        <label>
          Nome do cenário (opcional)
          <input
            type="text"
            placeholder="Ex.: Pico 2026"
            value={cenarioLabel}
            onChange={(e) => setCenarioLabel(e.target.value)}
          />
        </label>
        <button type="button" className="primary-btn" onClick={addFromInput}>
          Adicionar cenário
        </button>
      </div>

      <div className="sim-shortcuts">
        <span className="shortcuts-label">Atalhos do histórico:</span>
        {atalhos.map((a) => (
          <button
            key={a.id}
            type="button"
            className="chip"
            onClick={() => {
              setConsumoInput(String(a.consumoMensal));
              setCenarioLabel(a.label);
            }}
          >
            {a.label} ({num(a.consumoMensal)})
          </button>
        ))}
        {[1600, 1900, 2100].map((v) => (
          <button
            key={v}
            type="button"
            className="chip chip-muted"
            onClick={() => {
              setConsumoInput(String(v));
              setCenarioLabel(`Teste ${num(v)}`);
            }}
          >
            {num(v)}/mês
          </button>
        ))}
      </div>

      {preview && (
        <div className={`sim-preview sim-risk-${preview.risco}`}>
          <strong>Prévia:</strong> {num(preview.consumoMensal)}/mês →{' '}
          {preview.duracaoMeses.toFixed(1)} meses de cobertura
          {preview.cobre12Meses ? (
            <span> · Folga de {preview.margemMeses.toFixed(1)} mês(es) sobre 12</span>
          ) : (
            <span> · Faltam {Math.abs(preview.margemMeses).toFixed(1)} mês(es) para 12</span>
          )}
          <span className={`risk-pill risk-${preview.risco}`}>{riskLabel(preview.risco)}</span>
        </div>
      )}

      <PrintableTable
        title="Cenários de contrato"
        subtitle="Comparativo de consumo mensal e duração do estoque"
        orientation="landscape"
      >
        <table className="sim-table">
          <thead>
            <tr>
              <th>Cenário</th>
              <th>Consumo/mês</th>
              <th>Duração</th>
              <th>vs 12 meses</th>
              <th>Risco</th>
              <th>Leitura</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {presets.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-row">
                  Adicione cenários para comparar.
                </td>
              </tr>
            ) : (
              presets.map((p) => {
                const c = evaluateContractScenario(
                  totalNum,
                  p.consumoMensal,
                  p.label,
                );
                if (!c) return null;
                return (
                  <SimRow
                    key={p.id}
                    result={c}
                    preset={p}
                    onConsumoChange={updatePresetConsumo}
                    onRemove={removePreset}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </PrintableTable>
    </section>
  );
}

function SimRow({
  result: c,
  preset,
  onConsumoChange,
  onRemove,
}: {
  result: ContractScenarioResult;
  preset?: ScenarioPreset;
  onConsumoChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <tr className={`sim-row sim-risk-${c.risco}`}>
      <td>{c.label ?? '—'}</td>
      <td>
        {preset ? (
          <input
            className="cell-input"
            type="text"
            inputMode="numeric"
            defaultValue={String(c.consumoMensal)}
            onBlur={(e) => onConsumoChange(preset.id, e.target.value)}
          />
        ) : (
          `${num(c.consumoMensal)}`
        )}
      </td>
      <td>{c.duracaoMeses.toFixed(1)} meses</td>
      <td>
        {c.cobre12Meses ? (
          <span className="margem-ok">+{c.margemMeses.toFixed(1)} m (folga)</span>
        ) : (
          <span className="margem-bad">−{Math.abs(c.margemMeses).toFixed(1)} m</span>
        )}
      </td>
      <td>
        <span className={`risk-pill risk-${c.risco}`}>{riskLabel(c.risco)}</span>
      </td>
      <td className="leitura-cell">{c.leitura}</td>
      <td>
        {preset && (
          <button
            type="button"
            className="link-btn"
            onClick={() => onRemove(preset.id)}
            title="Remover"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}
