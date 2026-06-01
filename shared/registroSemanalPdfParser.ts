import {
  calendarWeekRangesInMonth,
  dayToWeekNumber,
} from './emergencyMonitoring.js';
import {
  canonicalUnitNameFromCoderp,
  matchServiceByCanonicalName,
  normalizeCanonicalUnitName,
} from './serviceFamilies.js';
import { formatMonthKeyPt, getYearMonth, parseMonthKey } from './monthUtils.js';
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

export type RegistroModoPdf = 'colunas_mes' | 'semana_unica';

export interface RegistroParseOptions {
  mesAlvo?: string | null;
  semanaAlvo?: number | null;
  fileName?: string | null;
}

export interface RegistroSemanalParseResult {
  mesDetectado: string | null;
  semanasDetectadas: number[];
  semanaAplicada: number | null;
  modo: RegistroModoPdf;
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

function mesLabelFromNum(month: number, year: number): string {
  return formatMonthKeyPt(year * 100 + month);
}

function mesLabelFromMatch(mesNome: string, ano: number): string {
  const key = norm(mesNome).replace('ç', 'c');
  const month = MESES_PT[key] ?? MESES_PT[mesNome.toLowerCase()] ?? 0;
  if (!month) return '';
  return mesLabelFromNum(month, ano);
}

function parseEquipmentLine(line: string): { unit: string; qtys: number[] } | null {
  const trimmed = line.trim();
  if (!trimmed || /^total\b/i.test(trimmed) || /^semana\b/i.test(trimmed)) {
    return null;
  }
  if (/^sem\./i.test(trimmed) || /^equip\./i.test(trimmed)) return null;
  if (/^cestas?\b/i.test(trimmed) && !/cras|creas|saica/i.test(trimmed)) return null;

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

/** Ex.: CESTAS 18-24.05.26.pdf → semana civil do mês */
export function detectSemanaFromFileName(
  fileName: string,
  mesAlvo?: string | null,
): number | null {
  const ym = mesAlvo ? getYearMonth(mesAlvo) : null;

  const m1 = fileName.match(/(\d{1,2})\D+(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i);
  if (m1) {
    const d1 = parseInt(m1[1], 10);
    let yr = parseInt(m1[4], 10);
    const mo = parseInt(m1[3], 10);
    if (yr < 100) yr += 2000;
    return dayToWeekNumber(yr, mo, d1);
  }

  const m2 = fileName.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m2 && ym) {
    const d1 = parseInt(m2[1], 10);
    return dayToWeekNumber(ym.year, ym.month, d1);
  }

  const m3 = fileName.match(/semana\s*(\d)/i);
  if (m3) return parseInt(m3[1], 10);

  return null;
}

export function detectSemanaFromText(
  text: string,
  year: number,
  month: number,
): number | null {
  const ranges = calendarWeekRangesInMonth(year, month);

  const rangeRe = /\b(\d{1,2})\s*[-–aà]\s*(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const exact = ranges.findIndex((r) => r.start === a && r.end === b);
    if (exact >= 0) return exact + 1;
    const byStart = ranges.findIndex((r) => a >= r.start && a <= r.end);
    if (byStart >= 0) return byStart + 1;
    if (b >= a && b - a <= 6) {
      const bySpan = ranges.findIndex((r) => a >= r.start && b <= r.end);
      if (bySpan >= 0) return bySpan + 1;
    }
  }

  const sem = text.match(/\bSEMANA\s*(\d)\b/i);
  if (sem) return parseInt(sem[1], 10);

  const semPt = text.match(/\bS\s*(\d)\s*[-–/]/i);
  if (semPt) return parseInt(semPt[1], 10);

  return null;
}

function splitMonthSections(text: string): { mes: string; body: string }[] {
  const hits: { index: number; mes: string; bodyStart: number }[] = [];

  const reNome =
    /(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*(\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = reNome.exec(text)) !== null) {
    const mes = mesLabelFromMatch(m[1], parseInt(m[2], 10));
    if (mes) hits.push({ index: m.index, mes, bodyStart: m.index + m[0].length });
  }

  const reAbr = /\b([A-Za-z]{3,9})\s*\/\s*(\d{4})\b/g;
  while ((m = reAbr.exec(text)) !== null) {
    const mes = formatMonthKeyPt(parseMonthKey(`${m[1]}/${m[2]}`));
    if (mes && parseMonthKey(mes) > 0) {
      hits.push({ index: m.index, mes, bodyStart: m.index + m[0].length });
    }
  }

  hits.sort((a, b) => a.index - b.index);

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

function resolveSemanaUnica(
  body: string,
  mes: string,
  opts: RegistroParseOptions,
  parsedLines: { unit: string; qtys: number[] }[],
): number {
  if (opts.semanaAlvo != null && opts.semanaAlvo > 0) return opts.semanaAlvo;

  const ym = getYearMonth(mes);
  if (ym) {
    const fromText = detectSemanaFromText(body, ym.year, ym.month);
    if (fromText) return fromText;
  }

  if (opts.fileName) {
    const fromFn = detectSemanaFromFileName(opts.fileName, mes);
    if (fromFn) return fromFn;
  }

  if (parsedLines.length && parsedLines[0].qtys.length === 1) {
    return 1;
  }
  return 1;
}

function rowsFromSection(
  body: string,
  mes: string,
  services: ServiceDef[],
  warnings: string[],
  opts: RegistroParseOptions,
): { rows: RegistroSemanalRow[]; modo: RegistroModoPdf; semanaAplicada: number | null } {
  const rows: RegistroSemanalRow[] = [];
  const lines = body.split(/\n/);

  const parsedLines: { unit: string; qtys: number[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let p = parseEquipmentLine(line);
    if (!p) {
      const unit = canonicalUnitNameFromRegistro(line);
      const next = lines[i + 1]?.trim() ?? '';
      if (unit && /^\d{1,4}$/.test(next)) {
        p = { unit, qtys: [parseQty(next)] };
        i += 1;
      }
    }
    if (p) parsedLines.push(p);
  }

  let multiCol = 0;
  let singleCol = 0;
  for (const p of parsedLines) {
    if (p.qtys.length > 1) multiCol += 1;
    else singleCol += 1;
  }

  const modoColunas = multiCol >= 2 && multiCol > singleCol;
  const modo: RegistroModoPdf = modoColunas ? 'colunas_mes' : 'semana_unica';
  const semanaUnica = modo === 'semana_unica' ? resolveSemanaUnica(body, mes, opts, parsedLines) : null;

  for (const parsed of parsedLines) {
    const found = matchServiceByCanonicalName(services, parsed.unit);
    const base = {
      unidade: parsed.unit,
      canonicalNome: parsed.unit,
      servicoId: found?.id ?? null,
      servicoNome: found?.nome ?? null,
      match: found ? ('ok' as const) : ('unmatched' as const),
    };

    if (modoColunas) {
      parsed.qtys.forEach((quantidade, idx) => {
        rows.push({ ...base, semana: idx + 1, quantidade });
      });
    } else {
      const semana = semanaUnica ?? 1;
      const quantidade = parsed.qtys[0] ?? 0;
      rows.push({ ...base, semana, quantidade });
    }
  }

  if (!rows.length && mes) {
    warnings.push(`Nenhuma linha de equipamento em ${mes}.`);
  }

  if (modo === 'semana_unica' && semanaUnica && rows.length) {
    warnings.push(
      `PDF de semana única: valores atribuídos à semana ${semanaUnica} de ${mes}.`,
    );
  }

  return { rows, modo, semanaAplicada: semanaUnica };
}

export function parseRegistroSemanalPdfText(
  text: string,
  services: ServiceDef[] = [],
  opts: RegistroParseOptions = {},
): RegistroSemanalParseResult {
  const warnings: string[] = [];
  const sections = splitMonthSections(text);
  let allRows: RegistroSemanalRow[] = [];
  let mesDetectado: string | null = null;
  let modo: RegistroModoPdf = 'semana_unica';
  let semanaAplicada: number | null = null;

  const alvoKey = opts.mesAlvo ? parseMonthKey(opts.mesAlvo) : 0;

  for (const sec of sections) {
    if (!sec.mes) continue;
    if (alvoKey > 0 && parseMonthKey(sec.mes) !== alvoKey) continue;
    const result = rowsFromSection(sec.body, sec.mes, services, warnings, opts);
    if (result.rows.length) {
      allRows = allRows.concat(result.rows);
      mesDetectado = sec.mes;
      modo = result.modo;
      semanaAplicada = result.semanaAplicada;
    }
  }

  if (!allRows.length && sections.length === 1 && !sections[0].mes) {
    const ym = opts.mesAlvo ? getYearMonth(opts.mesAlvo) : null;
    const mesFallback = opts.mesAlvo ?? '';
    const result = rowsFromSection(
      sections[0].body,
      mesFallback,
      services,
      warnings,
      opts,
    );
    allRows = result.rows;
    modo = result.modo;
    semanaAplicada = result.semanaAplicada;
    if (allRows.length && ym) mesDetectado = opts.mesAlvo ?? null;
  }

  if (mesAlvoMissing(allRows, opts) && alvoKey > 0) {
    const fallback = sections.find((s) => parseMonthKey(s.mes) === alvoKey);
    if (fallback) {
      const result = rowsFromSection(
        fallback.body,
        fallback.mes,
        services,
        warnings,
        opts,
      );
      allRows = result.rows;
      mesDetectado = fallback.mes;
      modo = result.modo;
      semanaAplicada = result.semanaAplicada;
    }
  }

  if (
    opts.semanaAlvo != null &&
    opts.semanaAlvo > 0 &&
    modo === 'semana_unica' &&
    allRows.length
  ) {
    allRows = allRows.map((r) => ({ ...r, semana: opts.semanaAlvo! }));
    semanaAplicada = opts.semanaAlvo;
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
    mesDetectado: mesDetectado ?? opts.mesAlvo ?? null,
    semanasDetectadas,
    semanaAplicada,
    modo,
    rows: allRows,
    warnings,
  };
}

function mesAlvoMissing(rows: RegistroSemanalRow[], opts: RegistroParseOptions): boolean {
  return rows.length === 0 && !!opts.mesAlvo;
}
