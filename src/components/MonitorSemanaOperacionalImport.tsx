import { useMemo, type ReactNode } from 'react';
import { ultimoLancamentoSemanal } from '@shared/emergencyMonitoring';
import {
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
  /** Semanas visíveis no seletor (já filtradas) */
  semanas: SemanaOperacionalControle[];
  indice: number;
  indiceSugerido: number;
  onIndiceChange: (indice: number) => void;
  onApplyImport: (next: ServicesPayload) => void;
  saldoSlot?: ReactNode;
  readOnly?: boolean;
}

export default function MonitorSemanaOperacionalImport({
  data,
  empenhoMeses,
  semanas,
  indice,
  indiceSugerido,
  onIndiceChange,
  onApplyImport,
  saldoSlot,
  readOnly,
}: Props) {
  const mon = data.emergencial.monitoramento;
  const ultimo = useMemo(() => ultimoLancamentoSemanal(mon), [mon]);

  const sel = semanas.find((s) => s.indice === indice) ?? semanas[0];
  const ref = sel ? refSemanaOperacional(sel.indice, empenhoMeses) : null;

  return (
    <section className="panel monitor-semana-import">
      <h2>Importar semana</h2>
      <p className="hint">
        Terça fechou → quarta importe o PDF RME da semana qua–ter →{' '}
        <strong>Salvar</strong> no topo.
      </p>

      <div className="monitor-semana-toolbar">
        <label className="monitor-semana-picker">
          Semana qua–ter
          <select
            value={sel?.indice ?? indice}
            disabled={readOnly}
            onChange={(e) => onIndiceChange(Number(e.target.value))}
          >
            {semanas.map((s) => (
              <option key={s.indice} value={s.indice}>
                P{s.ciclo} · S{s.semanaNoCiclo} — {s.periodo}
                {s.temDados ? ` · ${num(s.enviado)}` : ''}
                {s.indice === indiceSugerido ? ' · sugerida' : ''}
              </option>
            ))}
          </select>
        </label>
        {saldoSlot}
      </div>

      {sel && (
        <p className="monitor-semana-resumo">
          {sel.temDados ? (
            <>
              Esta semana: <strong>{num(sel.enviado)}</strong> cestas lançadas.
            </>
          ) : (
            <>Sem lançamento nesta semana.</>
          )}
          {ultimo && (
            <>
              {' '}
              Última salva:{' '}
              {(() => {
                const idx = semanas.find(
                  (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
                )?.indice;
                const refUlt =
                  idx != null
                    ? refSemanaOperacional(idx, empenhoMeses)
                    : null;
                return refUlt
                  ? `${refUlt.periodo} (${num(ultimo.totalCestas)})`
                  : `${num(ultimo.totalCestas)} cestas`;
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
