import * as XLSX from 'xlsx';
import { parseWeeklyHistoricText } from '@shared/weeklyHistoricParser';
import type { WeeklyHistoricParseResult } from '@shared/weeklyHistoricParser';
import { parseWeeklyHistoricMatrix } from '@shared/weeklyHistoricParser';
import { extractTextFromPdfFile } from './coderpPdfImport';

export async function parseWeeklyHistoricFile(
  file: File,
): Promise<WeeklyHistoricParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    const text = await extractTextFromPdfFile(file);
    return parseWeeklyHistoricText(text);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    }) as unknown[][];
    return parseWeeklyHistoricMatrix(matrix);
  }
  throw new Error('Use arquivo .xlsx ou .pdf da planilha semanal operacional.');
}
