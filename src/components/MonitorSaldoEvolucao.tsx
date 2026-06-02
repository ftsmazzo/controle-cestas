import { useMemo } from 'react';
import { buildEvolucaoSaldoEmpenho } from '@shared/processoEmergencial';
import type { ServicesPayload } from '@shared/serviceTypes';
import PrintableTable from './ui/PrintableTable';
import './MonitorSaldoEvolucao.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  data: ServicesPayload;
}

export default function MonitorSaldoEvolucao({ data }: Props) {
  const rows = useMemo(() => buildEvolucaoSaldoEmpenho(data), [data]);
  const total =
    data.emergencial.empenhoTotalCestas ??
    rows[0]?.saldoRestante ??
    4800;
  const ultimo = rows[rows.length - 1];
  const pctUsado =
    total > 0 && ultimo ? ((total - ultimo.saldoRestante) / total) * 100 : 0;

  if (rows.length <= 1) {
    return (
      <p className="hint monitor-saldo-empty">
        Lance as semanas via PDF para ver o saldo caindo semana a semana.
      </p>
    );
  }

  return (
    <div className="monitor-saldo-evolucao">
      <div className="monitor-saldo-track" role="img" aria-label="Saldo restante do empenho">
        <div
          className="monitor-saldo-fill"
          style={{ width: `${Math.min(100, pctUsado)}%` }}
        />
      </div>
      <p className="monitor-saldo-resumo">
        <strong>{num(ultimo?.saldoRestante ?? total)}</strong> cestas restantes de{' '}
        {num(total)} ({num(pctUsado, 0)}% consumido)
      </p>
      <PrintableTable
        title="Evolução do saldo do empenho"
        subtitle={`${num(total)} cestas · ${num(pctUsado, 0)}% consumido`}
        orientation="portrait"
      >
        <table className="monitor-saldo-table">
          <thead>
            <tr>
              <th>Período</th>
              <th>Enviado sem.</th>
              <th>Acumulado</th>
              <th>Saldo restante</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(1).map((r, i) => (
              <tr key={`${r.mes}-${r.semana}-${i}`}>
                <td>{r.periodo}</td>
                <td>{num(r.enviadoSemana)}</td>
                <td>{num(r.enviadoAcumulado)}</td>
                <td>
                  <strong>{num(r.saldoRestante)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintableTable>
    </div>
  );
}
