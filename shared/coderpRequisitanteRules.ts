import type { CoderpRequisitanteRow } from './coderpPdfParser.js';
import { canonicalUnitNameFromCoderp } from './serviceFamilies.js';
/** Meses do rateio Coderp (Out/25–Mar/26) — evita dependência circular com requisicaoHistorico */
export const MESES_RATEIO_CODERP = 6;

export const UNIDADE_SAICA = 'SAICA';
export const UNIDADE_WARAOS = 'WARAOS';
export const UNIDADE_MAOS_DADAS = 'MÃOS DADAS';

/** Cotas mensais conhecidas (terceirizados / unidades especiais) */
export const COTA_MENSAL_FIXA: Record<string, number> = {
  [UNIDADE_SAICA]: 25,
  [UNIDADE_WARAOS]: 29,
  [UNIDADE_MAOS_DADAS]: 40,
};

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Seção Nutrição / Banco — no passado concentrava SAICA, WARAOS e Mãos Dadas */
export function isBancoAlimentosRequisitante(requisitante: string): boolean {
  const n = norm(requisitante);
  return (
    /nutricao|seguranca alimentar|banco de alimentos|subalmoxarifado.*semas/.test(
      n,
    ) || /secao de nutricao/.test(n)
  );
}

/** SS Proteção Social Especial → unidade WARAOS */
export function isWaraosRequisitante(requisitante: string): boolean {
  const n = norm(requisitante);
  return (
    /protecao social especial/.test(n) ||
    /ss\s*protecao/.test(n) ||
    /\bwaraos\b/.test(n)
  );
}

export function isSaicaRequisitanteDireto(requisitante: string): boolean {
  const n = norm(requisitante);
  return (
    /acolhimento institucional/.test(n) ||
    (/\bsaica\b/.test(n) && !/banco/.test(n))
  );
}

export function cotaFixaPorUnidade(nome: string): number | null {
  const n = norm(nome);
  if (n === 'saica' || n.includes('saica')) return COTA_MENSAL_FIXA[UNIDADE_SAICA];
  if (n.includes('waraos')) return COTA_MENSAL_FIXA[UNIDADE_WARAOS];
  if (n.includes('maos dadas')) return COTA_MENSAL_FIXA[UNIDADE_MAOS_DADAS];
  return null;
}

export function isUnidadeFixaEspecial(nome: string): boolean {
  return cotaFixaPorUnidade(nome) != null;
}

/**
 * Divide o total do requisitante Banco/Nutrição entre Mãos Dadas, SAICA e WARAOS
 * conforme cotas mensais × meses do período (proporção do que era pedido via Banco).
 */
export function splitTotalBancoAlimentos(
  totalPeriodo: number,
  mesCount: number = MESES_RATEIO_CODERP,
): Record<string, number> {
  const pesoMd = COTA_MENSAL_FIXA[UNIDADE_MAOS_DADAS] * mesCount;
  const pesoSaica = COTA_MENSAL_FIXA[UNIDADE_SAICA] * mesCount;
  const pesoWaraos = COTA_MENSAL_FIXA[UNIDADE_WARAOS] * mesCount;
  const soma = pesoMd + pesoSaica + pesoWaraos;
  if (soma <= 0) {
    return {
      [UNIDADE_MAOS_DADAS]: totalPeriodo,
      [UNIDADE_SAICA]: 0,
      [UNIDADE_WARAOS]: 0,
    };
  }
  const md = Math.round((totalPeriodo * pesoMd) / soma);
  const saica = Math.round((totalPeriodo * pesoSaica) / soma);
  const waraos = Math.max(0, totalPeriodo - md - saica);
  return {
    [UNIDADE_MAOS_DADAS]: md,
    [UNIDADE_SAICA]: saica,
    [UNIDADE_WARAOS]: waraos,
  };
}

export interface CoderpUnidadeAgg {
  unidade: string;
  quantidadePeriodo: number;
  origens: string[];
}

export interface NormalizeCoderpResult {
  unidades: CoderpUnidadeAgg[];
  warnings: string[];
  notas: string[];
}

function resolveUnidadeFromRow(row: CoderpRequisitanteRow): string | null {
  if (isBancoAlimentosRequisitante(row.requisitante)) return null;
  if (isWaraosRequisitante(row.requisitante)) return UNIDADE_WARAOS;
  if (isSaicaRequisitanteDireto(row.requisitante)) return UNIDADE_SAICA;
  return row.canonicalNome ?? canonicalUnitNameFromCoderp(row.requisitante);
}

function addAgg(
  map: Map<string, CoderpUnidadeAgg>,
  unidade: string,
  qty: number,
  origem: string,
) {
  if (qty <= 0) return;
  const cur = map.get(unidade) ?? { unidade, quantidadePeriodo: 0, origens: [] };
  cur.quantidadePeriodo += qty;
  if (!cur.origens.includes(origem)) cur.origens.push(origem);
  map.set(unidade, cur);
}

/** Converte linhas brutas do PDF em totais por unidade correta (com redistribuição do Banco). */
export function normalizeCoderpImportRows(
  rows: CoderpRequisitanteRow[],
  mesCount: number = MESES_RATEIO_CODERP,
): NormalizeCoderpResult {
  const map = new Map<string, CoderpUnidadeAgg>();
  const warnings: string[] = [];
  const notas: string[] = [];

  for (const row of rows) {
    if (row.quantidade <= 0) continue;

    if (isBancoAlimentosRequisitante(row.requisitante)) {
      const split = splitTotalBancoAlimentos(row.quantidade, mesCount);
      notas.push(
        `Banco/Nutrição (${row.quantidade} no período) redistribuído: Mãos Dadas ${split[UNIDADE_MAOS_DADAS]}, SAICA +${split[UNIDADE_SAICA]}, WARAOS +${split[UNIDADE_WARAOS]} (cotas ${COTA_MENSAL_FIXA[UNIDADE_MAOS_DADAS]}/${COTA_MENSAL_FIXA[UNIDADE_SAICA]}/${COTA_MENSAL_FIXA[UNIDADE_WARAOS]} por mês).`,
      );
      addAgg(
        map,
        UNIDADE_MAOS_DADAS,
        split[UNIDADE_MAOS_DADAS],
        'Seção Nutrição → Mãos Dadas',
      );
      addAgg(
        map,
        UNIDADE_SAICA,
        split[UNIDADE_SAICA],
        'Parte histórica via Banco',
      );
      addAgg(
        map,
        UNIDADE_WARAOS,
        split[UNIDADE_WARAOS],
        'Parte histórica via Banco',
      );
      continue;
    }

    const unidade = resolveUnidadeFromRow(row);
    if (!unidade) {
      warnings.push(`Sem unidade: ${row.requisitante.slice(0, 70)}…`);
      continue;
    }

    if (isWaraosRequisitante(row.requisitante)) {
      addAgg(map, UNIDADE_WARAOS, row.quantidade, 'SS Proteção Social Especial');
      continue;
    }

    if (isSaicaRequisitanteDireto(row.requisitante)) {
      addAgg(map, UNIDADE_SAICA, row.quantidade, 'Acolhimento institucional (SAICA)');
      continue;
    }

    addAgg(map, unidade, row.quantidade, row.requisitante.slice(0, 50));
  }

  return {
    unidades: [...map.values()].sort((a, b) =>
      a.unidade.localeCompare(b.unidade, 'pt'),
    ),
    warnings,
    notas,
  };
}
