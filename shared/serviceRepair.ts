import { cotaFixaPorUnidade } from './coderpRequisitanteRules.js';
import {
  detectFamiliaFromName,
  enrichServiceDef,
  familiaId,
  isFamiliaAggregateName,
  isFamiliaLevel,
  isUnidadeConsumo,
  normalizeCanonicalUnitName,
} from './serviceFamilies.js';
import type { ServiceDef, ServiceMonthRecord } from './serviceTypes.js';

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function isNumberedCrasCreas(nome: string): boolean {
  return /^cras\s*\d/i.test(nome) || /^creas\s*[\divx\d]/i.test(nome);
}

function historyCount(id: string, history: ServiceMonthRecord[]): number {
  return history.filter((h) => h.servicoId === id && h.total > 0).length;
}

function pickKeeper(a: ServiceDef, b: ServiceDef, history: ServiceMonthRecord[]): ServiceDef {
  const score = (s: ServiceDef) => {
    let n = 0;
    if (s.level === 'unidade') n += 8;
    if (isUnidadeConsumo(s)) n += 16;
    if (s.fixo) n += 4;
    if (s.cotaFixa != null && s.cotaFixa > 0) n += 4;
    n += historyCount(s.id, history) * 2;
    return n;
  };
  return score(a) >= score(b) ? a : b;
}

export interface ServiceRepairResult {
  services: ServiceDef[];
  history: ServiceMonthRecord[];
  promoted: string[];
  removed: string[];
  historyRemapped: number;
}

/**
 * Corrige cadastro legado: unidades (SAICA, WARAOS…) salvas como família,
 * duplicatas CRAS/CREAS agregadas e histórico em id errado.
 */
export function repairServiceCatalog(
  services: ServiceDef[],
  history: ServiceMonthRecord[],
): ServiceRepairResult {
  const promoted: string[] = [];
  const removed: string[] = [];
  let historyRemapped = 0;
  let list = services.map((s) => ({ ...s }));
  let historyOut = [...history];

  const promoteToUnidade = (s: ServiceDef, nome: string): ServiceDef => {
    const fam = s.familiaCodigo ?? detectFamiliaFromName(nome);
    const cota = cotaFixaPorUnidade(nome);
    promoted.push(nome);
    return enrichServiceDef({
      ...s,
      nome,
      level: 'unidade',
      parentId: fam ? familiaId(fam) : s.parentId,
      familiaCodigo: fam ?? s.familiaCodigo,
      fixo: s.fixo || cota != null,
      cotaFixa: s.cotaFixa ?? cota,
    });
  };

  list = list.map((s) => {
    const nome = normalizeCanonicalUnitName(s.nome);
    const hasHist = historyCount(s.id, historyOut) > 0;
    if (!hasHist) return s;

    if (isFamiliaLevel(s) && (isFamiliaAggregateName(nome) || isNumberedCrasCreas(nome))) {
      return promoteToUnidade(s, nome);
    }

    if (s.level !== 'unidade' && (isFamiliaAggregateName(nome) || isNumberedCrasCreas(nome))) {
      return promoteToUnidade(s, nome);
    }

    return s;
  });

  const hasNumberedCras = list.some(
    (s) => isNumberedCrasCreas(s.nome) && /cras/i.test(s.nome),
  );
  const hasNumberedCreas = list.some(
    (s) => isNumberedCrasCreas(s.nome) && /creas/i.test(s.nome),
  );

  list = list.filter((s) => {
    const n = norm(s.nome);
    const isAggCras = n === 'cras' && !isNumberedCrasCreas(s.nome);
    const isAggCreas = n === 'creas' && !isNumberedCrasCreas(s.nome);
    if ((isAggCras && hasNumberedCras) || (isAggCreas && hasNumberedCreas)) {
      if (historyCount(s.id, historyOut) === 0) {
        removed.push(s.nome);
        return false;
      }
    }
    return true;
  });

  const dedupeNames = ['SAICA', 'WARAOS', 'MÃOS DADAS', 'NAEM'];
  for (const canonical of dedupeNames) {
    const want = norm(canonical);
    const matches = list.filter((s) => norm(s.nome) === want || norm(s.nome).includes(want));
    if (matches.length <= 1) continue;
    const keeper = matches.reduce((a, b) => pickKeeper(a, b, historyOut));
    for (const dup of matches) {
      if (dup.id === keeper.id) continue;
      removed.push(dup.nome);
      historyOut = historyOut.map((h) => {
        if (h.servicoId !== dup.id) return h;
        historyRemapped++;
        return { ...h, servicoId: keeper.id, servicoNome: keeper.nome };
      });
      list = list.filter((x) => x.id !== dup.id);
    }
    const ki = list.findIndex((x) => x.id === keeper.id);
    if (ki >= 0) {
      const cota = cotaFixaPorUnidade(canonical);
      list[ki] = enrichServiceDef({
        ...list[ki],
        nome: canonical,
        level: 'unidade',
        fixo: list[ki].fixo || cota != null,
        cotaFixa: list[ki].cotaFixa ?? cota,
      });
    }
  }

  return { services: list, history: historyOut, promoted, removed, historyRemapped };
}
