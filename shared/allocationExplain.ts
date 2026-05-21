import type { MonthAllocationResult } from './serviceTypes.js';

export interface AllocationResumo {
  /** Valor digitado para distribuir no mês */
  cestasInformadas: number;
  /** Soma das médias de cada equipamento — comparação com o passado, não é meta */
  somaMediasHistoricas: number;
  /** Reservado para equipamentos marcados como fixos */
  reservadoFixos: number;
  /** Repartido entre equipamentos flexíveis */
  repartidoFlexiveis: number;
  /** somaMedias − informado (positivo = habitualmente consumiam mais) */
  diferencaVsHabitual: number;
}

export interface AllocationAviso {
  nivel: 'info' | 'aviso' | 'critico';
  titulo: string;
  explicacao: string;
}

export function buildAllocationResumo(
  r: MonthAllocationResult,
): AllocationResumo {
  const fixos = r.linhas.filter((l) => l.fixo);
  const flex = r.linhas.filter((l) => !l.fixo);
  return {
    cestasInformadas: r.totalDisponivel,
    somaMediasHistoricas: r.totalDemandaReferencia,
    reservadoFixos: fixos.reduce((s, l) => s + l.alocado, 0),
    repartidoFlexiveis: flex.reduce((s, l) => s + l.alocado, 0),
    diferencaVsHabitual: r.totalDemandaReferencia - r.totalDisponivel,
  };
}

export function buildAllocationAviso(
  r: MonthAllocationResult,
  resumo: AllocationResumo,
): AllocationAviso | null {
  const sumMinimos = r.linhas.reduce((s, l) => s + l.minimoGarantido, 0);
  if (sumMinimos > r.totalDisponivel) {
    return {
      nivel: 'critico',
      titulo: 'Cotas fixas maiores que o total do mês',
      explicacao: `A soma das cotas mínimas dos equipamentos fixos (${sumMinimos} cestas) é maior que o total informado (${r.totalDisponivel}). Reduza cotas, desmarque algum fixo ou aumente o total do mês.`,
    };
  }
  if (resumo.diferencaVsHabitual > 0) {
    return {
      nivel: 'info',
      titulo: 'Total do mês abaixo do ritmo habitual (médias)',
      explicacao: `A soma das médias históricas é ${r.totalDemandaReferencia} cestas — ou seja, se cada equipamento recebesse exatamente sua média, seriam ${r.totalDemandaReferencia} no mês. Você informou ${r.totalDisponivel}. O sistema não tenta entregar ${r.totalDemandaReferencia}; ele divide apenas os ${r.totalDisponivel} que você colocou: primeiro ${resumo.reservadoFixos} para fixos, depois ${resumo.repartidoFlexiveis} entre os demais, proporcional à média de cada um.`,
    };
  }
  if (r.alerta && r.alerta.includes('Cotas fixas')) {
    return {
      nivel: 'critico',
      titulo: 'Ajuste necessário nas cotas fixas',
      explicacao: r.alerta,
    };
  }
  return null;
}
