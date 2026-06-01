import type { ServiceDef } from './serviceTypes.js';

export const FAMILIAS_CONHECIDAS = [
  'CRAS',
  'CREAS',
  'SAICA',
  'NAEM',
  'CREPD',
  'IDOSO',
  'MÃOS DADAS',
  'WARAOS',
  'DEFESA CIVIL',
  'GABINETE',
  'AVARIAS',
  'OUTROS',
] as const;

export type FamiliaCodigo = (typeof FAMILIAS_CONHECIDAS)[number] | string;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function slugServiceId(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function familiaId(codigo: string): string {
  return `familia-${slugServiceId(codigo)}`;
}

/** Nome é agregado (ex. só "CRAS"), não unidade numerada */
export function isFamiliaAggregateName(nome: string): boolean {
  const n = norm(nome);
  if (/^cras\s*\d/.test(n)) return false;
  if (/^cras\d/.test(n)) return false;
  if (/creas\s*[\divx\d]/i.test(nome)) return false;
  return (
    n === 'cras' ||
    n === 'creas' ||
    n === 'saica' ||
    n === 'naem' ||
    n === 'crepd' ||
    n === 'idoso' ||
    n.includes('maos dadas') ||
    n.includes('defesa civil') ||
    n === 'gabinete' ||
    n === 'avarias' ||
    n === 'outros'
  );
}

export function detectFamiliaFromName(nome: string): FamiliaCodigo | null {
  const n = norm(nome);
  if (/cras/.test(n)) return 'CRAS';
  if (/creas/.test(n)) return 'CREAS';
  if (/saica/.test(n)) return 'SAICA';
  if (/naem/.test(n)) return 'NAEM';
  if (/crepd|deficiencia/.test(n)) return 'CREPD';
  if (/idoso|acolhim/.test(n)) return 'IDOSO';
  if (/maos dadas|m\.?\s*dadas/.test(n)) return 'MÃOS DADAS';
  if (/waraos/.test(n)) return 'WARAOS';
  if (/defesa civil|d\.?\s*civil/.test(n)) return 'DEFESA CIVIL';
  if (/gabinete/.test(n)) return 'GABINETE';
  if (/avarias/.test(n)) return 'AVARIAS';
  if (/nutricao|banco de alimentos/.test(n)) return 'OUTROS';
  if (/secao|setor/.test(n)) return 'OUTROS';
  return null;
}

export function isFamiliaLevel(s: ServiceDef): boolean {
  return s.level === 'familia' || isFamiliaAggregateName(s.nome);
}

/** Unidade que recebe cestas (CRAS 1, Creas II, SAICA…) */
export function isUnidadeConsumo(s: ServiceDef): boolean {
  if (isFamiliaLevel(s)) return false;
  if (s.level === 'unidade' || s.level === 'equipamento') return true;
  if (s.level === 'servico') return true;
  if (!s.level && s.parentId) return true;
  if (!s.level && !isFamiliaAggregateName(s.nome)) return true;
  return false;
}

export function consumptionUnits(services: ServiceDef[]): ServiceDef[] {
  return services.filter(isUnidadeConsumo);
}

export function familiaUnits(services: ServiceDef[]): ServiceDef[] {
  return services.filter(isFamiliaLevel);
}

export function childrenOf(
  services: ServiceDef[],
  parentId: string,
): ServiceDef[] {
  return services.filter(
    (s) => s.parentId === parentId && isUnidadeConsumo(s),
  );
}

/** Nome canônico a partir do requisitante Coderp (SETOR CRAS1 CENTRO…) */
export function canonicalUnitNameFromCoderp(requisitante: string): string | null {
  const raw = requisitante.trim();
  const n = norm(raw);

  let m = n.match(/cras\s*(\d{1,2})\b/);
  if (m) return `CRAS ${parseInt(m[1], 10)}`;

  m = n.match(/cras(\d{1,2})\b/);
  if (m) return `CRAS ${parseInt(m[1], 10)}`;

  m = n.match(/creas\s*(\d)\b/);
  if (m) {
    const i = parseInt(m[1], 10);
    return i >= 1 && i <= 5 ? `CREAS ${ROMAN[i]}` : `CREAS ${m[1]}`;
  }

  m = n.match(/creas\s*([ivx]+)\b/i);
  if (m) return `CREAS ${m[1].toUpperCase()}`;

  if (/saica|acolhimento institucional/.test(n)) return 'SAICA';
  if (/protecao social especial|ss\s*protecao|waraos/.test(n)) return 'WARAOS';
  if (/mulher|naem/.test(n)) return 'NAEM';
  if (/deficiencia|crepd/.test(n)) return 'CREPD';
  if (/idoso|acolhim/.test(n)) return 'IDOSO';
  if (/maos dadas/.test(n)) return 'MÃOS DADAS';
  if (/defesa civil/.test(n)) return 'DEFESA CIVIL';
  if (/gabinete/.test(n)) return 'GABINETE';
  if (/avarias/.test(n)) return 'AVARIAS';
  /* Banco/Nutrição: redistribuído em coderpRequisitanteRules — não é unidade de consumo */
  if (/nutricao|seguranca alimentar|banco de alimentos|subalmoxarifado.*semas/.test(n)) {
    return null;
  }

  return null;
}

export function matchServiceByCanonicalName(
  services: ServiceDef[],
  canonical: string,
): ServiceDef | undefined {
  const want = slugServiceId(canonical);
  const units = consumptionUnits(services);
  let found = units.find((s) => slugServiceId(s.nome) === want);
  if (found) return found;
  found = units.find(
    (s) => norm(s.nome) === norm(canonical) || norm(s.nome).includes(norm(canonical)),
  );
  if (found) return found;
  return units.find((s) => norm(canonical).includes(norm(s.nome)));
}

export function enrichServiceDef(s: ServiceDef): ServiceDef {
  if (isFamiliaAggregateName(s.nome)) {
    const fam = detectFamiliaFromName(s.nome) ?? s.nome.toUpperCase();
    return {
      ...s,
      level: 'familia',
      parentId: null,
      familiaCodigo: fam,
      id: s.id || familiaId(fam),
    };
  }
  const fam = detectFamiliaFromName(s.nome);
  if (!fam) {
    return {
      ...s,
      level: s.level ?? 'unidade',
      parentId: s.parentId ?? null,
    };
  }
  const pid = familiaId(fam);
  return {
    ...s,
    level: s.level === 'familia' ? 'familia' : (s.level ?? 'unidade'),
    parentId: s.level === 'familia' ? null : (s.parentId ?? pid),
    familiaCodigo: fam,
  };
}

/** Garante nós família (CRAS, CREAS…) e liga unidades (CRAS 1…12, CREAS I…V) */
export function ensureFamiliaHierarchy(services: ServiceDef[]): ServiceDef[] {
  const out = services.map(enrichServiceDef);
  const byId = new Map(out.map((s) => [s.id, s]));

  for (const s of [...out]) {
    if (isFamiliaLevel(s)) continue;
    const fam = s.familiaCodigo ?? detectFamiliaFromName(s.nome);
    if (!fam) continue;
    const pid = familiaId(fam);
    if (!byId.has(pid)) {
      const node: ServiceDef = {
        id: pid,
        nome: fam,
        level: 'familia',
        parentId: null,
        familiaCodigo: fam,
        fixo: false,
        cotaFixa: null,
      };
      out.push(node);
      byId.set(pid, node);
    }
    const i = out.findIndex((x) => x.id === s.id);
    if (i >= 0 && out[i].level !== 'familia') {
      out[i] = {
        ...out[i],
        level: 'unidade',
        parentId: out[i].parentId ?? pid,
        familiaCodigo: fam,
      };
    }
  }

  return out;
}

export interface FamiliaGroup<T> {
  familiaCodigo: string;
  familiaNome: string;
  familiaId: string;
  itens: T[];
}

export function groupByFamilia<T extends { familiaCodigo?: string; servicoId?: string }>(
  items: T[],
  services: ServiceDef[],
): FamiliaGroup<T>[] {
  const byUnit = new Map(services.map((s) => [s.id, s]));
  const groups = new Map<string, FamiliaGroup<T>>();

  for (const item of items) {
    const sid = 'servicoId' in item ? item.servicoId : undefined;
    const unit = sid ? byUnit.get(sid) : undefined;
    const fam =
      item.familiaCodigo ??
      unit?.familiaCodigo ??
      (unit ? detectFamiliaFromName(unit.nome) : null) ??
      'OUTROS';
    const fid = familiaId(fam);
    let g = groups.get(fid);
    if (!g) {
      g = { familiaCodigo: fam, familiaNome: fam, familiaId: fid, itens: [] };
      groups.set(fid, g);
    }
    g.itens.push({
      ...item,
      familiaCodigo: fam,
    });
  }

  const order = [...FAMILIAS_CONHECIDAS, 'OUTROS'];
  return [...groups.values()].sort(
    (a, b) =>
      order.indexOf(a.familiaCodigo as (typeof FAMILIAS_CONHECIDAS)[number]) -
      order.indexOf(b.familiaCodigo as (typeof FAMILIAS_CONHECIDAS)[number]),
  );
}
