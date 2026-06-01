import { useEffect, useState } from 'react';
import {
  defaultMethodologySettings,
  detectPeriodoPresetId,
  mergeMethodologySettings,
  PERIODO_ESTUDO_PRESETS,
  periodoPresetById,
  resolveJanelaAnaliseMeses,
  resolvePeriodoEstudo,
} from '@shared/methodologyCalendar';
import { formatMonthKeyPt } from '@shared/monthUtils';
import { useData } from '../../context/DataContext';
import { saveSettings } from '../../lib/snapshotApi';

const JANELA_OPCOES: { value: string; label: string; meses: number | null }[] = [
  { value: '4', label: 'Últimos 4 meses válidos', meses: 4 },
  { value: '8', label: 'Últimos 8 meses válidos', meses: 8 },
  { value: '12', label: 'Últimos 12 meses válidos', meses: 12 },
  { value: '24', label: 'Últimos 24 meses válidos', meses: 24 },
  { value: 'all', label: 'Todos os meses válidos', meses: null },
];

export default function AdminMethodologyPage() {
  const { payload, reload, loading } = useData();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [janelaDraft, setJanelaDraft] = useState('all');
  const [periodoDraft, setPeriodoDraft] = useState(PERIODO_ESTUDO_PRESETS[0].id);
  const [exclude2022, setExclude2022] = useState(true);
  const [exclude2023, setExclude2023] = useState(true);

  const m = payload?.settings?.methodology ?? defaultMethodologySettings();

  useEffect(() => {
    if (!payload) return;
    const meth = payload.settings?.methodology ?? defaultMethodologySettings();
    const janela = resolveJanelaAnaliseMeses(meth);
    setJanelaDraft(janela == null ? 'all' : String(janela));
    const per = resolvePeriodoEstudo(meth);
    setPeriodoDraft(detectPeriodoPresetId(per.from, per.to));
    setExclude2022(meth.exclude2022Q1);
    setExclude2023(meth.excludeYear2023);
  }, [payload]);

  if (loading || !payload) return null;

  const salvar = async () => {
    setSaving(true);
    setMsg(null);
    const janelaOpt =
      JANELA_OPCOES.find((o) => o.value === janelaDraft) ?? JANELA_OPCOES[3];
    const periodoOpt = periodoPresetById(periodoDraft);
    try {
      const next = mergeMethodologySettings(m, {
        janelaAnaliseMeses: janelaOpt.meses,
        janelaMediaMeses: janelaOpt.meses,
        periodoEstudoFrom: periodoOpt.from,
        periodoEstudoTo: periodoOpt.to,
        exclude2022Q1: exclude2022,
        excludeYear2023: exclude2023,
      });
      await saveSettings({ methodology: next });
      await reload();
      setMsg('Configurações salvas.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const per = periodoPresetById(periodoDraft);

  return (
    <section className="panel">
      <h2>Metodologia e períodos</h2>
      <p className="hint">
        Ajuste abaixo e clique em <strong>Salvar</strong>. O período de estudo alimenta a aba
        Consumo e as cotas de referência. A janela de análise define a tendência no painel de
        decisão.
      </p>

      <div className="config-grid">
        <label>
          Período de estudo (Consumo e cotas)
          <select
            value={periodoDraft}
            onChange={(e) => setPeriodoDraft(e.target.value)}
            disabled={saving}
          >
            {PERIODO_ESTUDO_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Janela para tendência e previsão
          <select
            value={janelaDraft}
            onChange={(e) => setJanelaDraft(e.target.value)}
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
            checked={exclude2022}
            onChange={(e) => setExclude2022(e.target.checked)}
            disabled={saving}
          />
          Excluir Jan–Mar/2022 (legado COVID)
        </label>
        <label>
          <input
            type="checkbox"
            checked={exclude2023}
            onChange={(e) => setExclude2023(e.target.checked)}
            disabled={saving}
          />
          Excluir ano 2023 (racionamento)
        </label>
      </div>

      <p className="meta">
        Período selecionado: {formatMonthKeyPt(per.from)} a {formatMonthKeyPt(per.to)} · Janela
        previsão:{' '}
        {janelaDraft === 'all'
          ? 'todos os válidos'
          : `últimos ${janelaDraft} meses`}
      </p>

      <button
        type="button"
        className="primary-btn"
        disabled={saving}
        onClick={() => void salvar()}
      >
        {saving ? 'Salvando…' : 'Salvar metodologia'}
      </button>

      <p className="hint">
        Abr/2026 (ruptura) e Mai/2026 (parcial) são detectados automaticamente quando existem no
        histórico. Se você removeu esses meses da planilha, eles não aparecem.
      </p>

      {msg && <p className="meta sync-ok">{msg}</p>}
    </section>
  );
}
