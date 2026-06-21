import { useMemo, type ReactNode } from 'react';
import { ultimoLancamentoSemanal } from '@shared/emergencyMonitoring';
import {
  listarSemanasOperacionaisControle,
  proximaSemanaOperacional,
  refSemanaOperacional,
  type SemanaOperacionalControle,
} from '@shared/operationalWeeks';
import type { ServicesPayload } from '@shared/serviceTypes';
import RegistroSemanalPdfImport from './RegistroSemanalPdfImport';
import './MonitorSemanaOperacionalImport.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface Props {
  data: ServicesPayload;
  empenhoMeses: string[];
  indice: number;
  onIndiceChange: (indice: number) => void;
  onApplyImport: (next: ServicesPayload) => void;
  saldoSlot: ReactNode;
  readOnly?: boolean;
}

export default function MonitorSemanaOperacionalImport({
  data,
  empenhoMeses,
  indice,
  onIndiceChange,
  onApplyImport,
  saldoSlot,
  readOnly,
}: Props) {
  const mon = data.emergencial.monitoramento;

  const semanas = useMemo(
    () => listarSemanasOperacionaisControle(mon, empenhoMeses),
    [mon, empenhoMeses],
  );

  const ultimo = useMemo(() => ultimoLancamentoSemanal(mon), [mon]);

  const indiceSugerido = useMemo(() => {
    if (!ultimo) return semanas[0]?.indice ?? 1;
    const prox = proximaSemanaOperacional(ultimo.mes, ultimo.semana, empenhoMeses);
    if (prox) return prox.indice;
    const found = semanas.find(
      (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
    );
    return found?.indice ?? semanas[0]?.indice ?? 1;
  }, [ultimo, empenhoMeses, semanas]);

  const sel: SemanaOperacionalControle | undefined =
    semanas.find((s) => s.indice === indice) ?? semanas[0];

  const ref = sel ? refSemanaOperacional(sel.indice, empenhoMeses) : null;

  return (
    <section className="panel monitor-semana-import">
      <h2 className="monitor-section-title">
        <span>1 ·</span> Publicar semana (PDF → Salvar)
      </h2>
      <ol className="monitor-semana-steps">
        <li>
          Escolha a <strong>semana qua–ter</strong> que o PDF representa (geralmente a
          que fechou na terça).
        </li>
        <li>Importe o PDF RME e confira a prévia.</li>
        <li>
          Clique em <strong>Salvar</strong> no topo da página para publicar no painel
          público.
        </li>
      </ol>

      <div className="monitor-semana-toolbar">
        <label className="monitor-semana-picker">
          Semana operacional
          <select
            value={sel?.indice ?? indice}
            disabled={readOnly}
            onChange={(e) => onIndiceChange(Number(e.target.value))}
          >
            {semanas.map((s) => (
              <option key={s.indice} value={s.indice}>
                P{s.ciclo} · S{s.semanaNoCiclo} — {s.periodo}
                {s.temDados ? ` · ${num(s.enviado)} cestas` : ' · vazio'}
                {s.indice === indiceSugerido ? ' · sugerida' : ''}
              </option>
            ))}
          </select>
        </label>
        {saldoSlot}
      </div>

      {sel && (
        <p className="monitor-semana-resumo">
          <strong>{sel.label}</strong> · {sel.periodo}
          {sel.temDados ? (
            <>
              {' '}
              · já lançado: <strong>{num(sel.enviado)}</strong> cestas
            </>
          ) : (
            <> · sem lançamento ainda</>
          )}
          {ultimo && (
            <>
              {' '}
              · último salvo:{' '}
              {(() => {
                const idx = semanas.find(
                  (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
                )?.indice;
                const refUlt =
                  idx != null
                    ? refSemanaOperacional(idx, empenhoMeses)
                    : null;
                return refUlt
                  ? `${refUlt.periodo} (${num(ultimo.totalCestas)} cestas)`
                  : `${ultimo.mes} S${ultimo.semana} (${num(ultimo.totalCestas)} cestas)`;
              })()}
            </>
          )}
        </p>
      )}

      {sel && (
        <RegistroSemanalPdfImport
          data={data}
          mes={sel.mes}
          semana={sel.semana}
          semanaOperacional={ref}
          readOnly={readOnly}
          onApply={onApplyImport}
        />
      )}
    </section>
  );
}
