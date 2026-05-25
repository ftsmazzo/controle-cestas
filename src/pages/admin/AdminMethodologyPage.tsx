import { useState } from 'react';
import {
  defaultMethodologySettings,
  resolveJanelaAnaliseMeses,
} from '@shared/methodologyCalendar';
import { useData } from '../../context/DataContext';
import { saveSettings } from '../../lib/snapshotApi';

const JANELA_OPCOES: { value: string; label: string; meses: number | null }[] = [
  { value: '8', label: 'Últimos 8 meses válidos', meses: 8 },
  { value: '12', label: 'Últimos 12 meses válidos', meses: 12 },
  { value: '24', label: 'Últimos 24 meses válidos', meses: 24 },
  { value: 'all', label: 'Todos os meses válidos', meses: null },
];

export default function AdminMethodologyPage() {
  const { payload, reload, loading } = useData();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading || !payload) return null;

  const m = payload.settings?.methodology ?? defaultMethodologySettings();
  const janelaAtual = resolveJanelaAnaliseMeses(m);
  const janelaSelect = janelaAtual == null ? 'all' : String(janelaAtual);

  const save = async (patch: Partial<typeof m>) => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({
        methodology: { ...m, ...patch },
      });
      await reload();
      setMsg('Salvo. Visão geral e Distribuir mês usam a mesma janela.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const setJanela = (value: string) => {
    const opt = JANELA_OPCOES.find((o) => o.value === value) ?? JANELA_OPCOES[0];
    void save({
      janelaAnaliseMeses: opt.meses,
      janelaMediaMeses: opt.meses,
    });
  };

  return (
    <section className="panel">
      <h2>Metodologia e janela de análise</h2>
      <p className="hint">
        <strong>Todos os meses válidos</strong> usa a mesma lógica da nota técnica (regressão na
        série limpa + sazonalidade 2025 + faixas ± desvio). <strong>8/12/24</strong> usa só os
        últimos N meses na regressão. Meses excluídos (COVID, 2023, Abr/Mai 2026) permanecem visíveis
        no histórico.
      </p>

      <div className="config-grid">
        <label>
          Janela para tendência e previsão
          <select
            value={janelaSelect}
            onChange={(e) => setJanela(e.target.value)}
            disabled={saving}
          >
            {JANELA_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            checked={m.exclude2022Q1}
            onChange={(e) => void save({ exclude2022Q1: e.target.checked })}
            disabled={saving}
          />
          Excluir Jan–Mar/2022 (legado COVID)
        </label>
        <label>
          <input
            type="checkbox"
            checked={m.excludeYear2023}
            onChange={(e) => void save({ excludeYear2023: e.target.checked })}
            disabled={saving}
          />
          Excluir ano 2023 (racionamento)
        </label>
      </div>

      <p className="hint">
        Abr/2026 (ruptura) e Mai/2026 (parcial) são detectados automaticamente no histórico.
      </p>

      {msg && <p className="meta">{msg}</p>}
    </section>
  );
}
