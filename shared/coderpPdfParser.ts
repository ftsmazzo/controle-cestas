import { resolveCoderpUnidadeNome } from './coderpRequisitanteRules.js';
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
  const mov = text.match(
    /Per[ií]odo\s*\(Movimenta[cç][aã]o\)\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (mov) {
    return {
      label: `${mov[1]} – ${mov[2]}`,
      inicio: mov[1],
      fim: mov[2],
    };
  }
  return parseCoderpAnaliticoPeriod(text);
}

/** Período do relatório analítico: 17/06/2026 à 23/06/2026 */
export function parseCoderpAnaliticoPeriod(text: string): {
  label: string | null;
  inicio: string | null;
  fim: string | null;
} {
  const m = text.match(
    /Per[ií]odo\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (!m) return { label: null, inicio: null, fim: null };
  return {
    label: `${m[1]} – ${m[2]}`,
    inicio: m[1],
    fim: m[2],
  };
}

/** Relatório “Atendimento das Requisições de Material em Estoque (Analítico)” */
export function isCoderpAnaliticoPdf(text: string): boolean {
  return (
    /Atendimento das Requisi[cç][oõ]es de Material em Estoque/i.test(text) &&
    /Anal[ií]tico/i.test(text) &&
    /Qtde\.\s*Solicitada:\s*Qtde\.\s*Atendida/i.test(text)
  );
}

function extractRequisitanteBlocks(text: string): { codigo: string; nome: string; body: string }[] {
  const blocks: { codigo: string; nome: string; body: string }[] = [];
  const re =
    /(\d{4,5})\s*-\s*[\d.]+\s*-\s*(.+?)(?=Requisitante|\d{4,5}\s*-\s*[\d.]|Coderp Inform|$)/gis;
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
  const item = block.match(/000001\s+([\d.,]+)/);
  if (item) return parseBrNumber(item[1]);
  const total = block.match(
    /([\d.,]+)\s+[\d.,]+\s+[\d.,]+\s+[\d.,]+\s*Total\s+Requisitante/i,
  );
  if (total) return parseBrNumber(total[1]);
  const loose = block.match(/Qtde\.?\s*Total\s+([\d.,]+)/i);
  if (loose) return parseBrNumber(loose[1]);
  return null;
}

function qtyAtendidaFromAnaliticoBlock(block: string): number | null {
  const m = block.match(
    /([\d.,]+)\s+([\d.,]+)\s*Qtde\.\s*Solicitada:\s*Qtde\.\s*Atendida/i,
  );
  if (m) return parseBrNumber(m[2]);
  return null;
}

interface AnaliticoRawRow {
  codigo: string;
  requisitante: string;
  quantidade: number;
}

function parseAnaliticoFromResumo(text: string): AnaliticoRawRow[] {
  const resumoIdx = text.search(/\bResumo\b/i);
  if (resumoIdx < 0) return [];
  const slice = text.slice(resumoIdx);
  const rows: AnaliticoRawRow[] = [];
  const re = /^([\d.,]+)([\d.,]+)(\d{4,5})\s*-\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const nome = m[4].replace(/\s+/g, ' ').trim();
    if (!nome || /^total\b/i.test(nome)) continue;
    const quantidade = parseBrNumber(m[1]);
    if (quantidade <= 0) continue;
    rows.push({ codigo: m[3], requisitante: nome, quantidade });
  }
  return rows;
}

function parseAnaliticoFromDetalhe(text: string): AnaliticoRawRow[] {
  const cleaned = text.replace(
    /Coderp Inform[aá]tica[\s\S]*?(?=\d{4,5}\s*-|PREFEITURA|Per[ií]odo\s*-)/gi,
    '\n',
  );
  const rows: AnaliticoRawRow[] = [];
  const re = /(\d{4,5})\s*-\s*(.+?)Requisitante:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned)) !== null) {
    const nome = m[2].replace(/\s+/g, ' ').trim();
    const end = m.index + m[0].length;
    const body = cleaned.slice(end, end + 600);
    const quantidade = qtyAtendidaFromAnaliticoBlock(body);
    if (quantidade == null || quantidade <= 0) continue;
    rows.push({ codigo: m[1], requisitante: nome, quantidade });
  }
  return rows;
}

function coderpRowFromRaw(
  raw: AnaliticoRawRow,
  services: ServiceDef[],
): CoderpRequisitanteRow {
  const requisitante = raw.requisitante.startsWith('SETOR')
    ? raw.requisitante
    : `SETOR ${raw.requisitante}`;
  const canonical =
    resolveCoderpUnidadeNome(requisitante) ??
    resolveCoderpUnidadeNome(raw.requisitante) ??
    canonicalUnitNameFromCoderp(requisitante);
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

  return {
    codigo: raw.codigo,
    requisitante: raw.requisitante,
    quantidade: raw.quantidade,
    canonicalNome: canonical,
    servicoId,
    servicoNome,
    familia,
    match,
  };
}

/** Relatório analítico semanal (Qtde. Atendida por requisitante) */
export function parseCoderpAnaliticoPdfText(
  text: string,
  services: ServiceDef[] = [],
): CoderpParseResult {
  const warnings: string[] = [];
  const period = parseCoderpAnaliticoPeriod(text);
  let rawRows = parseAnaliticoFromResumo(text);
  if (rawRows.length < 3) {
    rawRows = parseAnaliticoFromDetalhe(text);
  }

  if (!rawRows.length) {
    warnings.push(
      'Nenhum requisitante no PDF analítico. Confira se o arquivo é o relatório de Atendimento (Analítico) da semana.',
    );
  }

  const rows = rawRows.map((raw) => coderpRowFromRaw(raw, services));
  const semCanonical = rows.filter((r) => !r.canonicalNome);
  if (semCanonical.length) {
    warnings.push(
      `${semCanonical.length} requisitante(s) ignorado(s) (sem unidade de consumo): ${semCanonical
        .map((r) => r.requisitante.slice(0, 40))
        .slice(0, 3)
        .join(', ')}${semCanonical.length > 3 ? '…' : ''}.`,
    );
  }

  return {
    periodoLabel: period.label,
    periodoInicio: period.inicio,
    periodoFim: period.fim,
    rows: rows.filter((r) => r.canonicalNome && r.quantidade > 0),
    warnings,
  };
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
