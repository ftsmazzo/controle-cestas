import * as XLSX from 'xlsx';
import type { RawMonthRow } from './types';
import { inferStatus } from './calculations';

const MES_KEYS = ['mês', 'mes', 'competencia', 'competência', 'periodo', 'período'];
const TOTAL_KEYS = ['total', 'consumo', 'quantidade', 'qtd', 'cestas'];
const STATUS_KEYS = ['status', 'situação', 'situacao'];
const OBS_KEYS = ['observação', 'observacao', 'obs', 'nota'];

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
  const s = String(val).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function parseStatus(val: unknown): RawMonthRow['status'] | undefined {
  const s = String(val ?? '').trim();
  if (!s) return undefined;
  if (/ruptura/i.test(s)) return 'Ruptura de estoque';
  if (/parcial/i.test(s)) return 'Parcial';
  if (/completo/i.test(s)) return 'Completo';
  return undefined;
}

function formatMes(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'number' && val > 40000) {
    const date = XLSX.SSF.parse_date_code(val);
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[date.m - 1]}/${date.y}`;
  }
  return String(val).trim();
}

export function parseWorkbook(buffer: ArrayBuffer): RawMonthRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) => /base|dados|historico|histórico|levantamento/i.test(n)) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (matrix.length < 2) {
    throw new Error('Planilha vazia ou sem dados suficientes.');
  }

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(10, matrix.length); i++) {
    const row = matrix[i].map(normalizeHeader);
    if (findColumnIndex(row, MES_KEYS) >= 0 && findColumnIndex(row, TOTAL_KEYS) >= 0) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = matrix[headerRowIdx].map(normalizeHeader);
  const iMes = findColumnIndex(headers, MES_KEYS);
  const iTotal = findColumnIndex(headers, TOTAL_KEYS);
  const iStatus = findColumnIndex(headers, STATUS_KEYS);
  const iObs = findColumnIndex(headers, OBS_KEYS);

  if (iMes < 0 || iTotal < 0) {
    throw new Error(
      'Colunas obrigatórias não encontradas. Use cabeçalhos como "Mês" e "Total" (ou Consumo).',
    );
  }

  const rows: RawMonthRow[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line || line.length === 0) continue;
    const mes = formatMes(line[iMes]);
    const total = parseNumber(line[iTotal]);
    if (!mes || total === null) continue;
    const observacao = iObs >= 0 ? String(line[iObs] ?? '').trim() : '';
    const status = iStatus >= 0 ? parseStatus(line[iStatus]) : undefined;
    rows.push({
      mes,
      total,
      status: status ?? inferStatus(mes, observacao),
      observacao,
    });
  }

  if (rows.length === 0) {
    throw new Error('Nenhuma linha mensal válida foi lida da planilha.');
  }

  return rows;
}

export function parseDemoData(): RawMonthRow[] {
  return [
    { mes: 'Abr/2025', total: 1200, status: 'Completo' },
    { mes: 'Mai/2025', total: 1350, status: 'Completo' },
    { mes: 'Jun/2025', total: 1400, status: 'Completo' },
    { mes: 'Jul/2025', total: 1450, status: 'Completo' },
    { mes: 'Ago/2025', total: 1500, status: 'Completo' },
    { mes: 'Set/2025', total: 1550, status: 'Completo' },
    { mes: 'Out/2025', total: 1600, status: 'Completo' },
    { mes: 'Nov/2025', total: 1650, status: 'Completo' },
    { mes: 'Dez/2025', total: 1700, status: 'Completo' },
    { mes: 'Jan/2026', total: 1750, status: 'Completo' },
    { mes: 'Fev/2026', total: 1800, status: 'Completo' },
    { mes: 'Mar/2026', total: 1900, status: 'Completo' },
    { mes: 'Abr/2026', total: 900, status: 'Ruptura de estoque', observacao: 'Ruptura de estoque' },
    { mes: 'Mai/2026', total: 600, status: 'Parcial', observacao: 'Mês parcial/incompleto' },
  ];
}
