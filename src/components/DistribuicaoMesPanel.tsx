import { useMemo, useState } from 'react';
import { allocateMonth } from '@shared/allocation';
import { suggestPlanningMonths } from '@shared/planningMonths';
import type { MonthAllocationResult, ServicesPayload } from '@shared/serviceTypes';
import AllocationResumoBox from './AllocationResumoBox';
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
  validMonthKeys?: number[];
  excludedMonthKeys?: number[];
  janelaPadrao?: number | null;
  previsaoProximoMes?: number | null;
}

export default function DistribuicaoMesPanel({
  data,
  validMonthKeys = [],
  excludedMonthKeys = [],
  janelaPadrao = 8,
  previsaoProximoMes = null,
}: Props) {
  const mesesSugeridos = useMemo(
    () => suggestPlanningMonths(validMonthKeys, 8, excludedMonthKeys),
    [validMonthKeys, excludedMonthKeys],
  );

  const [mes, setMes] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const janelaStr =
    janelaPadrao != null && janelaPadrao > 0 ? String(janelaPadrao) : 'all';
  const [janelaMeses, setJanelaMeses] = useState<string>(janelaStr);
  const [resultado, setResultado] = useState<MonthAllocationResult | null>(null);

  const mesAtivo = mes.trim() || mesesSugeridos[0] || '';
  const total = parseQty(totalStr);

  const calcular = () => {
    if (!mesAtivo || total <= 0) return;
    const janela = janelaMeses === 'all' ? null : parseInt(janelaMeses, 10) || null;
    setResultado(
      allocateMonth(
        { mes: mesAtivo, totalDisponivel: total },
        data.services,
        data.history,
        {
          mediaWindowMonths: janela,
          excluirMesDistribuicao: true,
          validMonthKeys,
        },
      ),
    );
  };

  const usarPrevisao = () => {
    if (previsaoProximoMes != null && previsaoProximoMes > 0) {
      setTotalStr(String(Math.round(previsaoProximoMes)));
    }
  };

  return (
    <div className="distribuicao-mes-panel">
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
          Janela (média por equipamento)
          <select value={janelaMeses} onChange={(e) => setJanelaMeses(e.target.value)}>
            <option value="4">Últimos 4 meses válidos</option>
            <option value="8">Últimos 8 meses válidos</option>
            <option value="12">Últimos 12 meses válidos</option>
            <option value="24">Últimos 24 meses válidos</option>
            <option value="all">Todos os meses válidos</option>
          </select>
        </label>
        <label>
          Total de cestas no mês
          <input
            type="text"
            inputMode="numeric"
            placeholder={
              previsaoProximoMes != null
                ? `Previsão painel: ${num(previsaoProximoMes)}`
                : 'Ex.: 1200'
            }
            value={totalStr}
            onChange={(e) => setTotalStr(e.target.value)}
          />
        </label>
        {previsaoProximoMes != null && previsaoProximoMes > 0 && (
          <button type="button" className="secondary" onClick={usarPrevisao}>
            Usar previsão ({num(previsaoProximoMes)})
          </button>
        )}
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
          {resultado.mesesJanelaUsados.length > 0 && (
            <p className="meta janela-meses">
              Meses válidos na média (sem Abr/Mai ruptura):{' '}
              <strong>{resultado.mesesJanelaUsados.join(' · ')}</strong>
            </p>
          )}
          {resultado.alerta && (
            <p className="error">{resultado.alerta}</p>
          )}
          <AllocationResumoBox resultado={resultado} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Média histórica</th>
                  <th>%</th>
                  <th>Alocar</th>
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
                    <strong>Soma alocada</strong>
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
        <summary>O que cada número significa</summary>
        <ul>
          <li>
            <strong>Total do mês</strong> = o que você informa; deve bater com a soma dos
            equipamentos na planilha.
          </li>
          <li>
            <strong>Previsão na Visão geral</strong> = regressão no total mensal (mesma janela).
          </li>
          <li>
            <strong>Soma das médias por equipamento</strong> (ex. ~1.865) = só referência se cada
            um recebesse sua média; não é previsão nem meta de entrega.
          </li>
        </ul>
      </details>
    </div>
  );
}
