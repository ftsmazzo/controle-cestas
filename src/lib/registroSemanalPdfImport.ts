import { parseRegistroSemanalPdfText } from '@shared/registroSemanalPdfParser';
import type { RegistroSemanalParseResult } from '@shared/registroSemanalPdfParser';
import type { ServiceDef } from '@shared/serviceTypes';
import { extractTextFromPdfFile } from './coderpPdfImport';

export async function parseRegistroSemanalPdfFile(
  file: File,
  services: ServiceDef[],
  mesAlvo?: string | null,
  semanaAlvo?: number | null,
): Promise<RegistroSemanalParseResult> {
  const text = await extractTextFromPdfFile(file);
  return parseRegistroSemanalPdfText(text, services, {
    mesAlvo,
    semanaAlvo,
    fileName: file.name,
  });
}
