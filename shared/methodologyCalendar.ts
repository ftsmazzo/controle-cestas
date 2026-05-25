import type { MonthStatus, RawMonthRow } from './types.js';
import { formatMesPt, getYearMonth, parseMonthKey } from './monthUtils.js';

export type MethodologyTag =
  | 'valid'
  | 'covid_tail'
  | 'rationing_2023'
  | 'rupture'
  | 'partial'
  | 'custom';

export interface MethodologyMonthOverride {
  mes: string;
  tag: MethodologyTag;
  excluirDoModelo: boolean;
  nota: string;
  /** Se omitido, deriva do tag */
  status?: MonthStatus;
}

export interface MethodologySettings {
  /** Chave: YYYYMM (parseMonthKey) */
  overrides: Record<string, MethodologyMonthOverride>;
  /** Se true, todos os meses de 2023 entram como racionamento (salvo override explícito) */
  excludeYear2023: boolean;
  /** Jan–Mar/2022 como legado COVID */
  exclude2022Q1: boolean;
  /** Últimos N meses válidos para tendência, previsão e distribuição (padrão 8) */
  janelaMediaMeses: number;
  /** null = todos os meses válidos na janela */
  janelaAnaliseMeses: number | null;
}

export const NOTA_COVID_2022 =
  'Jan–Mar/2022: consumo inflado pelo encerramento das ações de Combate ao COVID. Excluído do modelo preditivo.';

export const NOTA_RACIONAMENTO_2023 =
  '2023: ano de racionamento agressivo por falta de cestas. Não representa demanda plena. Excluído do modelo preditivo.';

export function defaultMethodologySettings(): MethodologySettings {
  return {
    overrides: {},
    excludeYear2023: true,
    exclude2022Q1: true,
    janelaMediaMeses: 8,
    janelaAnaliseMeses: 8,
  };
}

function monthKey(mes: string): string {
  return String(parseMonthKey(formatMesPt(mes)));
}

function tagToStatus(tag: MethodologyTag): MonthStatus {
  switch (tag) {
    case 'rupture':
      return 'Ruptura de estoque';
    case 'partial':
      return 'Parcial';
    case 'covid_tail':
    case 'rationing_2023':
    case 'custom':
      return 'Parcial';
    default:
      return 'Completo';
  }
}

function tagDefaultNota(tag: MethodologyTag): string {
  switch (tag) {
    case 'covid_tail':
      return NOTA_COVID_2022;
    case 'rationing_2023':
      return NOTA_RACIONAMENTO_2023;
    case 'rupture':
      return 'Ruptura de estoque — parada no fornecimento.';
    case 'partial':
      return 'Mês parcial / racionamento — exclusão do modelo.';
    default:
      return '';
  }
}

/** Defaults automáticos para períodos conhecidos (antes de overrides manuais). */
export function buildDefaultOverrides(
  settings: MethodologySettings,
  monthsInData: string[],
): Record<string, MethodologyMonthOverride> {
  const out: Record<string, MethodologyMonthOverride> = { ...settings.overrides };

  for (const mes of monthsInData) {
    const key = monthKey(mes);
    if (out[key]) continue;
    const ym = getYearMonth(mes);
    if (!ym) continue;

    if (settings.exclude2022Q1 && ym.year === 2022 && ym.month <= 3) {
      out[key] = {
        mes: formatMesPt(mes),
        tag: 'covid_tail',
        excluirDoModelo: true,
        nota: NOTA_COVID_2022,
        status: 'Parcial',
      };
      continue;
    }

    if (settings.excludeYear2023 && ym.year === 2023) {
      out[key] = {
        mes: formatMesPt(mes),
        tag: 'rationing_2023',
        excluirDoModelo: true,
        nota: NOTA_RACIONAMENTO_2023,
        status: 'Parcial',
      };
      continue;
    }

    if (ym.year === 2026 && ym.month === 4) {
      out[key] = {
        mes: formatMesPt(mes),
        tag: 'rupture',
        excluirDoModelo: true,
        nota: 'Abr/2026: parada no fornecimento (ruptura de estoque).',
        status: 'Ruptura de estoque',
      };
      continue;
    }

    if (ym.year === 2026 && ym.month === 5) {
      out[key] = {
        mes: formatMesPt(mes),
        tag: 'partial',
        excluirDoModelo: true,
        nota: 'Mai/2026: retorno gradual e racionamento — mês parcial.',
        status: 'Parcial',
      };
    }
  }

  return out;
}

export function resolveMonthFromMethodology(
  mes: string,
  overrides: Record<string, MethodologyMonthOverride>,
  existingObs?: string,
  explicit?: MonthStatus,
): { status: MonthStatus; observacao: string; excluirDoModelo: boolean; tag: MethodologyTag } {
  const key = monthKey(mes);
  const o = overrides[key];
  if (o) {
    const status = o.status ?? tagToStatus(o.tag);
    return {
      status,
      observacao: existingObs?.trim() || o.nota || tagDefaultNota(o.tag),
      excluirDoModelo: o.excluirDoModelo,
      tag: o.tag,
    };
  }
  if (explicit) {
    return {
      status: explicit,
      observacao: existingObs?.trim() ?? '',
      excluirDoModelo: explicit !== 'Completo',
      tag: explicit === 'Completo' ? 'valid' : 'custom',
    };
  }
  const ym = getYearMonth(mes);
  if (ym?.year === 2026 && ym.month === 4) {
    return {
      status: 'Ruptura de estoque',
      observacao: existingObs?.trim() || 'Abr/2026: ruptura de estoque.',
      excluirDoModelo: true,
      tag: 'rupture',
    };
  }
  if (ym?.year === 2026 && ym.month === 5) {
    return {
      status: 'Parcial',
      observacao: existingObs?.trim() || 'Mai/2026: parcial.',
      excluirDoModelo: true,
      tag: 'partial',
    };
  }
  return {
    status: 'Completo',
    observacao: existingObs?.trim() ?? '',
    excluirDoModelo: false,
    tag: 'valid',
  };
}

export function applyMethodologyToRawRows(
  rows: RawMonthRow[],
  settings: MethodologySettings,
): RawMonthRow[] {
  const months = rows.map((r) => r.mes);
  const overrides = buildDefaultOverrides(settings, months);
  return rows.map((r) => {
    const resolved = resolveMonthFromMethodology(
      r.mes,
      overrides,
      r.observacao,
      r.status,
    );
    return {
      ...r,
      mes: formatMesPt(r.mes),
      status: resolved.status,
      observacao: resolved.observacao,
    };
  });
}

export function listMethodologyTable(
  rows: RawMonthRow[],
  settings: MethodologySettings,
): MethodologyMonthOverride[] {
  const months = rows.map((r) => r.mes);
  const overrides = buildDefaultOverrides(settings, months);
  return Object.values(overrides).sort(
    (a, b) => parseMonthKey(a.mes) - parseMonthKey(b.mes),
  );
}
