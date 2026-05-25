import { useMemo, useState } from 'react';
import { computeServiceStats } from '@shared/allocation';
import { parseMonthKey } from '@shared/monthUtils';
import { yearsDetectedInHistory } from '@shared/syncFromServices';
import type { ServiceDef, ServicesPayload } from '@shared/serviceTypes';
import { syncDashboardFromServices } from '../lib/api';
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
  onDashboardSynced?: () => void;
  /** import | equipamentos | all */
  section?: 'import' | 'equipamentos' | 'all';
}

export default function EquipamentosPanel({
  data,
  onDataChange,
  onReload,
  onDashboardSynced,
  section = 'all',
}: Props) {
  const showImport = section === 'import' || section === 'all';
  const showEquip = section === 'equipamentos' || section === 'all';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);

  const years = useMemo(
    () => (data?.history.length ? yearsDetectedInHistory(data.history) : []),
    [data],
  );

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

  const syncVisaoGeral = async () => {
    setSyncInfo(null);
    setError(null);
    try {
      await syncDashboardFromServices();
      setSyncInfo('Visão geral atualizada com os totais somados dos equipamentos.');
      onDashboardSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao sincronizar.');
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setSyncInfo(null);
    try {
      const parsed = parseServiceWorkbook(await file.arrayBuffer());
      const saved = await importServices(parsed.history, parsed.services, {
        merge: true,
        meta: {
          sourceFile: file.name,
          yearsDetected: parsed.years,
        },
      });
      onDataChange(saved);
      const anos =
        parsed.years.length > 1
          ? parsed.years.join(', ')
          : String(parsed.year);
      setImportInfo(
        `Importado: ${parsed.services.length} equipamentos · anos ${anos} · ${parsed.history.length} lançamentos · KPIs recalculados`,
      );
      onDashboardSynced?.();
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
      const saved = await importServices(demo.history, demo.services, {
        meta: { sourceFile: 'Exemplo', yearsDetected: demo.years },
      });
      onDataChange(saved);
      setImportInfo(
        `Exemplo: ${FORMAT_LABELS[demo.format]} · ${demo.services.length} equipamentos`,
      );
      onDashboardSynced?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="services-panel">
      {showImport && (
        <>
      <section className="panel source-truth-banner">
        <h2>Fonte única de dados</h2>
        <p className="hint">
          Importe <strong>somente esta planilha</strong> (equipamento × JANEIRO…DEZEMBRO). Os{' '}
          <strong>totais mensais</strong> e o <strong>painel de decisão</strong> são calculados
          automaticamente pela soma dos equipamentos.
        </p>
      </section>

      <section className="panel">
        <h2>Importar e validar</h2>
        <p className="hint">
          <strong>Uma aba por ano no Excel</strong> (nomes 2022, 2023, 2024…) ou várias tabelas na
          mesma aba. Valores <strong>PENDENTE</strong> são ignorados. Após o import, a Visão geral
          é atualizada sozinha.
        </p>

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

        {years.length > 0 && (
          <div className="years-detected">
            <span className="years-label">Anos no histórico:</span>
            {years.map((y) => (
              <span key={y} className="year-chip">
                {y}
              </span>
            ))}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {importInfo && <p className="meta">{importInfo}</p>}
        {syncInfo && <p className="meta sync-ok">{syncInfo}</p>}

        {data?.history.length ? (
          <button
            type="button"
            className="primary-btn"
            style={{ marginTop: '0.75rem' }}
            disabled={loading}
            onClick={() => void syncVisaoGeral()}
          >
            Atualizar Visão geral (totais)
          </button>
        ) : null}
      </section>
        </>
      )}

      {showEquip && data && data.services.length > 0 && (
        <>
          <section className="panel">
            <h3>Equipamentos — fixos e cotas</h3>
            <p className="hint">
              Marque <strong>Fixo</strong> ou informe <strong>Cota fixa</strong> (ex.: SAICA 40/mês)
              antes de usar Distribuir mês na consulta pública.
            </p>
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
              <h3>Totais mensais (soma dos equipamentos)</h3>
              <p className="hint">
                Estes valores alimentam o painel de decisão e o Registro de Preço.
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
