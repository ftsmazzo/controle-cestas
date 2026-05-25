import {
  defaultMethodologySettings,
  type MethodologySettings,
} from './methodologyCalendar.js';

/** Configuração global — saldo único, metodologia, parâmetros de contrato */
export interface AppSettings {
  saldoEstoque: number | null;
  contratoMensal: number;
  contratoAnual: number;
  methodology: MethodologySettings;
}

export function defaultAppSettings(): AppSettings {
  return {
    saldoEstoque: null,
    contratoMensal: 1200,
    contratoAnual: 14400,
    methodology: defaultMethodologySettings(),
  };
}

export function mergeAppSettings(partial?: Partial<AppSettings> | null): AppSettings {
  const base = defaultAppSettings();
  if (!partial) return base;
  return {
    saldoEstoque:
      partial.saldoEstoque !== undefined
        ? partial.saldoEstoque
        : base.saldoEstoque,
    contratoMensal: partial.contratoMensal ?? base.contratoMensal,
    contratoAnual: partial.contratoAnual ?? base.contratoAnual,
    methodology: {
      ...base.methodology,
      ...partial.methodology,
      janelaAnaliseMeses:
        partial.methodology?.janelaAnaliseMeses ??
        partial.methodology?.janelaMediaMeses ??
        base.methodology.janelaAnaliseMeses,
      janelaMediaMeses:
        partial.methodology?.janelaMediaMeses ??
        partial.methodology?.janelaAnaliseMeses ??
        base.methodology.janelaMediaMeses,
      overrides: {
        ...base.methodology.overrides,
        ...partial.methodology?.overrides,
      },
    },
  };
}
