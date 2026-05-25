import type { ForecastPoint } from './types.js';
import { parseMonthKey } from './monthUtils.js';

/** Três faixas de volume + média — linguagem de cessão, não de vendas. */
export interface VolumeCenario {
  menor: number;
  referencia: number;
  maior: number;
  medio: number;
}

export const VOLUME_CENARIO_LABELS = {
  menor: 'Volume menor',
  referencia: 'Volume de referência',
  maior: 'Volume maior',
  medio: 'Planejamento médio',
} as const;

export const VOLUME_CENARIO_LEGEND = {
  menor:
    'Estimativa cautelosa: referência menos o desvio padrão do histórico limpo (piso de cessão).',
  referencia:
    'Melhor estimativa central para o mês — base da regressão (nota técnica).',
  maior:
    'Estimativa ampliada: referência mais o desvio padrão (pressão de demanda acima da média).',
  medio:
    'Média dos três volumes acima — um único número intermediário para comparar com o contrato.',
} as const;

export function buildVolumeCenario(
  referencia: number,
  desvioPadrao: number,
): VolumeCenario {
  const ref = Math.round(referencia);
  const menor = Math.max(0, Math.round(ref - desvioPadrao));
  const maior = Math.round(ref + desvioPadrao);
  return {
    menor,
    referencia: ref,
    maior,
    medio: Math.round((menor + ref + maior) / 3),
  };
}

function mediaCampo(
  pontos: ForecastPoint[],
  pick: (p: ForecastPoint) => number | undefined,
): number | null {
  const vals = pontos
    .map(pick)
    .filter((v): v is number => v != null && !Number.isNaN(v));
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Agrega cenários dos meses projetados (ex. jun–dez). */
export function mediaCenariosPontos(
  pontos: ForecastPoint[],
  ano: number,
  mesInicio = 6,
  mesFim = 12,
): VolumeCenario | null {
  const filtrados = pontos.filter((p) => {
    if (p.tipo !== 'projecao') return false;
    const k = parseMonthKey(p.mes);
    const m = k % 100;
    return Math.floor(k / 100) === ano && m >= mesInicio && m <= mesFim;
  });
  if (!filtrados.length) return null;

  const referencia = mediaCampo(filtrados, (p) => p.valor);
  const menor = mediaCampo(filtrados, (p) => p.cenarioMenor);
  const maior = mediaCampo(filtrados, (p) => p.cenarioMaior);
  const medio = mediaCampo(filtrados, (p) => p.cenarioMedio);

  if (referencia == null) return null;

  if (menor != null && maior != null && medio != null) {
    return { menor, referencia, maior, medio };
  }
  return buildVolumeCenario(referencia, 0);
}
