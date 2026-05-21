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
          <small>Proporcional à média histórica de cada um (flexíveis).</small>
        </div>
        <div className="resumo-arrow">=</div>
        <div className="resumo-step resumo-step-total">
          <span className="resumo-label">Total distribuído</span>
          <strong>{num(resultado.totalAlocado)} cestas</strong>
        </div>
      </div>

      <div className="resumo-referencia">
        <h5>Soma das médias históricas (só comparação — não é projeção)</h5>
        <p>
          Se cada equipamento recebesse <strong>exatamente</strong> sua média mensal do histórico
          importado, a soma seria <strong>{num(resumo.somaMediasHistoricas)} cestas</strong>.
          Isso <strong>não</strong> é uma meta, previsão nem valor que o sistema tenta entregar.
        </p>
        {resumo.diferencaVsHabitual > 0 && (
          <p className="resumo-diff">
            Diferença: <strong>−{num(resumo.diferencaVsHabitual)}</strong> em relação ao ritmo
            habitual (você tem menos cestas este mês do que a média do passado sugeriria).
          </p>
        )}
        {resumo.diferencaVsHabitual <= 0 && (
          <p className="resumo-diff ok">
            O total informado cobre ou supera a soma das médias históricas.
          </p>
        )}
      </div>

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
