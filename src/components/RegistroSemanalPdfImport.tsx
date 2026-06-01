import { useState } from 'react';
import { applyRegistroSemanalImport } from '@shared/registroSemanalImport';
import type { RegistroSemanalParseResult } from '@shared/registroSemanalPdfParser';
import { weekDateRangeLabel } from '@shared/emergencyMonitoring';
import { getYearMonth } from '@shared/monthUtils';
import type { ServicesPayload } from '@shared/serviceTypes';
import { parseRegistroSemanalPdfFile } from '../lib/registroSemanalPdfImport';

interface Props {
  data: ServicesPayload;
  mes: string;
  semana: number;
  onApply: (next: ServicesPayload) => void;
  readOnly?: boolean;
}

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export default function RegistroSemanalPdfImport({
  data,
  mes,
  semana,
  onApply,
  readOnly,
}: Props) {
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<RegistroSemanalParseResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const ym = getYearMonth(mes);
  const year = ym?.year ?? new Date().getFullYear();
  const month = ym?.month ?? new Date().getMonth() + 1;
  const rangeLabel = weekDateRangeLabel(year, month, semana);

  if (readOnly) return null;

  const rowsSemana =
    preview?.rows.filter((r) => r.semana === semana) ?? [];

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setMsg(null);
    setPreview(null);
    try {
      const result = await parseRegistroSemanalPdfFile(
        file,
        data.services,
        mes,
      );
      setPreview(result);
      const n = result.rows.filter((r) => r.semana === semana).length;
      if (!n) {
        setMsg(
          `PDF lido, mas sem linhas para ${mes} semana ${semana} (${rangeLabel}). Ajuste a semana ou use o PDF do mês correto.`,
        );
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao ler PDF');
    } finally {
      setParsing(false);
    }
  };

  const aplicar = () => {
    if (!preview) return;
    const { payload, linhasAplicadas, totalSemana, warnings } =
      applyRegistroSemanalImport(data, preview, mes, semana);
    onApply(payload);
    setMsg(
      `Registro real aplicado: ${linhasAplicadas} unidade(s), total ${num(totalSemana)} cestas na S${semana} (${rangeLabel}). ` +
        (warnings.length ? warnings[0] + ' ' : '') +
        'Clique em Salvar monitoramento.',
    );
    setPreview(null);
  };

  return (
    <section className="panel registro-semanal-import">
      <h3>Registro real da semana — PDF operacional</h3>
      <p className="hint">
        Documento do <strong>Banco</strong> com envios por equipamento (modelo{' '}
        <em>Março a Setembro</em>: CRAS 1…12, CREAS I–V, SAICA… por semana). Isso
        preenche o <strong>envio real</strong> da semana selecionada — não altera metas
        nem histórico Coderp.
      </p>
      <p className="hint">
        Destino: <strong>{mes}</strong> · <strong>Semana {semana}</strong> ({rangeLabel}
        ). Troque mês/semana nos seletores acima antes de importar.
      </p>
      <div className="config-grid">
        <label>
          PDF do registro (produção)
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={parsing}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {parsing && <p className="hint">Lendo PDF…</p>}
      {msg && <p className="hint">{msg}</p>}

      {preview && (
        <>
          {preview.mesDetectado && (
            <p className="hint">
              Mês no PDF: <strong>{preview.mesDetectado}</strong>
              {preview.semanasDetectadas.length > 0 && (
                <>
                  {' '}
                  · semanas encontradas: S
                  {preview.semanasDetectadas.join(', S')}
                </>
              )}
            </p>
          )}
          {preview.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="alerta-box alerta-nivel-moderado">
              {w}
            </p>
          ))}
          <p className="hint">
            Prévia para <strong>S{semana}</strong> ({rangeLabel}) —{' '}
            {rowsSemana.length} linha(s):
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Enviado</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {rowsSemana.map((r) => (
                  <tr key={`${r.unidade}-${r.semana}`}>
                    <td>{r.servicoNome ?? r.unidade}</td>
                    <td>
                      <strong>{num(r.quantidade)}</strong>
                    </td>
                    <td>{r.match === 'ok' ? 'OK' : 'Sem match'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>Total S{semana}</strong>
                  </td>
                  <td>
                    <strong>
                      {num(rowsSemana.reduce((s, r) => s + r.quantidade, 0))}
                    </strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button
            type="button"
            className="primary-btn"
            disabled={!rowsSemana.some((r) => r.match === 'ok')}
            onClick={aplicar}
          >
            Aplicar envios da semana {semana}
          </button>
        </>
      )}
    </section>
  );
}
