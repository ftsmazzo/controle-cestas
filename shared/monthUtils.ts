/** Número do mês (1–12) a partir de abreviação PT ou EN */
const MONTH_TO_NUM: Record<string, number> = {
  jan: 1,
  fev: 2,
  feb: 2,
  mar: 3,
  abr: 4,
  apr: 4,
  mai: 5,
  may: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  aug: 8,
  set: 9,
  sep: 9,
  out: 10,
  oct: 10,
  nov: 11,
  dez: 12,
  dec: 12,
};

const NUM_TO_PT_LABEL = [
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

function normalizeToken(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Chave ordenável YYYYMM (ex.: 202504 = Abr/2025) */
export function parseMonthKey(mes: string): number {
  const s = normalizeToken(mes);
  const match = s.match(/([a-z]{3,9})\s*[/\-.]\s*(\d{2,4})/);
  if (match) {
    const token = match[1].slice(0, 3);
    const month = MONTH_TO_NUM[token];
    if (!month) return 0;
    let year = parseInt(match[2], 10);
    if (year < 100) year += 2000;
    return year * 100 + month;
  }

  const d = Date.parse(mes);
  if (!Number.isNaN(d)) {
    const dt = new Date(d);
    return dt.getFullYear() * 100 + (dt.getMonth() + 1);
  }
  return 0;
}

/** Ex.: Apr/25 → Abr/2025 */
export function formatMesPt(mes: string): string {
  const key = parseMonthKey(mes);
  if (key === 0) return mes.trim();
  const year = Math.floor(key / 100);
  const month = key % 100;
  const label = NUM_TO_PT_LABEL[month];
  return label ? `${label}/${year}` : mes.trim();
}

export function getYearMonth(mes: string): { year: number; month: number } | null {
  const key = parseMonthKey(mes);
  if (key === 0) return null;
  return { year: Math.floor(key / 100), month: key % 100 };
}

/** Ex.: 202508 → Ago/2025 */
export function formatMonthKeyPt(key: number): string {
  if (key <= 0) return '';
  const year = Math.floor(key / 100);
  const month = key % 100;
  const label = NUM_TO_PT_LABEL[month];
  return label ? `${label}/${year}` : String(key);
}

/** Período padrão do mapa de calor (série recente legível). */
export const HEATMAP_RANGE_FROM = 202503; // Mar/2025
export const HEATMAP_RANGE_TO = 202603; // Mar/2026

export function isMonthKeyInRange(
  mes: string,
  fromKey: number,
  toKey: number,
): boolean {
  const k = parseMonthKey(mes);
  return k > 0 && k >= fromKey && k <= toKey;
}
