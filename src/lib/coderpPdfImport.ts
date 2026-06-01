import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { parseCoderpPdfText, type CoderpParseResult } from '@shared/coderpPdfParser';
import type { ServiceDef } from '@shared/serviceTypes';

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

export async function extractTextFromPdfFile(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    parts.push(line);
  }
  return parts.join('\n');
}

export async function parseCoderpPdfFile(
  file: File,
  services: ServiceDef[],
): Promise<CoderpParseResult> {
  const text = await extractTextFromPdfFile(file);
  return parseCoderpPdfText(text, services);
}
