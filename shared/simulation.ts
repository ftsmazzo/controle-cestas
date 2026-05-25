import type { ContractScenario, DashboardState } from './types.js';

export type ScenarioRisk = 'baixo' | 'moderado' | 'alto' | 'critico';

export interface ContractScenarioResult extends ContractScenario {
  risco: ScenarioRisk;
  cobre12Meses: boolean;
  /** Positivo = folga além de 12 meses; negativo = meses que faltam para completar 12 */
  margemMeses: number;
  label?: string;
}

export function evaluateContractScenario(
  totalContrato: number,
  consumoMensal: number,
  label?: string,
): ContractScenarioResult | null {
  if (!Number.isFinite(totalContrato) || totalContrato <= 0) return null;
  if (!Number.isFinite(consumoMensal) || consumoMensal <= 0) return null;

  const duracaoMeses = totalContrato / consumoMensal;
  const margemMeses = duracaoMeses - 12;
  const cobre12Meses = duracaoMeses >= 12;

  let risco: ScenarioRisk;
  let leitura: string;

  if (cobre12Meses) {
    if (consumoMensal <= 1200) {
      risco = 'baixo';
      leitura = `Cobre ${duracaoMeses.toFixed(1)} meses — no ritmo de até 1.200/mês.`;
    } else {
      risco = 'moderado';
      leitura = `Cobre ${duracaoMeses.toFixed(1)} meses, acima de 1.200/mês — folga de ${margemMeses.toFixed(1)} mês(es).`;
    }
  } else if (duracaoMeses >= 10) {
    risco = 'moderado';
    leitura = `Risco moderado: estoque acaba em ~${duracaoMeses.toFixed(1)} meses (${Math.abs(margemMeses).toFixed(1)} mês(es) antes de 12).`;
  } else if (duracaoMeses >= 9) {
    risco = 'alto';
    leitura = 'Risco alto: contrato insuficiente para 12 meses neste ritmo.';
  } else {
    risco = 'critico';
    leitura = 'Risco crítico de insuficiência contratual.';
  }

  return {
    consumoMensal,
    duracaoMeses,
    leitura,
    risco,
    cobre12Meses,
    margemMeses,
    label,
  };
}

export function contractScenarios(
  totalContrato = 14400,
  contratoMensalRef = 1200,
): ContractScenario[] {
  const ref = contratoMensalRef;
  return [ref, ref + 200, ref + 400, ref + 600]
    .map((c) => evaluateContractScenario(totalContrato, c))
    .filter((s): s is ContractScenarioResult => s !== null);
}

export interface ScenarioPreset {
  id: string;
  label: string;
  consumoMensal: number;
}

export function presetsFromDashboard(d: DashboardState): ScenarioPreset[] {
  const items: ScenarioPreset[] = [];
  const add = (id: string, label: string, value: number | null) => {
    if (value != null && value > 0) {
      items.push({ id, label, consumoMensal: Math.round(value) });
    }
  };

  add('planejado', 'Contrato (1.200)', 1200);
  const prevFuturos = (d.previsaoAteFimAno ?? []).filter((p) => p.tipo === 'projecao');
  if (prevFuturos[0]) add('previsao', 'Previsão próximo mês', prevFuturos[0].valor);
  if (prevFuturos.length > 0) {
    const mediaPrev =
      prevFuturos.reduce((s, p) => s + p.valor, 0) / prevFuturos.length;
    add('mediaPrevisao', 'Média previsão futura', mediaPrev);
  }
  const proj = d.tendenciaProximos[0];
  if (proj && !prevFuturos[0]) add('forecast', 'Projeção +1', proj.valor);
  add('media', 'Média histórica (ref.)', d.kpis.mediaMensalValida);
  add('pico', 'Pico histórico', d.kpis.picoConsumo);
  add('mm3', 'Média móvel 3m', d.mediaMovelUltimos3);

  return items;
}

export function evaluatePresets(
  totalContrato: number,
  presets: ScenarioPreset[],
): ContractScenarioResult[] {
  return presets
    .map((p) => evaluateContractScenario(totalContrato, p.consumoMensal, p.label))
    .filter((s): s is ContractScenarioResult => s !== null);
}
