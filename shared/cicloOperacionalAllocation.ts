import {
  COTA_MENSAL_FIXA,
  UNIDADE_MAOS_DADAS,
  UNIDADE_SAICA,
  UNIDADE_WARAOS,
} from './coderpRequisitanteRules.js';
import {
  GORDURA_CICLO_1,
  TETO_CICLO_OPERACIONAL,
} from './monitorConstants.js';

export const COTA_FIXA_BASE: Record<string, number> = {
  [UNIDADE_SAICA]: COTA_MENSAL_FIXA[UNIDADE_SAICA],
  [UNIDADE_WARAOS]: COTA_MENSAL_FIXA[UNIDADE_WARAOS],
  [UNIDADE_MAOS_DADAS]: COTA_MENSAL_FIXA[UNIDADE_MAOS_DADAS],
};

export const SERVICOS_FIXOS_NOMES = [
  UNIDADE_SAICA,
  UNIDADE_WARAOS,
  UNIDADE_MAOS_DADAS,
] as const;

export function tetoCicloOperacional(ciclo: number): number {
  return ciclo === 1
    ? TETO_CICLO_OPERACIONAL + GORDURA_CICLO_1
    : TETO_CICLO_OPERACIONAL;
}

export interface FixosReaisCiclo {
  [UNIDADE_SAICA]?: number;
  [UNIDADE_WARAOS]?: number;
  [UNIDADE_MAOS_DADAS]?: number;
}

export interface SubtrairFixosResult {
  alocacoes: Map<string, number>;
  sobraAposFixos: number;
  totalFixosUsados: number;
  perdasAplicadas: number;
}

/**
 * Fixos reais do ciclo primeiro; restante rateado por média histórica (só normais).
 * Perdas aplicadas só no restante após fixos — preserva sobras quando fixo pediu menos.
 */
export function subtrairFixosERatearProporcional(params: {
  totalCiclo: number;
  fixosReais: Record<string, number>;
  mediasHistoricas: Array<{ servicoId: string; media: number }>;
  servicosFixos: string[];
  perdasAjuste?: number;
}): SubtrairFixosResult {
  const {
    totalCiclo,
    fixosReais,
    mediasHistoricas,
    servicosFixos,
    perdasAjuste = 0,
  } = params;

  const totalFixosUsados = servicosFixos.reduce((s, nome) => {
    return s + Math.max(0, fixosReais[nome] ?? 0);
  }, 0);

  const restanteAposFixos = Math.max(0, totalCiclo - totalFixosUsados);
  const perdasAplicadas = Math.max(0, perdasAjuste);

  const normais = mediasHistoricas.filter(
    (m) => !servicosFixos.includes(m.servicoId),
  );
  const somaMedias = normais.reduce((s, m) => s + m.media, 0);
  const alocacoes = new Map<string, number>();

  for (const nome of servicosFixos) {
    alocacoes.set(nome, Math.min(totalCiclo, fixosReais[nome] ?? 0));
  }

  const restanteParaDistribuicao = Math.max(0, restanteAposFixos - perdasAplicadas);

  if (somaMedias > 0 && restanteParaDistribuicao > 0) {
    let assigned = 0;
    normais.forEach((m, i) => {
      const share =
        i === normais.length - 1
          ? Math.max(0, restanteParaDistribuicao - assigned)
          : Math.round((restanteParaDistribuicao * m.media) / somaMedias);
      alocacoes.set(m.servicoId, Math.max(0, share));
      assigned += share;
    });
  } else if (restanteParaDistribuicao > 0 && normais.length > 0) {
    const cada = Math.floor(restanteParaDistribuicao / normais.length);
    let assigned = 0;
    normais.forEach((m, i) => {
      const share =
        i === normais.length - 1
          ? Math.max(0, restanteParaDistribuicao - assigned)
          : cada;
      alocacoes.set(m.servicoId, Math.max(0, share));
      assigned += share;
    });
  }

  return {
    alocacoes,
    sobraAposFixos: restanteAposFixos,
    totalFixosUsados,
    perdasAplicadas,
  };
}
