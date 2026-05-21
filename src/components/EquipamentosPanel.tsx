import { useMemo, useState } from 'react';
import { computeServiceStats } from '@shared/allocation';
import { parseMonthKey } from '@shared/monthUtils';
import type { ServiceDef, ServicesPayload } from '@shared/serviceTypes';
import { clearServices, importServices, saveServices } from '../lib/servicesApi';
import { demoServiceData, parseServiceWorkbook } from '../lib/serviceExcelParser';
import './ServicesPanel.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
}

const FORMAT_LABELS = {
  pivot: 'Equipamento × meses (Jan–Dez)',
  long: 'Mês + Serviço + Total',
  wide: 'Mês + colunas por serviço',
} as const;

interface Props {
  data: ServicesPayload | null;
  onDataChange: (d: ServicesPayload | null) => void;
  onReload: () => void;
}

export default function EquipamentosPanel({ data, onDataChange, onReload }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!data?.history.length) return [];
    return computeServiceStats(data.history, data.services.map((s) => s.id));
  }, [data]);

  const historyByMonth = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const h of data.history) {
      map.set(h.mes, (map.get(h.mes) ?? 0) + h.total);
    }
    return [...map.entries()].sort(
      (a, b) => parseMonthKey(a[0]) - parseMonthKey(b[0]),
    );
  }, [data]);

  const updateService = (id: string, patch: Partial<ServiceDef>) => {
    if (!data) return;
    onDataChange({
      ...data,
      services: data.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const year = parseInt(importYear, 10) || new Date().getFullYear();
      const parsed = parseServiceWorkbook(await file.arrayBuffer(), { year });
      const saved = await importServices(parsed.history, parsed.services);
      onDataChange(saved);
      setImportInfo(
        `Importado: ${FORMAT_LABELS[parsed.format]} · ano ${parsed.year} · ${parsed.services.length} equipamentos`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na planilha.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const demo = demoServiceData();
      const saved = await importServices(demo.history, demo.services);
      onDataChange(saved);
      setImportInfo(
        `Exemplo: ${FORMAT_LABELS[demo.format]} · ${demo.services.length} equipamentos`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="services-panel">
      <section className="panel">
        <h2>Base por equipamento</h2>
        <p className="hint">
          Planilha <strong>Equipamento + Jan…Dez</strong>. CRAS 1, CRAS 2, CREAS 1… são linhas
          separadas. Esta base alimenta o <strong>emergencial</strong> (4×1.200) e o{' '}
          <strong>regular</strong> (12 meses).
        </p>

        <div className="import-year-row">
          <label>
            Ano da planilha
            <input
              type="text"
              inputMode="numeric"
              value={importYear}
              onChange={(e) => setImportYear(e.target.value)}
            />
          </label>
        </div>

        <div className="upload-row">
          <label className="file-btn">
            {loading ? 'Processando…' : 'Importar planilha'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
          <button type="button" className="secondary" disabled={loading} onClick={() => void handleDemo()}>
            Carregar exemplo
          </button>
          {data?.history.length ? (
            <button
              type="button"
              className="secondary"
              disabled={loading}
              onClick={async () => {
                await clearServices();
                onDataChange(null);
                onReload();
              }}
            >
              Limpar
            </button>
          ) : null}
        </div>
        {error && <p className="error">{error}</p>}
        {importInfo && <p className="meta">{importInfo}</p>}
      </section>

      {data && data.services.length > 0 && (
        <>
          <section className="panel">
            <h3>Equipamentos — fixos e cotas</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Fixo</th>
                    <th>Cota fixa</th>
                    <th>Média hist.</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.services.map((s) => {
                    const st = stats.find((x) => x.servicoId === s.id);
                    return (
                      <tr key={s.id}>
                        <td>{s.nome}</td>
                        <td>
                          <input
                            type="checkbox"
                            checked={s.fixo}
                            onChange={(e) =>
                              updateService(s.id, { fixo: e.target.checked })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            type="text"
                            inputMode="numeric"
                            placeholder="Média"
                            value={s.cotaFixa ?? ''}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              updateService(s.id, {
                                cotaFixa: v === '' ? null : parseQty(v),
                              });
                            }}
                          />
                        </td>
                        <td>{st ? num(st.mediaHistorica) : '—'}</td>
                        <td>{st ? `${st.participacaoPct.toFixed(1)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="primary-btn"
              style={{ marginTop: '0.75rem' }}
              onClick={() => data && void saveServices(data).then(onDataChange)}
            >
              Salvar equipamentos
            </button>
          </section>

          {historyByMonth.length > 0 && (
            <section className="panel">
              <h3>Totais mensais (soma equipamentos)</h3>
              <p className="hint">
                Use no processo <strong>Regular</strong> com o botão “Preencher meses com soma
                dos equipamentos”.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyByMonth.map(([mes, total]) => (
                      <tr key={mes}>
                        <td>{mes}</td>
                        <td>{num(total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
