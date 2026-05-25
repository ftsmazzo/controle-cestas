import { useState } from 'react';
import { defaultMethodologySettings } from '@shared/methodologyCalendar';
import { useData } from '../../context/DataContext';
import { saveSettings } from '../../lib/snapshotApi';

export default function AdminMethodologyPage() {
  const { payload, reload, loading } = useData();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (loading || !payload) return null;

  const m = payload.settings?.methodology ?? defaultMethodologySettings();

  const save = async (patch: Partial<typeof m>) => {
    setSaving(true);
    setMsg(null);
    try {
      await saveSettings({
        methodology: { ...m, ...patch },
      });
      await reload();
      setMsg('Metodologia salva. KPIs recalculados.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel">
      <h2>Calendário metodológico</h2>
      <p className="hint">
        Períodos que distorcem a análise ficam visíveis no histórico, mas fora da média e
        previsão. Ajustes aqui não exigem novo deploy.
      </p>

      <div className="config-grid">
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
          Excluir ano 2023 (racionamento estrutural)
        </label>
        <label>
          Janela de média (meses válidos)
          <input
            type="number"
            min={3}
            max={24}
            value={m.janelaMediaMeses}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10) || 8;
              void save({ janelaMediaMeses: n });
            }}
            disabled={saving}
          />
        </label>
      </div>

      <p className="hint">
        Abr/2026 (ruptura) e Mai/2026 (parcial) são aplicados automaticamente quando
        presentes no histórico.
      </p>

      {msg && <p className="meta">{msg}</p>}
    </section>
  );
}
