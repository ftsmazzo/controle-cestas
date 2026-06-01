import {
  canonicalUnitNameFromCoderp,
  matchServiceByCanonicalName,
  normalizeCanonicalUnitName,
} from './serviceFamilies.js';
import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';
import type { ServiceDef } from './serviceTypes.js';

export interface RegistroSemanalRow {
  unidade: string;
  canonicalNome: string;
  servicoId: string | null;
  servicoNome: string | null;
  semana: number;
  quantidade: number;
  match: 'ok' | 'unmatched';
}

export interface RegistroSemanalParseResult {
  mesDetectado: string | null;
  semanasDetectadas: number[];
  rows: RegistroSemanalRow[];
  warnings: string[];
}

const MESES_PT: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const EQUIP_QTY_RE =
  /(CRAS\s*\d+|Creas\s*[IVX]+|CREAS\s*[IVX]+|CREAS\s*\d+|NAEM|CREPD|IDOSO|saica|SAICA|M[aãã]os\s*dadas|waraos|WARAOS|DEFESA\s*CIVIL|OUTROS|GABINETE|AVARIAS)\s*(-?\d+)/gi;

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function parseQty(s: string): number {
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

/** Nome canônico a partir da planilha operacional (CRAS 1, Creas II, saica…) */
export function canonicalUnitNameFromRegistro(raw: string): string | null {
  const t = raw.trim();
  if (!t || /^cras\s*-/i.test(t)) return null;
  const fromCoderp = canonicalUnitNameFromCoderp(`SETOR ${t}`);
  if (fromCoderp) return normalizeCanonicalUnitName(fromCoderp);

  const n = norm(t);
  let m = n.match(/^cras\s*(\d{1,2})\b/);
  if (m) return `CRAS ${parseInt(m[1], 10)}`;

  m = n.match(/^creas\s*(\d)\b/);
  if (m) {
    const i = parseInt(m[1], 10);
    const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
    return i >= 1 && i <= 5 ? `CREAS ${ROMAN[i]}` : `CREAS ${m[1]}`;
  }

  m = n.match(/^creas\s*([ivx]+)\b/i);
  if (m) return `CREAS ${m[1].toUpperCase()}`;

  if (/^saica/.test(n)) return 'SAICA';
  if (/^waraos/.test(n)) return 'WARAOS';
  if (/^naem/.test(n)) return 'NAEM';
  if (/^crepd/.test(n)) return 'CREPD';
  if (/^idoso/.test(n)) return 'IDOSO';
  if (/^maos\s*dadas/.test(n)) return 'MÃOS DADAS';
  if (/^defesa\s*civil/.test(n)) return 'DEFESA CIVIL';
  if (/^gabinete/.test(n)) return 'GABINETE';
  if (/^avarias/.test(n)) return 'AVARIAS';
  if (/^outros/.test(n)) return 'OUTROS';

  return null;
}

function mesLabelFromMatch(mesNome: string, ano: number): string {
  const key = norm(mesNome).replace('ç', 'c');
  const month = MESES_PT[key] ?? MESES_PT[mesNome.toLowerCase()] ?? 0;
  if (!month) return '';
  return formatMonthKeyPt(ano * 100 + month);
}

function parseEquipmentLine(line: string): { unit: string; qtys: number[] } | null {
  const trimmed = line.trim();
  if (!trimmed || /^total\b/i.test(trimmed) || /^semana\b/i.test(trimmed)) {
    return null;
  }
  if (/^sem\./i.test(trimmed) || /^equip\./i.test(trimmed)) return null;

  const matches = [...trimmed.matchAll(EQUIP_QTY_RE)];
  if (!matches.length) return null;

  const unit = canonicalUnitNameFromRegistro(matches[0][1]);
  if (!unit) return null;

  const qtys: number[] = [];
  for (const m of matches) {
    const u = canonicalUnitNameFromRegistro(m[1]);
    if (u !== unit) break;
    qtys.push(parseQty(m[2]));
  }
  if (!qtys.length) return null;
  return { unit, qtys };
}

function splitMonthSections(text: string): { mes: string; body: string }[] {
  const re =
    /(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(\d{4})/gi;
  const hits: { index: number; mes: string; bodyStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mes = mesLabelFromMatch(m[1], parseInt(m[2], 10));
    if (mes) hits.push({ index: m.index, mes, bodyStart: m.index + m[0].length });
  }
  if (!hits.length) return [{ mes: '', body: text }];

  const sections: { mes: string; body: string }[] = [];
  for (let i = 0; i < hits.length; i++) {
    const end = hits[i + 1]?.index ?? text.length;
    sections.push({
      mes: hits[i].mes,
      body: text.slice(hits[i].bodyStart, end),
    });
  }
  return sections;
}

function rowsFromSection(
  body: string,
  mes: string,
  services: ServiceDef[],
  warnings: string[],
): RegistroSemanalRow[] {
  const rows: RegistroSemanalRow[] = [];
  const lines = body.split(/\n/);

  for (const line of lines) {
    const parsed = parseEquipmentLine(line);
    if (!parsed) continue;

    parsed.qtys.forEach((quantidade, idx) => {
      const semana = idx + 1;
      const found = matchServiceByCanonicalName(services, parsed.unit);
      rows.push({
        unidade: parsed.unit,
        canonicalNome: parsed.unit,
        servicoId: found?.id ?? null,
        servicoNome: found?.nome ?? null,
        semana,
        quantidade,
        match: found ? 'ok' : 'unmatched',
      });
    });
  }

  if (!rows.length && mes) {
    warnings.push(`Nenhuma linha de equipamento em ${mes}.`);
  }
  return rows;
}

export function parseRegistroSemanalPdfText(
  text: string,
  services: ServiceDef[] = [],
  mesAlvo?: string | null,
): RegistroSemanalParseResult {
  const warnings: string[] = [];
  const sections = splitMonthSections(text);
  let allRows: RegistroSemanalRow[] = [];
  let mesDetectado: string | null = null;

  const alvoKey = mesAlvo ? parseMonthKey(mesAlvo) : 0;

  for (const sec of sections) {
    if (!sec.mes) continue;
    if (alvoKey > 0 && parseMonthKey(sec.mes) !== alvoKey) continue;
    const rows = rowsFromSection(sec.body, sec.mes, services, warnings);
    if (rows.length) {
      allRows = allRows.concat(rows);
      mesDetectado = sec.mes;
    }
  }

  if (!allRows.length && sections.length === 1 && !sections[0].mes) {
    allRows = rowsFromSection(sections[0].body, '', services, warnings);
  }

  if (mesAlvo && !mesDetectado && alvoKey > 0) {
    const fallback = sections.find((s) => parseMonthKey(s.mes) === alvoKey);
    if (fallback) {
      allRows = rowsFromSection(fallback.body, fallback.mes, services, warnings);
      mesDetectado = fallback.mes;
    }
  }

  const semanasDetectadas = [
    ...new Set(allRows.map((r) => r.semana)),
  ].sort((a, b) => a - b);

  const unmatched = allRows.filter((r) => r.match === 'unmatched');
  if (unmatched.length) {
    warnings.push(
      `${unmatched.length} unidade(s) sem cadastro: ${[...new Set(unmatched.map((r) => r.unidade))].slice(0, 5).join(', ')}${unmatched.length > 5 ? '…' : ''}.`,
    );
  }

  return {
    mesDetectado: mesDetectado ?? mesAlvo ?? null,
    semanasDetectadas,
    rows: allRows,
    warnings,
  };
}
