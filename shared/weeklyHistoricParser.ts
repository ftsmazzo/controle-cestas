import { formatMonthKeyPt, parseMonthKey } from './monthUtils.js';

export interface WeeklyHistoricRow {
  mes: string;
  servicoNome: string;
  semanas: number[];
}

export interface WeeklyHistoricParseResult {
  rows: WeeklyHistoricRow[];
  mesesEncontrados: string[];
  warnings: string[];
}

const MONTH_WORD: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  fev: 2,
  fevereiro: 2,
  mar: 3,
  marco: 3,
  março: 3,
  abr: 4,
  abril: 4,
  mai: 5,
  maio: 5,
  jun: 6,
  junho: 6,
  jul: 7,
  julho: 7,
  ago: 8,
  agosto: 8,
  set: 9,
  setembro: 9,
  out: 10,
  outubro: 10,
  nov: 11,
  novembro: 11,
  dez: 12,
  dezembro: 12,
};

const PT_LABEL = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function norm(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function parseMesFromWeeklyText(text: string): string | null {
  const n = norm(text);
  const m = n.match(
    /\b(jan(?:eiro)?|fev(?:eiro)?|mar(?:co|ç|c)?o?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*[/\s-]*\s*(20\d{2})\b/,
  );
  if (!m) {
    const loose = n.match(/\bmar\w*\s*(20\d{2})\b/);
    if (loose) return `Mar/${loose[1]}`;
    return null;
  }
  let key = m[1];
  if (key.startsWith('mar')) key = 'marco';
  const token = key.slice(0, 3);
  const month =
    MONTH_WORD[key] ??
    MONTH_WORD[token] ??
    MONTH_WORD[Object.keys(MONTH_WORD).find((k) => key.startsWith(k)) ?? ''];
  if (!month) return null;
  return `${PT_LABEL[month]}/${m[2]}`;
}

const EQUIP_PATTERN =
  /(CRAS\s*\d{1,2}|Creas\s*(?:I{1,3}|IV|V|iii|ii|i|\d+)|NAEM|CREPD|IDOSO|SAICA|M[ãa]os\s*[Dd]adas|DEFESA\s*CIVIL|OUTROS|Waraos?)\s+(-?\d+)/gi;

function isSkipLine(line: string): boolean {
  const n = norm(line);
  if (!n || n.length < 2) return true;
  if (/^total\b|^soma\b|sem\.?\d|semana\s*\d|equip\.?|quant|data\b|coderp/.test(n))
    return true;
  if (/^cras\s*-\s*\d/.test(n)) return true;
  if (/^\d+\s*[-–]/.test(n)) return true;
  return false;
}

/** Nome padrão da unidade (CRAS 1, CREAS II, SAICA…) */
export function canonicalUnitNameFromWeeklyLabel(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  const n = norm(t);
  if (isSkipLine(t)) return null;

  let m = n.match(/^cras\s*(\d{1,2})$/);
  if (m) return `CRAS ${parseInt(m[1], 10)}`;

  m = n.match(/^creas\s*([ivx]+)$/i);
  if (m) return `CREAS ${m[1].toUpperCase()}`;

  m = n.match(/^creas\s*(\d)$/);
  if (m) {
    const romans = ['', 'I', 'II', 'III', 'IV', 'V'];
    const i = parseInt(m[1], 10);
    return i >= 1 && i <= 5 ? `CREAS ${romans[i]}` : `CREAS ${m[1]}`;
  }

  if (n === 'saica') return 'SAICA';
  if (n === 'naem') return 'NAEM';
  if (n === 'crepd') return 'CREPD';
  if (n === 'idoso') return 'IDOSO';
  if (n.includes('maos dadas')) return 'MÃOS DADAS';
  if (n.includes('defesa civil')) return 'DEFESA CIVIL';
  if (n === 'outros') return 'OUTROS';
  if (n.startsWith('warao')) return 'WARAOS';

  return t.length <= 40 ? t.toUpperCase() : null;
}

/** Linha com padrão: CRAS 1 14 CRAS 1 16 … (uma unidade, N semanas) */
export function parseEquipmentWeeksFromLine(
  line: string,
): { servicoNome: string; semanas: number[] } | null {
  if (isSkipLine(line)) return null;

  const matches: { name: string; qty: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(EQUIP_PATTERN.source, 'gi');
  while ((m = re.exec(line)) !== null) {
    const name = canonicalUnitNameFromWeeklyLabel(m[1]);
    const qty = parseInt(m[2], 10);
    if (!name || qty < 0) continue;
    matches.push({ name, qty });
  }

  if (!matches.length) {
    const solo = canonicalUnitNameFromWeeklyLabel(line);
    if (solo) return { servicoNome: solo, semanas: [] };
    return null;
  }

  const first = matches[0].name;
  const weeks: number[] = [];
  for (const x of matches) {
    if (x.name !== first) {
      return null;
    }
    weeks.push(x.qty);
  }
  return { servicoNome: first, semanas: weeks };
}

function splitTextIntoMonthBlocks(text: string): { mes: string; body: string }[] {
  const blocks: { mes: string; body: string }[] = [];
  const re =
    /\b(jan(?:eiro)?|fev(?:eiro)?|mar(?:co|ç|c)?o?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\s*[/\s-]*\s*(20\d{2})\b/gi;
  const hits: { index: number; mes: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mes = parseMesFromWeeklyText(m[0]);
    if (mes) hits.push({ index: m.index, mes });
  }
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = hits[i + 1]?.index ?? text.length;
    blocks.push({ mes: hits[i].mes, body: text.slice(start, end) });
  }
  return blocks;
}

/** PDF corrompe “março” — bloco antes de abril/2025 vira Mar/2025 */
function inferMarchRowsFromPdfPreamble(text: string): WeeklyHistoricRow[] {
  const idx = text.search(/abr\w*\s*2025/i);
  if (idx <= 0) return [];
  const chunk = text.slice(0, idx);
  if (!/semana\s*1/i.test(chunk)) return [];
  const year = chunk.match(/20\d{2}/)?.[0] ?? '2025';
  const mes = `Mar/${year}`;
  const rows: WeeklyHistoricRow[] = [];
  for (const line of chunk.split(/\r?\n/)) {
    const eq = parseEquipmentWeeksFromLine(line);
    if (eq?.semanas.length) rows.push({ mes, ...eq });
  }
  return rows;
}

export function parseWeeklyHistoricText(text: string): WeeklyHistoricParseResult {
  const warnings: string[] = [];
  const rows: WeeklyHistoricRow[] = [];
  const marchRows = inferMarchRowsFromPdfPreamble(text);
  rows.push(...marchRows);
  const blocks = splitTextIntoMonthBlocks(text);

  if (!blocks.length) {
    warnings.push(
      'Nenhum mês encontrado (ex.: março 2025). Use a planilha Excel se o PDF não extrair bem.',
    );
    const lines = text.split(/\r?\n/);
    let mesAtual: string | null = null;
    for (const line of lines) {
      const mes = parseMesFromWeeklyText(line);
      if (mes) mesAtual = mes;
      if (!mesAtual) continue;
      const eq = parseEquipmentWeeksFromLine(line);
      if (eq?.semanas.length) {
        rows.push({ mes: mesAtual, servicoNome: eq.servicoNome, semanas: eq.semanas });
      }
    }
  } else {
    for (const block of blocks) {
      const lines = block.body.split(/\r?\n/);
      for (const line of lines) {
        const eq = parseEquipmentWeeksFromLine(line);
        if (eq?.semanas.length) {
          rows.push({
            mes: block.mes,
            servicoNome: eq.servicoNome,
            semanas: eq.semanas,
          });
        }
      }
    }
  }

  const mesesEncontrados = [...new Set(rows.map((r) => r.mes))].sort(
    (a, b) => parseMonthKey(a) - parseMonthKey(b),
  );

  if (!rows.length) {
    warnings.push(
      'Nenhuma linha CRAS 1 / Creas I / SAICA com quantidades por semana. Confira o arquivo (planilha operacional, não o PDF Coderp).',
    );
  } else if (!mesesEncontrados.some((m) => m.startsWith('Mar'))) {
    warnings.push(
      'Março não foi detectado no PDF — se faltar, envie o .xlsx original ou confira o preâmbulo do arquivo.',
    );
  }

  return { rows, mesesEncontrados, warnings };
}

export function parseWeeklyHistoricMatrix(
  matrix: unknown[][],
): WeeklyHistoricParseResult {
  const lines: string[] = [];
  for (const row of matrix) {
    const parts = (row ?? []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (parts.length) lines.push(parts.join(' '));
  }
  return parseWeeklyHistoricText(lines.join('\n'));
}

/** Filtra meses para carga única (ex. mar–ago/2025) */
export function filterWeeklyRowsByMonthRange(
  rows: WeeklyHistoricRow[],
  fromKey: number,
  toKey: number,
): WeeklyHistoricRow[] {
  return rows.filter((r) => {
    const k = parseMonthKey(r.mes);
    return k >= fromKey && k <= toKey;
  });
}

export function defaultHistoricRangeMarAgo2025(): {
  fromKey: number;
  toKey: number;
  label: string;
} {
  return {
    fromKey: 202503,
    toKey: 202508,
    label: 'Mar/2025 – Ago/2025',
  };
}
