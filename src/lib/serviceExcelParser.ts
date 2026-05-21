import * as XLSX from 'xlsx';
import { formatMesPt } from '@shared/monthUtils';
import type { ServiceDef, ServiceMonthRecord } from '@shared/serviceTypes';

const MES_KEYS = ['mês', 'mes', 'competencia', 'competência', 'periodo', 'período'];
const SERVICO_KEYS = [
  'equipamento',
  'serviço',
  'servico',
  'unidade',
  'setor',
  'local',
];
const TOTAL_KEYS = ['total', 'consumo', 'quantidade', 'qtd', 'cestas'];
const FIXO_KEYS = ['fixo', 'cota fixa', 'bloqueado', 'inviolavel', 'inviolável'];

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

const PT_MONTHS = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export type ServiceSheetFormat = 'pivot' | 'long' | 'wide';

export interface ParseServiceResult {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
  format: ServiceSheetFormat;
  year: number;
  /** Anos detectados (planilha com blocos 2022, 2023, …) */
  years: number[];
  sheetName: string;
}

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function findColumnIndex(headers: string[], keys: string[]): number {
  return headers.findIndex((h) => keys.some((k) => h.includes(k)));
}

function parseNumber(val: unknown): number | null {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (val == null || val === '') return null;
  const raw = String(val).trim();
  if (/pendente|aguardando|n\/a|na\b|—|-/i.test(raw)) return null;
  const s = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function slugId(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatMes(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'number' && val > 40000) {
    const date = XLSX.SSF.parse_date_code(val);
    return `${PT_MONTHS[date.m]}/${date.y}`;
  }
  return formatMesPt(String(val).trim());
}

/** Cabeçalho é só mês (Jan, Fev, …) sem ano */
function isMonthOnlyHeader(header: string): boolean {
  const t = normalizeHeader(header).replace(/[^a-z]/g, '').slice(0, 3);
  return t in MONTH_TO_NUM;
}

function mesLabelFromMonthHeader(header: string, year: number): string {
  const t = normalizeHeader(header).replace(/[^a-z]/g, '').slice(0, 3);
  const m = MONTH_TO_NUM[t];
  if (!m) return '';
  return `${PT_MONTHS[m]}/${year}`;
}

function isEquipamentoColumn(header: string): boolean {
  return SERVICO_KEYS.some((k) => header.includes(k));
}

function isMetaColumn(header: string): boolean {
  const h = normalizeHeader(header);
  return (
    findColumnIndex([h], MES_KEYS) >= 0 ||
    FIXO_KEYS.some((k) => h.includes(k)) ||
    [
      'total geral',
      'total ano',
      'soma',
      'obs',
      'media',
      'média',
      'media mensal',
      'média mensal',
      'primeiro semestre',
      'segundo semestre',
      '1º semestre',
      '2º semestre',
    ].some((k) => h.includes(k)) ||
    /^total\b/.test(h)
  );
}

function isServiceTotalRow(nome: string): boolean {
  return /^total\b|^soma\b|^geral\b|^subtotal\b/i.test(nome.trim());
}

function inferYearNearRow(matrix: unknown[][], rowIdx: number): number | null {
  for (let r = rowIdx; r >= Math.max(0, rowIdx - 12); r--) {
    for (const cell of matrix[r] ?? []) {
      const s = String(cell ?? '').trim();
      if (!s) continue;
      const onlyYear = s.match(/^(20\d{2})$/);
      if (onlyYear) return parseInt(onlyYear[1], 10);
      const embedded = s.match(/\b(20\d{2})\b/);
      if (embedded) return parseInt(embedded[1], 10);
    }
  }
  return null;
}

interface PivotHeaderScan {
  headerRowIdx: number;
  equipCol: number;
  monthCols: { idx: number; mes: string; header: string }[];
  year: number;
}

function scanPivotHeader(
  matrix: unknown[][],
  rowIdx: number,
  defaultYear: number,
): PivotHeaderScan | null {
  const rawHeaders = matrix[rowIdx] ?? [];
  const headers = rawHeaders.map(normalizeHeader);
  const months: { idx: number; mes: string; header: string }[] = [];

  const year = inferYearNearRow(matrix, rowIdx) ?? defaultYear;

  headers.forEach((h, idx) => {
    if (idx === 0) return;
    if (isMetaColumn(h)) return;
    if (isMonthOnlyHeader(h)) {
      const mes = mesLabelFromMonthHeader(h, year);
      if (mes) months.push({ idx, mes, header: h });
    }
  });

  if (months.length < 3) return null;

  const col0 = headers[0] ?? '';
  let equipCol = 0;
  if (!isEquipamentoColumn(col0) && col0 !== '' && col0 !== 'equipamento') {
    const eqIdx = findColumnIndex(headers, SERVICO_KEYS);
    equipCol = eqIdx >= 0 ? eqIdx : 0;
  }

  return { headerRowIdx: rowIdx, equipCol, monthCols: months, year };
}

function findAllPivotBlocks(
  matrix: unknown[][],
  defaultYear: number,
): PivotHeaderScan[] {
  const blocks: PivotHeaderScan[] = [];
  for (let i = 0; i < matrix.length; i++) {
    const scan = scanPivotHeader(matrix, i, defaultYear);
    if (!scan) continue;
    if (blocks.some((b) => b.headerRowIdx === scan.headerRowIdx)) continue;
    blocks.push(scan);
  }
  return blocks;
}

/** 5 tabelas empilhadas sem ano no título → 2022, 2023, 2024… */
function resolveBlockYears(
  matrix: unknown[][],
  blocks: PivotHeaderScan[],
  startYear: number,
): void {
  let year = startYear;
  for (let i = 0; i < blocks.length; i++) {
    const near = inferYearNearRow(matrix, blocks[i].headerRowIdx);
    if (near != null && (i === 0 || near > blocks[i - 1].year)) {
      year = near;
    } else if (i === 0) {
      year = startYear;
    } else {
      year = blocks[i - 1].year + 1;
    }
    blocks[i].year = year;
    blocks[i].monthCols = blocks[i].monthCols.map((col) => ({
      ...col,
      mes: mesLabelFromMonthHeader(col.header, year),
    }));
  }
}

export function inferYearFromSheet(
  sheetName: string,
  matrix: unknown[][],
): number {
  const fromName = sheetName.match(/(20\d{2})/);
  if (fromName) return parseInt(fromName[1], 10);
  for (let r = 0; r < Math.min(5, matrix.length); r++) {
    for (const cell of matrix[r] ?? []) {
      const m = String(cell ?? '').match(/(20\d{2})/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return new Date().getFullYear();
}

/** Serviços com consumo estável — sugestão de marcar como fixo na UI */
const SUGESTAO_FIXO = new Set(
  ['saica', 'gabinete'].map((s) => s),
);

function buildServices(
  history: ServiceMonthRecord[],
  serviceFixo: Map<string, boolean>,
): ServiceDef[] {
  const names = new Map<string, string>();
  for (const h of history) names.set(h.servicoId, h.servicoNome);
  return [...names.entries()].map(([id, nome]) => ({
    id,
    nome,
    fixo: serviceFixo.get(id) ?? SUGESTAO_FIXO.has(id),
    cotaFixa: null,
  }));
}

/**
 * Formato pivot da planilha institucional:
 * | Equipamento | Jan | Fev | Mar | … | Dez |
 * CRAS 1, CRAS 2, CREAS 1… são linhas separadas automaticamente.
 */
function parsePivotBlock(
  matrix: unknown[][],
  block: PivotHeaderScan,
  endRow: number,
): ServiceMonthRecord[] {
  const history: ServiceMonthRecord[] = [];
  const { headerRowIdx, equipCol, monthCols } = block;

  for (let r = headerRowIdx + 1; r < endRow; r++) {
    const line = matrix[r];
    if (!line?.length) continue;

    const nome = String(line[equipCol] ?? '').trim();
    if (!nome || isServiceTotalRow(nome)) continue;

    const id = slugId(nome);

    for (const col of monthCols) {
      const total = parseNumber(line[col.idx]);
      if (total === null || total < 0) continue;
      if (total === 0) continue;
      history.push({
        mes: col.mes,
        servicoId: id,
        servicoNome: nome,
        total,
      });
    }
  }

  return history;
}

function parsePivotFormat(
  matrix: unknown[][],
  year: number,
  startYear?: number,
): { history: ServiceMonthRecord[]; services: ServiceDef[]; years: number[] } | null {
  const blocks = findAllPivotBlocks(matrix, year);
  if (blocks.length === 0) return null;

  const endYear = new Date().getFullYear();
  const autoStart =
    blocks.length > 1 ? endYear - blocks.length + 1 : year;
  const anchor = startYear ?? autoStart;
  resolveBlockYears(matrix, blocks, anchor);

  const allHistory: ServiceMonthRecord[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const endRow =
      b + 1 < blocks.length ? blocks[b + 1].headerRowIdx : matrix.length;
    allHistory.push(...parsePivotBlock(matrix, blocks[b], endRow));
  }

  if (allHistory.length === 0) return null;

  const years = [...new Set(blocks.map((x) => x.year))].sort((a, b) => a - b);

  return {
    history: allHistory,
    services: buildServices(allHistory, new Map()),
    years,
  };
}

/** Totais mensais da linha TOTAL de cada bloco (para visão geral agregada). */
export function extractMonthlyTotalsFromPivot(
  buffer: ArrayBuffer,
  options?: { year?: number },
): { mes: string; total: number }[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
  const year = options?.year ?? inferYearFromSheet(wb.SheetNames[0], matrix);
  const blocks = findAllPivotBlocks(matrix, year);
  const totals: { mes: string; total: number }[] = [];

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    const endRow =
      b + 1 < blocks.length ? blocks[b + 1].headerRowIdx : matrix.length;
    for (let r = block.headerRowIdx + 1; r < endRow; r++) {
      const line = matrix[r];
      const nome = String(line?.[block.equipCol] ?? '').trim();
      if (!isServiceTotalRow(nome)) continue;
      for (const col of block.monthCols) {
        const total = parseNumber(line?.[col.idx]);
        if (total === null || total <= 0) continue;
        totals.push({ mes: col.mes, total });
      }
      break;
    }
  }

  return totals;
}

/** Formato longo: Mês | Serviço | Total [| Fixo] */
function parseLongFormat(matrix: unknown[][]): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} | null {
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const row = matrix[i].map(normalizeHeader);
    if (findColumnIndex(row, MES_KEYS) >= 0 && findColumnIndex(row, SERVICO_KEYS) >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = matrix[headerRowIdx].map(normalizeHeader);
  const iMes = findColumnIndex(headers, MES_KEYS);
  const iSvc = findColumnIndex(headers, SERVICO_KEYS);
  const iTotal = findColumnIndex(headers, TOTAL_KEYS);
  const iFixo = findColumnIndex(headers, FIXO_KEYS);

  if (iMes < 0 || iSvc < 0 || iTotal < 0) return null;

  const history: ServiceMonthRecord[] = [];
  const serviceFixo = new Map<string, boolean>();

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line?.length) continue;
    const mes = formatMes(line[iMes]);
    const nome = String(line[iSvc] ?? '').trim();
    const total = parseNumber(line[iTotal]);
    if (!mes || !nome || total === null || total <= 0) continue;

    const id = slugId(nome);
    if (iFixo >= 0) {
      const fx = String(line[iFixo] ?? '').toLowerCase();
      if (/sim|s|yes|1|fixo|x|true/.test(fx)) serviceFixo.set(id, true);
    }

    history.push({ mes, servicoId: id, servicoNome: nome, total });
  }

  if (history.length === 0) return null;

  return { history, services: buildServices(history, serviceFixo) };
}

/** Formato: coluna Mês + uma coluna por serviço */
function parseWideByMonthColumn(matrix: unknown[][]): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} | null {
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const row = matrix[i].map(normalizeHeader);
    if (findColumnIndex(row, MES_KEYS) >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = matrix[headerRowIdx].map(normalizeHeader);
  const iMes = findColumnIndex(headers, MES_KEYS);
  if (iMes < 0) return null;

  const serviceCols: { idx: number; nome: string }[] = [];
  headers.forEach((h, idx) => {
    if (idx === iMes || isMetaColumn(h)) return;
    const label = String(matrix[headerRowIdx][idx] ?? h).trim();
    if (label && !isMonthOnlyHeader(h)) serviceCols.push({ idx, nome: label });
  });

  if (serviceCols.length === 0) return null;

  const history: ServiceMonthRecord[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line?.length) continue;
    const mes = formatMes(line[iMes]);
    if (!mes) continue;
    for (const col of serviceCols) {
      const total = parseNumber(line[col.idx]);
      if (total === null || total <= 0) continue;
      history.push({
        mes,
        servicoId: slugId(col.nome),
        servicoNome: col.nome,
        total,
      });
    }
  }

  if (history.length === 0) return null;

  return { history, services: buildServices(history, new Map()) };
}

function sheetToMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];
}

function shouldSkipSheet(name: string): boolean {
  return /^(sheet\d+|resumo|instrucoes|instruções|readme|capa)$/i.test(
    name.trim(),
  );
}

function yearFromSheetName(sheetName: string): number | null {
  const m = sheetName.match(/(20\d{2})/);
  return m ? parseInt(m[1], 10) : null;
}

function mergeParseResults(
  parts: ParseServiceResult[],
): ParseServiceResult {
  const history: ServiceMonthRecord[] = [];
  const years = new Set<number>();
  for (const p of parts) {
    history.push(...p.history);
    p.years.forEach((y) => years.add(y));
  }
  const sortedYears = [...years].sort((a, b) => a - b);
  return {
    history,
    services: buildServices(history, new Map()),
    format: 'pivot',
    year: sortedYears[sortedYears.length - 1] ?? new Date().getFullYear(),
    years: sortedYears,
    sheetName: parts.map((p) => p.sheetName).join(' + '),
  };
}

function parseMatrixAsPivot(
  matrix: unknown[][],
  sheetName: string,
  options?: { year?: number; startYear?: number },
): ParseServiceResult | null {
  if (matrix.length < 2) return null;

  const namedYear = yearFromSheetName(sheetName);
  const year =
    namedYear ??
    options?.year ??
    inferYearFromSheet(sheetName, matrix);
  const startYear =
    namedYear ??
    options?.startYear ??
    (options?.year != null ? options.year : 2022);

  const pivot = parsePivotFormat(matrix, year, startYear);
  if (pivot?.history.length) {
    return {
      ...pivot,
      format: 'pivot',
      year: pivot.years[pivot.years.length - 1] ?? year,
      sheetName,
    };
  }

  const longF = parseLongFormat(matrix);
  if (longF?.history.length) {
    return { ...longF, format: 'long', year, years: [year], sheetName };
  }

  const wide = parseWideByMonthColumn(matrix);
  if (wide?.history.length) {
    return { ...wide, format: 'wide', year, years: [year], sheetName };
  }

  return null;
}

export function parseServiceWorkbook(
  buffer: ArrayBuffer,
  options?: { year?: number; startYear?: number },
): ParseServiceResult {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetResults: ParseServiceResult[] = [];

  for (const sheetName of wb.SheetNames) {
    if (shouldSkipSheet(sheetName)) continue;
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    const parsed = parseMatrixAsPivot(matrix, sheetName, options);
    if (parsed) sheetResults.push(parsed);
  }

  if (sheetResults.length > 1) {
    return mergeParseResults(sheetResults);
  }
  if (sheetResults.length === 1) {
    return sheetResults[0];
  }

  const fallbackName = wb.SheetNames[0];
  const matrix = sheetToMatrix(wb.Sheets[fallbackName]);
  if (matrix.length < 2) throw new Error('Planilha vazia.');

  const parsed = parseMatrixAsPivot(matrix, fallbackName, options);
  if (parsed) return parsed;

  throw new Error(
    'Formato não reconhecido. Use abas 2022, 2023… com Equipamento + JANEIRO…DEZEMBRO, ou várias tabelas na mesma aba.',
  );
}

/** Dados ilustrativos no padrão da planilha (equipamentos reais) */
export function demoServiceData(): ParseServiceResult {
  const year = 2025;
  const equipamentos: { nome: string; fixo: boolean; cotaFixa: number | null; valores: (number | null)[] }[] = [
    { nome: 'CRAS', fixo: false, cotaFixa: null, valores: [1200, 1100, 1150, 1050, 1000, 980, 1020, 990, null, 1010, null, 1100] },
    { nome: 'CREAS', fixo: false, cotaFixa: null, valores: [280, 260, 300, 270, 250, 240, 290, 275, 265, 280, 270, 300] },
    { nome: 'NAEM', fixo: false, cotaFixa: null, valores: [12, 15, 18, 14, 10, 8, 16, 12, 11, 14, 13, 15] },
    { nome: 'CREPD', fixo: false, cotaFixa: null, valores: [2, 0, 4, 2, 0, 2, 0, 4, 2, 0, 2, 4] },
    { nome: 'Núcleos Mãos Dadas', fixo: false, cotaFixa: null, valores: [6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { nome: 'SAICA', fixo: true, cotaFixa: 40, valores: [38, 40, 42, 39, 41, 40, 38, 42, 40, 39, 41, 40] },
    { nome: 'Gabinete', fixo: false, cotaFixa: null, valores: [18, 20, 22, 19, 21, 20, 18, 22, 20, 19, 21, 20] },
    { nome: 'Defesa Civil', fixo: false, cotaFixa: null, valores: [1, 2, 0, 3, 1, 0, 2, 1, 0, 2, 1, 0] },
    { nome: 'Avarias', fixo: false, cotaFixa: null, valores: [26, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  ];

  const history: ServiceMonthRecord[] = [];
  const services: ServiceDef[] = [];

  equipamentos.forEach((eq) => {
    const id = slugId(eq.nome);
    services.push({
      id,
      nome: eq.nome,
      fixo: eq.fixo,
      cotaFixa: eq.cotaFixa,
    });
    eq.valores.forEach((v, mi) => {
      if (v == null || v <= 0) return;
      history.push({
        mes: `${PT_MONTHS[mi + 1]}/${year}`,
        servicoId: id,
        servicoNome: eq.nome,
        total: v,
      });
    });
  });

  return {
    history,
    services,
    format: 'pivot',
    year,
    years: [year],
    sheetName: 'Consumo 2025',
  };
}