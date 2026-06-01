import { useState } from 'react';
import {
  applyCoderpHistoricoImport,
  entradasFromBadImportRange,
  MESES_REQUISICAO_HISTORICO,
  MES_REFERENCIA_SEGURO,
  revertCargaPlanilhaIncorreta,
  TOTAL_MENSAL_EMERGENCIAL_PADRAO,
} from '@shared/requisicaoHistorico';
import type { CoderpParseResult } from '@shared/coderpPdfParser';
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
  const [msg, setMsg] = useState<string | null>(null);

  if (readOnly) return null;

  const entradasRuins = entradasFromBadImportRange(
    data.emergencial.monitoramento.entradasSemanais,
  ).length;

  const limparCargaIncorreta = () => {
    if (
      !window.confirm(
        'Remove envios semanais do monitoramento e histórico Mar–Set/2025 (carga da planilha operacional). Saldo e histórico longo (pivot) fora desse intervalo são mantidos. Continuar?',
      )
    ) {
      return;
    }
    onApply(revertCargaPlanilhaIncorreta(data));
    setMsg(
      'Carga incorreta removida do rascunho. Clique em Salvar monitoramento para gravar no banco.',
    );
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setMsg(null);
    setPreview(null);
    try {
      const result = await parseCoderpPdfFile(file, data.services);
      setPreview(result);
      if (!result.rows.length) {
        setMsg('Nenhum requisitante encontrado. Use o PDF Coderp oficial (RME).');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erro ao ler PDF');
    } finally {
      setParsing(false);
    }
  };

  const aplicar = () => {
    if (!preview?.rows.length) return;
    const { payload, linhasAplicadas, novosEquipamentos, mesesPreenchidos } =
      applyCoderpHistoricoImport(data, preview);
    onApply(payload);
    setMsg(
      `Histórico de requisição: ${linhasAplicadas} unidade(s), meses ${mesesPreenchidos.join(', ')} (total do período ÷ 6). ` +
        `Meta emergencial: ${TOTAL_MENSAL_EMERGENCIAL_PADRAO}/mês · referência ${MES_REFERENCIA_SEGURO}. ` +
        (novosEquipamentos.length
          ? `Novos: ${novosEquipamentos.slice(0, 4).join(', ')}. `
          : '') +
        'Envios semanais do monitoramento foram zerados. Salve e use a grade abaixo só para controle semanal.',
    );
    setPreview(null);
  };

  return (
    <section className="panel coderp-import">
      <h3>1. Limpar carga incorreta (se já importou a planilha Mar–Set)</h3>
      <p className="hint">
        {entradasRuins > 0
          ? `Há ${entradasRuins} lançamento(s) semanal(is) em meses da planilha operacional.`
          : 'Nenhum envio semanal suspeito detectado — pode pular se o banco já estiver limpo.'}
      </p>
      <button type="button" className="secondary" onClick={limparCargaIncorreta}>
        Limpar monitoramento + histórico Mar–Set/2025
      </button>

      <h3 style={{ marginTop: '1.25rem' }}>
        2. Importar requisição Coderp (histórico por serviço)
      </h3>
      <p className="hint">
        PDF <strong>Consumo por requisitante</strong> (ex. Out/2025–Abr/2026). O sistema
        distribui o <strong>total do período em 6 meses</strong> ({MESES_REQUISICAO_HISTORICO.join(', ')}
        ) — <strong>sem Abr/2026</strong>. Isso alimenta as <strong>proporções</strong> junto com
        o histórico longo da planilha pivot. Não preenche envios semanais.
      </p>
      <div className="config-grid">
        <label>
          PDF Coderp (RME)
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
          {preview.periodoLabel && (
            <p className="hint">
              Período no PDF: <strong>{preview.periodoLabel}</strong> → rateio em{' '}
              <strong>Out/25–Mar/26</strong> (6 meses). Mês seguro para metas:{' '}
              <strong>{MES_REFERENCIA_SEGURO}</strong>.
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
                  <th>Total período</th>
                  <th>≈ / mês (÷6)</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.codigo}>
                    <td title={r.requisitante}>{r.requisitante.slice(0, 40)}…</td>
                    <td>{r.canonicalNome ?? '—'}</td>
                    <td>{r.quantidade.toLocaleString('pt-BR')}</td>
                    <td>{Math.round(r.quantidade / 6).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="primary-btn" onClick={aplicar}>
            Importar histórico de requisição
          </button>
        </>
      )}
    </section>
  );
}
