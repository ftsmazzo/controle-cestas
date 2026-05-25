import {
  buildAllocationAviso,
  buildAllocationResumo,
} from '@shared/allocationExplain';
import type { MonthAllocationResult } from '@shared/serviceTypes';
import './AllocationResumoBox.css';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

interface Props {
  resultado: MonthAllocationResult;
}

export default function AllocationResumoBox({ resultado }: Props) {
  const resumo = buildAllocationResumo(resultado);
  const aviso = buildAllocationAviso(resultado, resumo);

  return (
    <div className="allocation-resumo-box">
      <h4>Como o total foi dividido (passo a passo)</h4>
      <div className="resumo-fluxo">
        <div className="resumo-step resumo-step-input">
          <span className="resumo-label">1. Você informou</span>
          <strong>{num(resumo.cestasInformadas)} cestas</strong>
          <small>É o único valor que o sistema distribui neste mês.</small>
        </div>
        <div className="resumo-arrow">↓</div>
        <div className="resumo-step">
          <span className="resumo-label">2. Reserva para fixos</span>
          <strong>{num(resumo.reservadoFixos)} cestas</strong>
          <small>Equipamentos com cota fixa ou marcados como fixo.</small>
        </div>
        <div className="resumo-arrow">↓</div>
        <div className="resumo-step">
          <span className="resumo-label">3. Reparte entre os demais</span>
          <strong>{num(resumo.repartidoFlexiveis)} cestas</strong>
          <small>
            Proporcional à média de cada flexível
            {resultado.mediaJanelaMeses != null
              ? ` (últimos ${resultado.mediaJanelaMeses} meses)`
              : ' (todo histórico)'}
            .
          </small>
        </div>
        <div className="resumo-arrow">=</div>
        <div className="resumo-step resumo-step-total">
          <span className="resumo-label">Total distribuído</span>
          <strong>{num(resultado.totalAlocado)} cestas</strong>
        </div>
      </div>

      <details className="resumo-referencia">
        <summary>
          Soma das médias por equipamento ({num(resumo.somaMediasHistoricas)}) — só referência
        </summary>
        <p>
          Se cada equipamento recebesse <strong>exatamente</strong> sua média (
          {resultado.mediaJanelaMeses != null
            ? `últimos ${resultado.mediaJanelaMeses} meses válidos`
            : 'todos os válidos'}
          {resultado.mesesJanelaUsados.length > 0 && (
            <> — {resultado.mesesJanelaUsados.join(', ')}</>
          )}
          ), a soma seria <strong>{num(resumo.somaMediasHistoricas)} cestas</strong>. Isso{' '}
          <strong>não</strong> é previsão do painel nem o total a entregar — apenas comparação com
          o passado.
        </p>
        {resumo.diferencaVsHabitual > 0 && (
          <p className="resumo-diff">
            Você informou <strong>{num(resumo.cestasInformadas)}</strong>, ou seja{' '}
            <strong>−{num(resumo.diferencaVsHabitual)}</strong> abaixo da soma das médias.
          </p>
        )}
        {resumo.diferencaVsHabitual <= 0 && (
          <p className="resumo-diff ok">
            O total informado cobre ou supera a soma das médias históricas.
          </p>
        )}
      </details>

      {aviso && (
        <div className={`allocation-aviso allocation-aviso-${aviso.nivel}`}>
          <strong>{aviso.titulo}</strong>
          <p>{aviso.explicacao}</p>
        </div>
      )}

      {resultado.alerta && !aviso && (
        <p className="allocation-aviso allocation-aviso-info">{resultado.alerta}</p>
      )}
    </div>
  );
}
