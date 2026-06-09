/**
 * Plano aprovado ciclo 1 — Jun S1 (valores maiores) e Jun S2 (corte drástico).
 * Entrega invertida: S1 recebe o volume alto, S2 o corte. SAICA/WARAOS/Mãos Dadas
 * ficam fora (cota mensal única dentro dos 1.150).
 */
export interface PlanoSemanaUnidade {
  junS1: number;
  junS2: number;
}

/** Chave = nome canônico do equipamento (como no cadastro) */
export const PLANO_JUN_CICLO1: Record<string, PlanoSemanaUnidade> = {
  'CRAS 1': { junS1: 7, junS2: 3 },
  'CRAS 2': { junS1: 18, junS2: 5 },
  'CRAS 3': { junS1: 14, junS2: 4 },
  'CRAS 4': { junS1: 7, junS2: 3 },
  'CRAS 5': { junS1: 22, junS2: 6 },
  'CRAS 6': { junS1: 22, junS2: 6 },
  'CRAS 7': { junS1: 7, junS2: 3 },
  'CRAS 8': { junS1: 15, junS2: 4 },
  'CRAS 9': { junS1: 12, junS2: 3 },
  'CRAS 10': { junS1: 22, junS2: 6 },
  'CRAS 11': { junS1: 19, junS2: 5 },
  'CRAS 12': { junS1: 32, junS2: 9 },
  'CREAS I': { junS1: 7, junS2: 2 },
  'CREAS II': { junS1: 13, junS2: 4 },
  'CREAS III': { junS1: 4, junS2: 2 },
  'CREAS IV': { junS1: 7, junS2: 2 },
  'CREAS V': { junS1: 16, junS2: 5 },
  NAEM: { junS1: 3, junS2: 1 },
};

export const TOTAL_PLANO_JUN_S1 = Object.values(PLANO_JUN_CICLO1).reduce(
  (s, p) => s + p.junS1,
  0,
);

export const TOTAL_PLANO_JUN_S2 = Object.values(PLANO_JUN_CICLO1).reduce(
  (s, p) => s + p.junS2,
  0,
);

function normNome(nome: string): string {
  return nome.trim().toUpperCase();
}

export function planoJunParaUnidade(nome: string): PlanoSemanaUnidade | null {
  const n = normNome(nome);
  if (PLANO_JUN_CICLO1[n]) return PLANO_JUN_CICLO1[n];
  const creas = n.match(/^CREAS\s+([IVX]+|\d+)$/i);
  if (creas) {
    const key = `CREAS ${creas[1].toUpperCase()}`;
    return PLANO_JUN_CICLO1[key] ?? null;
  }
  const cras = n.match(/^CRAS\s+(\d+)$/i);
  if (cras) return PLANO_JUN_CICLO1[`CRAS ${cras[1]}`] ?? null;
  return null;
}

export function planoJunSemana(
  nome: string,
  semanaJun: 1 | 2,
): number | null {
  const p = planoJunParaUnidade(nome);
  if (!p) return null;
  return semanaJun === 1 ? p.junS1 : p.junS2;
}
