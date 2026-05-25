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
    contratoMensal: 1500,
    contratoAnual: 18000,
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
      overrides: {
        ...base.methodology.overrides,
        ...partial.methodology?.overrides,
      },
    },
  };
}
