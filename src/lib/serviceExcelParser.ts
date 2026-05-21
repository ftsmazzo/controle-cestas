import * as XLSX from 'xlsx';
import { formatMesPt } from '@shared/monthUtils';
import type { ServiceDef, ServiceMonthRecord } from '@shared/serviceTypes';

const MES_KEYS = ['mês', 'mes', 'competencia', 'competência', 'periodo', 'período'];
const SERVICO_KEYS = ['serviço', 'servico', 'unidade', 'setor', 'local', 'equipamento'];
const TOTAL_KEYS = ['total', 'consumo', 'quantidade', 'qtd', 'cestas'];
const FIXO_KEYS = ['fixo', 'cota fixa', 'bloqueado', 'inviolavel', 'inviolável'];

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
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[date.m - 1]}/${date.y}`;
  }
  return formatMesPt(String(val).trim());
}

function isMesColumn(header: string): boolean {
  return MES_KEYS.some((k) => header.includes(k));
}

function isMetaColumn(header: string): boolean {
  return (
    isMesColumn(header) ||
    FIXO_KEYS.some((k) => header.includes(k)) ||
    ['total geral', 'soma', 'obs'].some((k) => header.includes(k))
  );
}

/** Formato longo: Mês | Serviço | Total [| Fixo] */
function parseLongFormat(matrix: unknown[][]): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} {
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

  if (iMes < 0 || iSvc < 0 || iTotal < 0) {
    throw new Error('Formato por serviço: use colunas Mês, Serviço e Total.');
  }

  const history: ServiceMonthRecord[] = [];
  const serviceFixo = new Map<string, boolean>();

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line?.length) continue;
    const mes = formatMes(line[iMes]);
    const nome = String(line[iSvc] ?? '').trim();
    const total = parseNumber(line[iTotal]);
    if (!mes || !nome || total === null) continue;

    const id = slugId(nome);
    if (iFixo >= 0) {
      const fx = String(line[iFixo] ?? '').toLowerCase();
      if (/sim|s|yes|1|fixo|x|true/.test(fx)) serviceFixo.set(id, true);
    }

    history.push({ mes, servicoId: id, servicoNome: nome, total });
  }

  const names = new Map<string, string>();
  for (const h of history) names.set(h.servicoId, h.servicoNome);

  const services: ServiceDef[] = [...names.entries()].map(([id, nome]) => ({
    id,
    nome,
    fixo: serviceFixo.get(id) ?? false,
    cotaFixa: null,
  }));

  return { history, services };
}

/** Formato largo: Mês | Serviço A | Serviço B | … */
function parseWideFormat(matrix: unknown[][]): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} {
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
  if (iMes < 0) throw new Error('Coluna Mês não encontrada.');

  const serviceCols: { idx: number; nome: string }[] = [];
  headers.forEach((h, idx) => {
    if (idx === iMes || isMetaColumn(h)) return;
    const nome = matrix[headerRowIdx][idx];
    const label = String(nome ?? h).trim();
    if (label) serviceCols.push({ idx, nome: label });
  });

  if (serviceCols.length === 0) {
    throw new Error('Nenhuma coluna de serviço encontrada ao lado da coluna Mês.');
  }

  const history: ServiceMonthRecord[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const line = matrix[r];
    if (!line?.length) continue;
    const mes = formatMes(line[iMes]);
    if (!mes) continue;
    for (const col of serviceCols) {
      const total = parseNumber(line[col.idx]);
      if (total === null || total <= 0) continue;
      const id = slugId(col.nome);
      history.push({
        mes,
        servicoId: id,
        servicoNome: col.nome,
        total,
      });
    }
  }

  const names = new Map<string, string>();
  for (const h of history) names.set(h.servicoId, h.servicoNome);

  const services: ServiceDef[] = [...names.entries()].map(([id, nome]) => ({
    id,
    nome,
    fixo: false,
    cotaFixa: null,
  }));

  return { history, services };
}

export function parseServiceWorkbook(buffer: ArrayBuffer): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName =
    wb.SheetNames.find((n) =>
      /servi|unidade|distribui|detalh|base/i.test(n),
    ) ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  if (matrix.length < 2) throw new Error('Planilha vazia.');

  try {
    return parseLongFormat(matrix);
  } catch {
    return parseWideFormat(matrix);
  }
}

export function demoServiceData(): {
  history: ServiceMonthRecord[];
  services: ServiceDef[];
} {
  const services: ServiceDef[] = [
    { id: 'cras-centro', nome: 'CRAS Centro', fixo: true, cotaFixa: 320 },
    { id: 'creas', nome: 'CREAS', fixo: true, cotaFixa: 280 },
    { id: 'centro-pop', nome: 'Centro Pop', fixo: false, cotaFixa: null },
    { id: 'abrigo', nome: 'Abrigo Municipal', fixo: false, cotaFixa: null },
    { id: 'cozinha', nome: 'Cozinha Solidária', fixo: false, cotaFixa: null },
  ];

  const months = ['Abr/2025', 'Mai/2025', 'Jun/2025', 'Abr/2026', 'Mai/2026'];
  const pattern: Record<string, number[]> = {
    'cras-centro': [310, 315, 320, 300, 150],
    'creas': [270, 275, 280, 260, 130],
    'centro-pop': [180, 190, 200, 170, 80],
    'abrigo': [220, 230, 240, 200, 90],
    'cozinha': [150, 160, 170, 140, 58],
  };

  const history: ServiceMonthRecord[] = [];
  for (const mes of months) {
    const mi = months.indexOf(mes);
    for (const s of services) {
      history.push({
        mes,
        servicoId: s.id,
        servicoNome: s.nome,
        total: pattern[s.id][mi],
      });
    }
  }

  return { history, services };
}
