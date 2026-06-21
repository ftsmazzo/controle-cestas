import { useEffect, useMemo, useState } from 'react';
import { mergeAppSettings } from '@shared/appSettings';
import {
  buildLinhasCotasEquipamentos,
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
} from '@shared/adminConsumoGrade';
import type { ServicesPayload } from '@shared/serviceTypes';
import { saveServices } from '../../lib/servicesApi';
import { useData } from '../../context/DataContext';
import './AdminCotasPage.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : Math.max(0, Math.round(v));
}

export default function AdminCotasPage() {
  const { payload, reload, loading } = useData();
  const [draft, setDraft] = useState<ServicesPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (payload) {
      setDraft(payload);
      setDirty(false);
    }
  }, [payload]);

  const linhas = useMemo(
    () => (draft ? buildLinhasCotasEquipamentos(draft) : []),
    [draft],
  );

  if (loading || !draft) return null;

  const overrides = { ...(draft.settings?.cotasSemanaisOverrides ?? {}) };

  const setOverride = (servicoId: string, val: number | null) => {
    if (val == null || val <= 0) delete overrides[servicoId];
    else overrides[servicoId] = val;
    setDraft({
      ...draft,
      settings: mergeAppSettings(
        { cotasSemanaisOverrides: overrides },
        draft.settings,
      ),
    });
    setDirty(true);
  };

  const save = async () => {
    try {
      await saveServices(draft);
      await reload();
      setDirty(false);
      setMsg('Cotas salvas — painel público usará na próxima publicação.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro');
    }
  };

  const somaFlex = linhas
    .filter((l) => l.tipo === 'rateio')
    .reduce((s, l) => s + l.cotaSemanalEfetiva, 0);

  return (
    <div className="admin-cotas-page">
      <header className="panel admin-cotas-head">
        <div>
          <h1>Cotas por equipamento</h1>
          <p className="hint">
            Plano operacional (264 flex./sem.) com base no histórico{' '}
            {PERIODO_REFERENCIA_INICIO}–{PERIODO_REFERENCIA_FIM}. Use a chave
            para redistribuir entre CRAS/CREAS se necessário.
          </p>
        </div>
        <div className="admin-cotas-actions">
          <button
            type="button"
            className={editMode ? 'primary-btn' : 'secondary'}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? 'Edição ativa' : 'Editar cotas'}
          </button>
          <button
            type="button"
            className="primary-btn"
            disabled={!dirty}
            onClick={() => void save()}
          >
            Salvar
          </button>
        </div>
        {msg && <p className="hint">{msg}</p>}
      </header>

      <section className="panel">
        <p className="admin-cotas-soma hint">
          Soma flexível: <strong>{num(somaFlex)}</strong> / 264 por semana
        </p>
        <table className="admin-cotas-table">
          <thead>
            <tr>
              <th>Equipamento</th>
              <th>Média hist.</th>
              <th>% hist.</th>
              <th>Cota plano</th>
              <th>Cota efetiva</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.servicoId}
                className={l.tipo === 'fixo_mensal' ? 'row-fixo' : undefined}
              >
                <td>
                  {l.servicoNome}
                  {l.tipo === 'fixo_mensal' && (
                    <span className="badge-fixo">período</span>
                  )}
                </td>
                <td>{l.mediaHistorica > 0 ? num(l.mediaHistorica) : '—'}</td>
                <td>
                  {l.participacaoPct > 0
                    ? `${num(l.participacaoPct, 1)}%`
                    : '—'}
                </td>
                <td>{num(l.cotaSemanalPlano)}</td>
                <td>
                  {editMode && l.editavel ? (
                    <input
                      type="text"
                      inputMode="numeric"
                      className="admin-cotas-input"
                      value={
                        overrides[l.servicoId] != null
                          ? String(overrides[l.servicoId])
                          : l.cotaSemanalPlano > 0
                            ? String(l.cotaSemanalPlano)
                            : ''
                      }
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        setOverride(
                          l.servicoId,
                          v === '' ? null : parseQty(v),
                        );
                      }}
                    />
                  ) : (
                    <strong>{num(l.cotaSemanalEfetiva)}</strong>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
