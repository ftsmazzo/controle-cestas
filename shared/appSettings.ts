import {
  defaultMethodologySettings,
  mergeMethodologySettings,
  type MethodologySettings,
} from './methodologyCalendar.js';

/** Configuração global — saldo único, metodologia, parâmetros de contrato */
export interface AppSettings {
  saldoEstoque: number | null;
  contratoMensal: number;
  contratoAnual: number;
  methodology: MethodologySettings;
  /** Sobrescrita manual da cota semanal por equipamento (id → cestas/sem) */
  cotasSemanaisOverrides?: Record<string, number>;
  admin?: {
    /** Exibe item Legado no menu admin */
    menuLegadoVisivel?: boolean;
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    saldoEstoque: null,
    contratoMensal: 1200,
    contratoAnual: 14400,
    methodology: defaultMethodologySettings(),
    cotasSemanaisOverrides: {},
    admin: { menuLegadoVisivel: false },
  };
}

export function mergeAppSettings(
  partial?: Partial<AppSettings> | null,
  existing?: AppSettings | null,
): AppSettings {
  const base = existing ? { ...existing } : defaultAppSettings();
  if (!partial) return { ...base };
  return {
    saldoEstoque:
      partial.saldoEstoque !== undefined
        ? partial.saldoEstoque
        : base.saldoEstoque,
    contratoMensal: partial.contratoMensal ?? base.contratoMensal,
    contratoAnual: partial.contratoAnual ?? base.contratoAnual,
    methodology: mergeMethodologySettings(
      base.methodology,
      partial.methodology ?? undefined,
    ),
    cotasSemanaisOverrides:
      partial.cotasSemanaisOverrides !== undefined
        ? partial.cotasSemanaisOverrides
        : base.cotasSemanaisOverrides,
    admin: partial.admin !== undefined ? { ...base.admin, ...partial.admin } : base.admin,
  };
}
