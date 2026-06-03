import * as XLSX from 'xlsx';

export interface ExportTableExcelOptions {
  table: HTMLTableElement;
  title: string;
  subtitle?: string;
  /** Nome do arquivo sem extensão; padrão = título sanitizado */
  fileName?: string;
}

function sanitizeFileName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return base || 'tabela';
}

function cellText(cell: HTMLTableCellElement): string {
  return cell.innerText.replace(/\s+/g, ' ').trim();
}

/** Converte thead/tbody/tfoot em matriz (respeita colspan com células vazias). */
export function tableElementToAoA(table: HTMLTableElement): string[][] {
  const rows: string[][] = [];
  const parts: Element[] = [];

  for (const tag of ['thead', 'tbody', 'tfoot']) {
    const el = table.querySelector(tag);
    if (el) parts.push(el);
  }
  if (parts.length === 0) {
    parts.push(table);
  }

  for (const part of parts) {
    for (const tr of part.querySelectorAll('tr')) {
      const row: string[] = [];
      for (const cell of tr.querySelectorAll<HTMLTableCellElement>('th, td')) {
        const span = Math.max(1, cell.colSpan || 1);
        row.push(cellText(cell));
        for (let i = 1; i < span; i++) row.push('');
      }
      if (row.length > 0) rows.push(row);
    }
  }

  return rows;
}

export function exportTableToExcel(options: ExportTableExcelOptions): boolean {
  const { table, title, subtitle, fileName } = options;

  const meta: string[][] = [
    ['SEMAS · Controle de Cestas'],
    [title],
  ];
  if (subtitle?.trim()) meta.push([subtitle.trim()]);
  meta.push([
    'Exportado em',
    new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
  ]);
  meta.push([]);

  const tableRows = tableElementToAoA(table);
  if (tableRows.length === 0) return false;

  const aoa = [...meta, ...tableRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const colCount = Math.max(...aoa.map((r) => r.length), 1);
  ws['!cols'] = Array.from({ length: colCount }, (_, i) => {
    const maxLen = Math.min(
      48,
      Math.max(
        8,
        ...aoa.map((row) => String(row[i] ?? '').length),
      ),
    );
    return { wch: maxLen + 2 };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');

  const name = `${sanitizeFileName(fileName ?? title)}.xlsx`;
  XLSX.writeFile(wb, name);
  return true;
}
