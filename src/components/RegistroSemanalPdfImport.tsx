import { useState } from 'react';
import { applyRegistroSemanalImport } from '@shared/registroSemanalImport';
import type { RegistroSemanalParseResult } from '@shared/registroSemanalPdfParser';
import type { SemanaOperacionalRef } from '@shared/operationalWeeks';
import type { ServicesPayload } from '@shared/serviceTypes';
import { parseRegistroSemanalPdfFile } from '../lib/registroSemanalPdfImport';
import PrintableTable from './ui/PrintableTable';

interface Props {
  data: ServicesPayload;
  mes: string;
  semana: number;
  /** Rótulo qua–ter (P2·S1, 17–23 Jun…) */
  semanaOperacional?: SemanaOperacionalRef | null;
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
  semanaOperacional,
  onApply,
  readOnly,
}: Props) {
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<RegistroSemanalParseResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const periodoLabel =
    semanaOperacional?.periodo ??
    `${mes} · semana civil ${semana}`;
  const tituloSemana =
    semanaOperacional != null
      ? `P${semanaOperacional.ciclo} · S${semanaOperacional.semanaNoCiclo}`
      : `S${semana}`;

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
        semana,
      );
      setPreview(result);
      const n = result.rows.filter((r) => r.semana === semana).length;
      if (!n) {
        setMsg(
          `PDF lido, mas sem linhas para ${tituloSemana} (${periodoLabel}). Escolha outra semana operacional ou confira o PDF.`,
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
      `Registro aplicado: ${linhasAplicadas} unidade(s), total ${num(totalSemana)} cestas · ${tituloSemana} (${periodoLabel}). ` +
        (warnings.length ? warnings[0] + ' ' : '') +
        'Clique em Salvar no topo da página.',
    );
    setPreview(null);
  };

  return (
    <section className="registro-semanal-import">
      <h3>Importar PDF RME (envio real da semana)</h3>
      <p className="hint">
        Relatório <strong>Consumo por requisitante</strong> da semana qua–ter (ex.{' '}
        <em>CESTAS 18.05.26 A 24.05.26.pdf</em>). Cada CRAS/CREAS/NAEM vira envio
        real. <strong>Não</strong> altera cotas — só registra o que foi entregue.
      </p>
      <p className="hint">
        Destino: <strong>{tituloSemana}</strong> · {periodoLabel}
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
              {preview.modo === 'rme_semanal' ? (
                <>
                  {' '}
                  · <strong>RME semanal</strong>
                  {preview.semanaAplicada != null && (
                    <> → S{preview.semanaAplicada}</>
                  )}
                </>
              ) : preview.modo === 'semana_unica' ? (
                <>
                  {' '}
                  · <strong>planilha · semana única</strong>
                  {preview.semanaAplicada != null && (
                    <> → S{preview.semanaAplicada}</>
                  )}
                </>
              ) : (
                preview.semanasDetectadas.length > 0 && (
                  <>
                    {' '}
                    · colunas: S
                    {preview.semanasDetectadas.join(', S')}
                  </>
                )
              )}
            </p>
          )}
          {preview.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="alerta-box alerta-nivel-moderado">
              {w}
            </p>
          ))}
          <p className="hint">
            Prévia — <strong>{tituloSemana}</strong> ({periodoLabel}) ·{' '}
            {rowsSemana.length} linha(s):
          </p>
          <PrintableTable
            title={`Prévia envio — ${tituloSemana}`}
            subtitle={periodoLabel}
            orientation="landscape"
          >
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
          </PrintableTable>
          <button
            type="button"
            className="primary-btn"
            disabled={!rowsSemana.some((r) => r.match === 'ok')}
            onClick={aplicar}
          >
            Aplicar envios · {tituloSemana}
          </button>
        </>
      )}
    </section>
  );
}
