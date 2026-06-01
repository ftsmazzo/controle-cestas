import {
  canonicalUnitNameFromCoderp,
  detectFamiliaFromName,
  matchServiceByCanonicalName,
  slugServiceId,
  type FamiliaCodigo,
} from './serviceFamilies.js';
import type { ServiceDef } from './serviceTypes.js';

export interface CoderpRequisitanteRow {
  codigo: string;
  requisitante: string;
  quantidade: number;
  canonicalNome: string | null;
  servicoId: string | null;
  servicoNome: string | null;
  familia: FamiliaCodigo | null;
  match: 'ok' | 'unmatched' | 'criar';
}

export interface CoderpParseResult {
  periodoLabel: string | null;
  periodoInicio: string | null;
  periodoFim: string | null;
  rows: CoderpRequisitanteRow[];
  warnings: string[];
}

function parseBrNumber(s: string): number {
  const t = s.trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(t);
  return Number.isNaN(n) ? 0 : Math.round(n);
}

/** Extrai período: 01/10/2025 à 30/04/2026 */
export function parseCoderpPeriod(text: string): {
  label: string | null;
  inicio: string | null;
  fim: string | null;
} {
  const m = text.match(
    /Per[ií]odo\s*\(Movimenta[cç][aã]o\)\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (!m) return { label: null, inicio: null, fim: null };
  return {
    label: `${m[1]} – ${m[2]}`,
    inicio: m[1],
    fim: m[2],
  };
}

function extractRequisitanteBlocks(text: string): { codigo: string; nome: string; body: string }[] {
  const blocks: { codigo: string; nome: string; body: string }[] = [];
  const re =
    /(\d{5})\s*-\s*[\d.]+\s*-\s*(.+?)(?=Requisitante|\d{5}\s*-\s*[\d.]|Coderp Inform|$)/gis;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const nome = m[2].replace(/\s+/g, ' ').trim();
    const end = m.index + m[0].length;
    const body = text.slice(end, end + 800);
    blocks.push({ codigo: m[1], nome, body: m[0] + body });
  }
  return blocks;
}

function qtyFromBlock(block: string): number | null {
  const item = block.match(
    /000001\s+([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+/,
  );
  if (item) return parseBrNumber(item[1]);
  const total = block.match(
    /([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s*Total\s+Requisitante/i,
  );
  if (total) return parseBrNumber(total[1]);
  const loose = block.match(/Qtde\.?\s*Total\s+([\d.,]+)/i);
  if (loose) return parseBrNumber(loose[1]);
  return null;
}

export function parseCoderpPdfText(
  text: string,
  services: ServiceDef[] = [],
): CoderpParseResult {
  const warnings: string[] = [];
  const period = parseCoderpPeriod(text);
  const blocks = extractRequisitanteBlocks(text);

  if (!blocks.length) {
    warnings.push(
      'Nenhum requisitante encontrado. Confira se o PDF é o relatório RME Coderp (Consumo por requisitante).',
    );
  }

  const rows: CoderpRequisitanteRow[] = [];

  for (const b of blocks) {
    const qty = qtyFromBlock(b.body);
    if (qty == null || qty <= 0) {
      warnings.push(`Sem quantidade: ${b.nome.slice(0, 60)}…`);
      continue;
    }
    const canonical = canonicalUnitNameFromCoderp(b.nome);
    let servicoId: string | null = null;
    let servicoNome: string | null = null;
    let match: CoderpRequisitanteRow['match'] = 'unmatched';
    let familia: FamiliaCodigo | null = null;

    if (canonical) {
      const found = matchServiceByCanonicalName(services, canonical);
      if (found) {
        servicoId = found.id;
        servicoNome = found.nome;
        familia = found.familiaCodigo ?? null;
        match = 'ok';
      } else {
        servicoId = slugServiceId(canonical);
        servicoNome = canonical;
        match = 'criar';
        familia = detectFamiliaFromName(canonical);
      }
    }

    rows.push({
      codigo: b.codigo,
      requisitante: b.nome,
      quantidade: qty,
      canonicalNome: canonical,
      servicoId,
      servicoNome,
      familia,
      match,
    });
  }

  return {
    periodoLabel: period.label,
    periodoInicio: period.inicio,
    periodoFim: period.fim,
    rows,
    warnings,
  };
}
