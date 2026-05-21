import { useMemo, useState } from 'react';
import { allocateMonth, suggestNextMonths } from '@shared/allocation';
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
}

export default function DistribuicaoMesPanel({ data }: Props) {
  const mesesSugeridos = useMemo(
    () => suggestNextMonths(data.history, 6),
    [data.history],
  );

  const [mes, setMes] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [janelaMeses, setJanelaMeses] = useState<string>('8');
  const [resultado, setResultado] = useState<MonthAllocationResult | null>(null);

  const mesAtivo = mes.trim() || mesesSugeridos[0] || '';
  const total = parseQty(totalStr);

  const calcular = () => {
    if (!mesAtivo) return;
    if (total <= 0) return;
    const janela = janelaMeses === 'all' ? null : parseInt(janelaMeses, 10) || null;
    setResultado(
      allocateMonth(
        { mes: mesAtivo, totalDisponivel: total },
        data.services,
        data.history,
        {
          mediaWindowMonths: janela,
          excluirMesDistribuicao: true,
        },
      ),
    );
  };

  return (
    <section className="panel distribuicao-mes-panel">
      <h2>Distribuir cestas do mês (principal)</h2>
      <p className="hint">
        Informe o <strong>total de cestas do mês</strong>. O sistema divide entre os equipamentos
        pela <strong>média histórica</strong> de cada um (você escolhe a janela abaixo).
        Equipamentos marcados como{' '}
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
          Média baseada em
          <select
            value={janelaMeses}
            onChange={(e) => setJanelaMeses(e.target.value)}
          >
            <option value="8">Últimos 8 meses</option>
            <option value="6">Últimos 6 meses</option>
            <option value="12">Últimos 12 meses</option>
            <option value="3">Últimos 3 meses</option>
            <option value="all">Todo o histórico importado</option>
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
          {resultado.mesesJanelaUsados.length > 0 && (
            <p className="meta janela-meses">
              Meses usados na média:{' '}
              <strong>{resultado.mesesJanelaUsados.join(' · ')}</strong>
              {resultado.mediaJanelaMeses != null && (
                <> (últimos {resultado.mediaJanelaMeses}, antes do mês distribuído)</>
              )}
            </p>
          )}
          <AllocationResumoBox resultado={resultado} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>
                    Média
                    {resultado.mediaJanelaMeses
                      ? ` (${resultado.mediaJanelaMeses}m)`
                      : ' (tudo)'}
                  </th>
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
          <li>
            <strong>Soma das médias</strong> (ex.: 1.825) = só a soma do que cada equipamento
            consumia em média no passado. <em>Não</em> é projeção nem valor a entregar.
          </li>
          <li>
            <strong>Total do mês</strong> (ex.: 1.150) = o que você tem hoje; é isso que será
            dividido.
          </li>
          <li>Primeiro saem os fixos; o restante reparte entre os flexíveis pela média.</li>
          <li>
            Gráficos em <strong>Visão geral</strong> (“Projeção +3 meses”) usam outra regra:
            tendência dos meses <strong>completos</strong> — não esta divisão por equipamento.
          </li>
        </ol>
      </details>
    </section>
  );
}
