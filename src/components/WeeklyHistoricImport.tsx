import { useMemo, useState } from 'react';
import { applyWeeklyHistoricImport } from '@shared/applyWeeklyHistoricImport';
import {
  defaultHistoricRangeMarAgo2025,
  filterWeeklyRowsByMonthRange,
  type WeeklyHistoricParseResult,
} from '@shared/weeklyHistoricParser';
import type { ServicesPayload } from '@shared/serviceTypes';
import { parseWeeklyHistoricFile } from '../lib/weeklyHistoricImport';

interface Props {
  data: ServicesPayload;
  onApply: (next: ServicesPayload) => void;
  readOnly?: boolean;
}

export default function WeeklyHistoricImport({
  data,
  onApply,
  readOnly,
}: Props) {
  const range = defaultHistoricRangeMarAgo2025();
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<WeeklyHistoricParseResult | null>(null);
  const [useRange, setUseRange] = useState(true);
  const [substituir, setSubstituir] = useState(true);
  const [atualizarHistorico, setAtualizarHistorico] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!preview) return null;
    if (!useRange) return preview;
    const rows = filterWeeklyRowsByMonthRange(
      preview.rows,
      range.fromKey,
      range.toKey,
    );
    const mesesEncontrados = [...new Set(rows.map((r) => r.mes))].sort();
    return { ...preview, rows, mesesEncontrados };
  }, [preview, useRange, range.fromKey, range.toKey]);

  if (readOnly) return null;

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setMsg(null);
    setPreview(null);
    try {
      const result = await parseWeeklyHistoricFile(file);
      setPreview(result);
      if (!result.rows.length) {
        setMsg(
          'Nenhum dado semanal encontrado. Prefira o .xlsx original; PDFs às vezes perdem colunas.',
        );
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao ler arquivo');
    } finally {
      setParsing(false);
    }
  };

  const aplicar = () => {
    if (!filtered?.rows.length) return;
    const { payload, linhasAplicadas, semanasRegistradas, mesesImportados, novosEquipamentos } =
      applyWeeklyHistoricImport(data, filtered, {
        substituirMesesImportados: substituir,
        atualizarHistoricoMensal: atualizarHistorico,
      });
    onApply(payload);
    setMsg(
      `Carga histórica: ${linhasAplicadas} unidade(s) · ${semanasRegistradas} lançamento(s) semanal(is) · meses ${mesesImportados.join(', ')}.` +
        (novosEquipamentos.length
          ? ` Novos equipamentos: ${novosEquipamentos.slice(0, 4).join(', ')}…`
          : '') +
        ' Clique em Salvar monitoramento.',
    );
    setPreview(null);
  };

  const previewRows = filtered?.rows ?? [];
  const sample = previewRows.slice(0, 12);

  return (
    <section className="panel weekly-historic-import">
      <h3>Carga histórica — planilha semanal (Mar–Ago)</h3>
      <p className="hint">
        Use o arquivo <strong>operacional</strong> (SEMANA 1…4 + CRAS 1, Creas I…), como{' '}
        <code>Docs/MARÇO A SETEMBRO 2025.pdf</code> ou o Excel equivalente.{' '}
        <strong>Não</strong> é o PDF Coderp com &quot;Requisitante&quot; — esse é só para
        produção oficial depois.
      </p>
      <div className="config-grid">
        <label>
          Arquivo (.xlsx recomendado ou .pdf)
          <input
            type="file"
            accept=".xlsx,.xls,.pdf,application/pdf"
            disabled={parsing}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={useRange}
            onChange={(e) => setUseRange(e.target.checked)}
          />
          Só {range.label}
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={substituir}
            onChange={(e) => setSubstituir(e.target.checked)}
          />
          Substituir semanas já lançadas nesses meses
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={atualizarHistorico}
            onChange={(e) => setAtualizarHistorico(e.target.checked)}
          />
          Somar no histórico mensal (total das semanas)
        </label>
      </div>

      {parsing && <p className="hint">Lendo arquivo…</p>}
      {msg && <p className="hint">{msg}</p>}

      {preview && (
        <>
          {preview.warnings.map((w, i) => (
            <p key={i} className="alerta-box alerta-nivel-moderado">
              {w}
            </p>
          ))}
          <p className="hint">
            Meses detectados:{' '}
            <strong>{preview.mesesEncontrados.join(', ') || '—'}</strong>
            {useRange && (
              <>
                {' '}
                → após filtro {range.label}:{' '}
                <strong>{filtered?.mesesEncontrados.join(', ') || 'nenhum'}</strong> (
                {previewRows.length} linhas)
              </>
            )}
          </p>
          {previewRows.length > 0 && (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mês</th>
                      <th>Unidade</th>
                      <th>S1</th>
                      <th>S2</th>
                      <th>S3</th>
                      <th>S4</th>
                      <th>S5</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sample.map((r, i) => (
                      <tr key={`${r.mes}-${r.servicoNome}-${i}`}>
                        <td>{r.mes}</td>
                        <td>{r.servicoNome}</td>
                        {[0, 1, 2, 3, 4].map((w) => (
                          <td key={w}>{r.semanas[w] ?? '·'}</td>
                        ))}
                        <td>
                          <strong>
                            {r.semanas.reduce((s, n) => s + (n || 0), 0)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRows.length > sample.length && (
                <p className="hint">
                  … e mais {previewRows.length - sample.length} linhas.
                </p>
              )}
              <button type="button" className="primary-btn" onClick={aplicar}>
                Aplicar carga histórica ({previewRows.length} linhas)
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
