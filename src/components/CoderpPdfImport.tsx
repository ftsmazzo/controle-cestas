import { useState } from 'react';
import {
  applyCoderpHistoricoImport,
  entradasFromBadImportRange,
  MESES_REQUISICAO_HISTORICO,
  MES_REFERENCIA_SEGURO,
  normalizeCoderpImportRows,
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
    const {
      payload,
      linhasAplicadas,
      novosEquipamentos,
      mesesPreenchidos,
      notasRedistribuicao,
      reparoCadastro,
    } = applyCoderpHistoricoImport(data, preview);
    onApply(payload);
    const esperadas = normalizeCoderpImportRows(preview.rows).unidades.length;
    setMsg(
      `Histórico de requisição: ${linhasAplicadas}/${esperadas} unidade(s), meses ${mesesPreenchidos.join(', ')} (total do período ÷ 6). ` +
        (linhasAplicadas < esperadas
          ? 'Algumas unidades não foram gravadas — confira avisos. '
          : '') +
        `Meta emergencial: ${TOTAL_MENSAL_EMERGENCIAL_PADRAO}/mês · referência ${MES_REFERENCIA_SEGURO}. ` +
        (notasRedistribuicao.length
          ? `${notasRedistribuicao[0]} `
          : '') +
        (reparoCadastro?.length ? `${reparoCadastro.join(' ')} ` : '') +
        (novosEquipamentos.length
          ? `Novos: ${novosEquipamentos.slice(0, 4).join(', ')}. `
          : '') +
        'Clique em Salvar monitoramento para gravar no banco. Envios semanais foram zerados.',
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
        2. Importar Coderp — só para metas (histórico / rateio)
      </h3>
      <p className="hint">
        PDF <strong>Consumo por requisitante</strong> (ex. Out/2025–Abr/2026). Calcula{' '}
        <strong>proporções e metas</strong> por equipamento (total do período ÷ 6 meses:{' '}
        {MESES_REQUISICAO_HISTORICO.join(', ')}). <strong>Não</strong> é o registro semanal
        de produção — use o bloco <strong>Registro real da semana</strong> acima para envios
        reais. Banco/Nutrição → Mãos Dadas, SAICA e WARAOS conforme cotas.
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

      {preview && (() => {
        const norm = normalizeCoderpImportRows(preview.rows);
        return (
        <>
          {preview.periodoLabel && (
            <p className="hint">
              Período no PDF: <strong>{preview.periodoLabel}</strong> → rateio em{' '}
              <strong>Out/25–Mar/26</strong> (6 meses). Mês seguro para metas:{' '}
              <strong>{MES_REFERENCIA_SEGURO}</strong>.
            </p>
          )}
          {[...preview.warnings, ...norm.warnings].slice(0, 4).map((w, i) => (
            <p key={i} className="alerta-box alerta-nivel-moderado">
              {w}
            </p>
          ))}
          {norm.notas.map((n, i) => (
            <p key={`n-${i}`} className="hint">
              {n}
            </p>
          ))}
          <p className="hint">
            <strong>Após redistribuição</strong> (o que será gravado):
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Unidade</th>
                  <th>Total período</th>
                  <th>≈ / mês (÷6)</th>
                  <th>Origens</th>
                </tr>
              </thead>
              <tbody>
                {norm.unidades.map((u) => (
                  <tr key={u.unidade}>
                    <td>{u.unidade}</td>
                    <td>{u.quantidadePeriodo.toLocaleString('pt-BR')}</td>
                    <td>{Math.round(u.quantidadePeriodo / 6).toLocaleString('pt-BR')}</td>
                    <td title={u.origens.join(' · ')}>{u.origens.slice(0, 2).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="hint" style={{ marginTop: '0.75rem' }}>
            <summary>Linhas brutas do PDF</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Requisitante</th>
                    <th>Unidade (parser)</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.codigo}>
                      <td title={r.requisitante}>{r.requisitante.slice(0, 40)}…</td>
                      <td>{r.canonicalNome ?? '—'}</td>
                      <td>{r.quantidade.toLocaleString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <button type="button" className="primary-btn" onClick={aplicar}>
            Importar histórico de requisição
          </button>
        </>
        );
      })()}
    </section>
  );
}
