import { useMemo, useState } from 'react';
import { allocateMonth, suggestNextMonths } from '@shared/allocation';
import type { MonthAllocationResult, ServicesPayload } from '@shared/serviceTypes';
import './DistribuicaoMesPanel.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : v;
}

interface Props {
  data: ServicesPayload;
}

export default function DistribuicaoMesPanel({ data }: Props) {
  const mesesSugeridos = useMemo(
    () => suggestNextMonths(data.history, 6),
    [data.history],
  );

  const [mes, setMes] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [resultado, setResultado] = useState<MonthAllocationResult | null>(null);

  const mesAtivo = mes.trim() || mesesSugeridos[0] || '';
  const total = parseQty(totalStr);

  const calcular = () => {
    if (!mesAtivo) return;
    if (total <= 0) return;
    setResultado(
      allocateMonth(
        { mes: mesAtivo, totalDisponivel: total },
        data.services,
        data.history,
      ),
    );
  };

  return (
    <section className="panel distribuicao-mes-panel">
      <h2>Distribuir cestas do mês (principal)</h2>
      <p className="hint">
        Informe o <strong>total de cestas do mês</strong>. O sistema divide entre os equipamentos
        pela <strong>média histórica</strong> de cada um. Equipamentos marcados como{' '}
        <strong>fixos</strong> (abaixo) recebem a cota ou a média antes; o restante é repartido
        proporcionalmente.
      </p>

      <div className="distribuicao-form">
        <label>
          Mês
          <select
            value={mes || mesesSugeridos[0] || ''}
            onChange={(e) => setMes(e.target.value)}
          >
            {mesesSugeridos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Total de cestas no mês
          <input
            type="text"
            inputMode="numeric"
            placeholder="Ex.: 1150"
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="primary-btn"
          disabled={total <= 0}
          onClick={calcular}
        >
          Calcular por equipamento
        </button>
      </div>

      {resultado && (
        <div className="distribuicao-resultado">
          <h3>
            {resultado.mes} — {num(resultado.totalDisponivel)} cestas →{' '}
            {num(resultado.totalAlocado)} distribuídas
            {resultado.sobra !== 0 && (
              <span className="sobra"> (sobra {num(resultado.sobra)})</span>
            )}
          </h3>
          <p className="meta">
            Demanda de referência (soma das médias):{' '}
            <strong>{num(resultado.totalDemandaReferencia)}</strong>
          </p>
          {resultado.alerta && <p className="error">{resultado.alerta}</p>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Média hist.</th>
                  <th>% histórico</th>
                  <th>Alocar (cestas)</th>
                  <th>Obs.</th>
                </tr>
              </thead>
              <tbody>
                {[...resultado.linhas]
                  .sort((a, b) => b.alocado - a.alocado)
                  .map((l) => (
                    <tr key={l.servicoId} className={l.fixo ? 'row-fixo' : ''}>
                      <td>{l.servicoNome}</td>
                      <td>{num(l.mediaHistorica)}</td>
                      <td>{l.participacaoHistoricaPct.toFixed(1)}%</td>
                      <td>
                        <strong>{num(l.alocado)}</strong>
                      </td>
                      <td className="obs-cell">{l.observacao}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{num(resultado.totalAlocado)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <details className="distribuicao-ajuda">
        <summary>Como funciona a conta</summary>
        <ol>
          <li>Calcula a média mensal de cada equipamento no histórico importado.</li>
          <li>
            Reserva primeiro os <strong>fixos</strong> (cota fixa digitada, ou média se marcado
            fixo).
          </li>
          <li>
            O que sobrar divide entre os demais na proporção da média (ex.: CRAS com média maior
            recebe mais).
          </li>
          <li>
            Para vários meses (ex. emergencial 4×1.200), use também a aba{' '}
            <strong>Emergencial</strong>.
          </li>
        </ol>
      </details>
    </section>
  );
}
