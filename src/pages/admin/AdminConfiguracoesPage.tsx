import { useEffect, useMemo, useState } from 'react';
import { mergeAppSettings } from '@shared/appSettings';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../../lib/servicesApi';
import { useData } from '../../context/DataContext';

export default function AdminConfiguracoesPage() {
  const { payload, reload, loading } = useData();
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (payload) setDraft(payload);
  }, [payload]);

  const legadoVisivel = useMemo(
    () => draft?.settings?.admin?.menuLegadoVisivel === true,
    [draft],
  );

  if (loading || !draft) return null;

  const toggleLegado = async () => {
    const next = {
      ...draft,
      settings: mergeAppSettings(
        {
          admin: { menuLegadoVisivel: !legadoVisivel },
        },
        draft.settings,
      ),
    };
    setDraft(next);
    try {
      await saveServices(next);
      await reload();
      setMsg(
        !legadoVisivel
          ? 'Menu Legado habilitado.'
          : 'Menu Legado oculto.',
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  };

  return (
    <section className="panel">
      <h1>Configurações</h1>
      <p className="hint">
        Preferências da área administrativa. O painel público não é afetado.
      </p>

      <label className="admin-config-toggle">
        <input
          type="checkbox"
          checked={legadoVisivel}
          onChange={() => void toggleLegado()}
        />
        <span>
          <strong>Mostrar menu Legado</strong> — importações antigas,
          contratos, metodologia, sincronizar (uso esporádico).
        </span>
      </label>

      {msg && <p className="hint">{msg}</p>}
    </section>
  );
}
