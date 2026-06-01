import { useState } from 'react';
import { applyCoderpImport } from '@shared/applyCoderpImport';
import type { CoderpParseResult } from '@shared/coderpPdfParser';
import { resolveMesMonitoramento } from '@shared/emergencyMonitoring';
import type { ServicesPayload } from '@shared/serviceTypes';
import { parseCoderpPdfFile } from '../lib/coderpPdfImport';

interface Props {
  data: ServicesPayload;
  onApply: (next: ServicesPayload) => void;
  readOnly?: boolean;
}

export default function CoderpPdfImport({ data, onApply, readOnly }: Props) {
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<CoderpParseResult | null>(null);
  const [mesAlvo, setMesAlvo] = useState(() =>
    resolveMesMonitoramento(data.emergencial),
  );
  const [semanaAlvo, setSemanaAlvo] = useState<number | ''>('');
  const [atualizarHistorico, setAtualizarHistorico] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (readOnly) return null;

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setMsg(null);
    setPreview(null);
    try {
      const result = await parseCoderpPdfFile(file, data.services);
      setPreview(result);
      if (!result.rows.length) {
        setMsg('Nenhuma linha reconhecida no PDF.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao ler PDF');
    } finally {
      setParsing(false);
    }
  };

  const aplicar = () => {
    if (!preview?.rows.length) return;
    const { payload, linhasAplicadas, novosEquipamentos } = applyCoderpImport(
      data,
      preview,
      {
        mes: mesAlvo,
        semana: semanaAlvo === '' ? undefined : Number(semanaAlvo),
        atualizarHistoricoMensal: atualizarHistorico,
      },
    );
    onApply(payload);
    setMsg(
      `Importado: ${linhasAplicadas} requisitante(s).` +
        (novosEquipamentos.length
          ? ` Novos: ${novosEquipamentos.slice(0, 5).join(', ')}${novosEquipamentos.length > 5 ? '…' : ''}.`
          : '') +
        ' Salve o monitoramento.',
    );
    setPreview(null);
  };

  return (
    <section className="panel coderp-import">
      <h3>Importar PDF Coderp (RME por requisitante)</h3>
      <p className="hint">
        Relatório &quot;Consumo de Materiais (Requisitante/SubClasse)&quot; — mapeia SETOR
        CRAS1, CREAS II, etc. para as <strong>unidades</strong> (12 CRAS + 5 CREAS + demais).
      </p>
      <div className="config-grid">
        <label>
          PDF Coderp
          <input
            type="file"
            accept="application/pdf,.pdf"
            disabled={parsing}
            onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label>
          Mês alvo (monitoramento)
          <select value={mesAlvo} onChange={(e) => setMesAlvo(e.target.value)}>
            {data.emergencial.plans.map((p) => (
              <option key={p.mes} value={p.mes}>
                {p.mes}
              </option>
            ))}
            <option value={mesAlvo}>{mesAlvo}</option>
          </select>
        </label>
        <label>
          Semana única (opcional)
          <select
            value={semanaAlvo}
            onChange={(e) =>
              setSemanaAlvo(e.target.value === '' ? '' : Number(e.target.value))
            }
          >
            <option value="">Dividir nas 4–5 semanas</option>
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={w}>
                Semana {w} (tudo nesta)
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={atualizarHistorico}
            onChange={(e) => setAtualizarHistorico(e.target.checked)}
          />
          Atualizar histórico mensal
        </label>
      </div>

      {parsing && <p className="hint">Lendo PDF…</p>}
      {msg && <p className="hint">{msg}</p>}

      {preview && (
        <>
          {preview.periodoLabel && (
            <p className="hint">
              Período no PDF: <strong>{preview.periodoLabel}</strong> — quantidades serão
              lançadas em <strong>{mesAlvo}</strong>
              {semanaAlvo === '' ? ' (rateio semanal)' : ` (semana ${semanaAlvo})`}.
            </p>
          )}
          {preview.warnings.slice(0, 3).map((w, i) => (
            <p key={i} className="alerta-box alerta-nivel-moderado">
              {w}
            </p>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Requisitante</th>
                  <th>Unidade</th>
                  <th>Qtd</th>
                  <th>Match</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.codigo} className={r.match === 'unmatched' ? 'row-unmatched' : ''}>
                    <td title={r.requisitante}>{r.requisitante.slice(0, 48)}…</td>
                    <td>{r.canonicalNome ?? '—'}</td>
                    <td>{r.quantidade.toLocaleString('pt-BR')}</td>
                    <td>{r.match}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="primary-btn" onClick={aplicar}>
            Aplicar ao monitoramento
          </button>
        </>
      )}
    </section>
  );
}
