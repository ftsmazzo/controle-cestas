import { useMemo, useState } from 'react';
import { suggestEmpenhoMeses } from '@shared/empenhoControle';
import {
  buildGradeConsumoSemanal,
  pctCorClasse,
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
} from '@shared/adminConsumoGrade';
import { MONITOR_CONTROLE_MES_INICIO, upsertWeeklyQty, ultimoLancamentoSemanal } from '@shared/emergencyMonitoring';
import {
  listarSemanasOperacionaisControle,
  proximaSemanaOperacional,
} from '@shared/operationalWeeks';
import type { ServicesPayload } from '@shared/serviceTypes';
import './AdminConsumoSemanalGrid.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : Math.max(0, Math.round(v));
}

interface Props {
  data: ServicesPayload;
  onUpdate: (next: ServicesPayload) => void;
}

export default function AdminConsumoSemanalGrid({ data, onUpdate }: Props) {
  const mon = data.emergencial.monitoramento;
  const empenhoMeses =
    data.emergencial.empenhoMeses?.length
      ? data.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          data.emergencial.duracaoMeses,
          MONITOR_CONTROLE_MES_INICIO,
        );

  const semanas = useMemo(
    () => listarSemanasOperacionaisControle(mon, empenhoMeses),
    [mon, empenhoMeses],
  );

  const indiceSugerido = useMemo(() => {
    const ultimo = ultimoLancamentoSemanal(mon);
    if (!ultimo) return semanas[0]?.indice ?? 1;
    const prox = proximaSemanaOperacional(
      ultimo.mes,
      ultimo.semana,
      empenhoMeses,
    );
    return prox?.indice ?? semanas.find(
      (s) => s.mes === ultimo.mes && s.semana === ultimo.semana,
    )?.indice ?? 1;
  }, [mon, empenhoMeses, semanas]);

  const tetoGrade = useMemo(() => {
    const comDados = semanas.filter((s) => s.temDados).map((s) => s.indice);
    return Math.max(indiceSugerido, ...comDados, 1);
  }, [semanas, indiceSugerido]);

  const [indiceEdit, setIndiceEdit] = useState<number | null>(null);
  const indiceAtivo = indiceEdit ?? indiceSugerido;

  const grade = useMemo(
    () => buildGradeConsumoSemanal(data, empenhoMeses, tetoGrade),
    [data, empenhoMeses, tetoGrade],
  );

  const colEdit = grade.colunas.find((c) => c.indice === indiceAtivo);

  const setQty = (servicoId: string, qty: number) => {
    if (!colEdit) return;
    const nextMon = upsertWeeklyQty(
      mon,
      colEdit.mes,
      colEdit.semana,
      servicoId,
      qty,
    );
    onUpdate({
      ...data,
      emergencial: { ...data.emergencial, monitoramento: nextMon },
    });
  };

  return (
    <div className="admin-consumo-grid-wrap">
      <p className="hint">
        Cada coluna = semana qua–ter (C1S1…). Cor = % da cota semanal. Clique uma
        coluna para editar valores manualmente (retirada mensal fixa, correções).
      </p>

      <div className="admin-consumo-scroll">
        <table className="admin-consumo-grid">
          <thead>
            <tr>
              <th className="admin-consumo-sticky">Equip.</th>
              {grade.colunas.map((col) => (
                <th
                  key={col.indice}
                  className={
                    col.indice === indiceAtivo ? 'col-ativa' : undefined
                  }
                  onClick={() => setIndiceEdit(col.indice)}
                  title={col.periodo}
                >
                  C{col.ciclo}S{col.semanaNoCiclo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grade.linhas.map((linha) => (
              <tr key={linha.servicoId}>
                <td className="admin-consumo-sticky admin-consumo-nome">
                  {linha.servicoNome}
                  {linha.tipo === 'fixo_mensal' && (
                    <span className="badge-fixo">fixo</span>
                  )}
                </td>
                {linha.celulas.map((cel) => (
                  <td
                    key={cel.indice}
                    className={`admin-consumo-cel ${pctCorClasse(cel.pctCota, cel.enviado > 0)} ${
                      cel.indice === indiceAtivo ? 'cel-ativa' : ''
                    }`}
                    onClick={() => setIndiceEdit(cel.indice)}
                    title={`${cel.periodo ?? ''} · cota ${cel.cota}`}
                  >
                    {cel.enviado > 0 ? (
                      <>
                        <strong>{num(cel.enviado)}</strong>
                        <span className="admin-consumo-pct">
                          {num(cel.pctCota, 0)}%
                        </span>
                      </>
                    ) : (
                      <span className="admin-consumo-vazio">·</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="admin-consumo-sticky">
                <strong>Total</strong>
              </td>
              {grade.colunas.map((col) => (
                <td key={col.indice}>
                  <strong>{num(col.enviado)}</strong>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {colEdit && (
        <section className="panel admin-consumo-edit">
          <h3>
            Editar — C{colEdit.ciclo}S{colEdit.semanaNoCiclo} · {colEdit.periodo}
          </h3>
          <p className="hint">
            Ajuste manual ou retirada mensal (SAICA/WARAOS/Mãos Dadas). Depois
            clique em Salvar na página Publicar semana.
          </p>
          <table className="admin-consumo-edit-table">
            <thead>
              <tr>
                <th>Equipamento</th>
                <th>Cota</th>
                <th>Enviado</th>
              </tr>
            </thead>
            <tbody>
              {grade.linhas.map((linha) => {
                const cel = linha.celulas.find((c) => c.indice === indiceAtivo);
                if (!cel) return null;
                return (
                  <tr key={linha.servicoId}>
                    <td>{linha.servicoNome}</td>
                    <td>{num(cel.cota)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="admin-consumo-input"
                        value={cel.enviado > 0 ? String(cel.enviado) : ''}
                        placeholder="0"
                        onChange={(e) =>
                          setQty(linha.servicoId, parseQty(e.target.value))
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <p className="hint admin-consumo-legenda">
        Referência histórica das cotas: {PERIODO_REFERENCIA_INICIO}–
        {PERIODO_REFERENCIA_FIM} · ver aba Cotas para ajustar distribuição.
      </p>
    </div>
  );
}
