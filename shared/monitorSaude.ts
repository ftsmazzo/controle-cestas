import { aggregateHistoryByMonth } from './processAnalysis.js';
import { buildEmpenhoControle, type EmpenhoControleResumo } from './empenhoControle.js';
import { forecastNextMonth } from './forecastPlan.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
import {
  estouroAcimaLimite,
  margemAteLimite,
  nivelPorUsoLimite,
  scoreDentroDoLimite,
} from './limitesControle.js';
import {
  processedRowsFromPayload,
  validMonthKeysForPayload,
} from './payloadAnalysis.js';
import { parseMonthKey } from './monthUtils.js';
import { TOTAL_MENSAL_EMERGENCIAL_PADRAO } from './requisicaoHistorico.js';
import type { ServicesPayload } from './serviceTypes.js';
import type { DashboardState } from './types.js';

export const MESES_SAUDE_IDEAIS = 4;

export type SaudeNivel = 'verde' | 'amarelo' | 'vermelho';

export interface SaudeDistribuicao {
  mesesIdeais: number;
  limiteMensal: number;
  limiteSemanal: number;
  consumoReferenciaRateio: number;
  consumoFonteRateio: 'previsao' | 'historico' | 'meta' | 'ritmo';
  saldoAtual: number | null;
  autonomiaMeses: number | null;
  autonomiaSemanas: number | null;
  gapMesesParaIdeal: number | null;
  nivelEstoque: SaudeNivel;
  nivelLimiteMes: SaudeNivel;
  nivelLimiteSemana: SaudeNivel;
  indiceSaudeGeral: number;
  pctUsoLimiteMes: number;
  pctUsoLimiteSemana: number;
  estouroMes: number;
  estouroSemana: number;
  margemMes: number;
  margemSemana: number;
  enviadoMes: number;
  enviadoSemana: number;
  projecaoMesTotal: number;
  pctProjecaoMes: number;
  estouroProjetadoMes: number;
  ritmoSemanalConsumo: number;
  semanasRestantesNoMes: number;
  semanaProjetadaEstouro: number | null;
  autonomiaSemanasSaldo: number | null;
  autonomiaDiasSaldo: number | null;
  empenho: EmpenhoControleResumo;
  acoesSemana: string[];
  resumoDecisao: string;
}

function nivelLimiteParaSaude(pctUso: number): SaudeNivel {
  const n = nivelPorUsoLimite(pctUso);
  if (n === 'ok') return 'verde';
  if (n === 'atencao') return 'amarelo';
  return 'vermelho';
}

function nivelFromMeses(meses: number | null): SaudeNivel {
  if (meses == null) return 'amarelo';
  if (meses >= MESES_SAUDE_IDEAIS) return 'verde';
  if (meses >= 2) return 'amarelo';
  return 'vermelho';
}

export type MonitorResumoSaude = Pick<
  MonitoramentoResumoShape,
  | 'mes'
  | 'semanaAtual'
  | 'semanasNoMes'
  | 'semanasNoPeriodoControle'
  | 'semanaInicioControle'
  | 'metaMesTotal'
  | 'limiteSemanal'
  | 'enviadoMesTotal'
  | 'enviadoSemanaAtual'
  | 'pctMes'
  | 'pctLimiteSemana'
  | 'estouroMes'
  | 'estouroSemana'
  | 'margemMes'
  | 'margemSemana'
  | 'projecaoMesTotal'
  | 'pctProjecaoMes'
  | 'estouroProjetadoMes'
  | 'ritmoSemanalMedio'
  | 'semanasRestantesNoMes'
  | 'semanaProjetadaEstouro'
  | 'autonomiaDiasSaldo'
  | 'saldoAtual'
  | 'autonomiaSemanasSaldo'
  | 'equipamentos'
>;

interface MonitoramentoResumoShape {
  mes: string;
  semanaAtual: number;
  semanasNoMes: number;
  semanasNoPeriodoControle: number;
  semanaInicioControle: number;
  metaMesTotal: number;
  limiteSemanal: number;
  enviadoMesTotal: number;
  enviadoSemanaAtual: number;
  pctMes: number;
  pctLimiteSemana: number;
  estouroMes: number;
  estouroSemana: number;
  margemMes: number;
  margemSemana: number;
  projecaoMesTotal: number;
  pctProjecaoMes: number;
  estouroProjetadoMes: number;
  ritmoSemanalMedio: number;
  semanasRestantesNoMes: number;
  semanaProjetadaEstouro: number | null;
  autonomiaDiasSaldo: number | null;
  saldoAtual: number | null;
  autonomiaSemanasSaldo: number | null;
  equipamentos: {
    status: string;
    pctMes: number;
    pctSemana: number;
    pctProjecaoMes: number;
    alertaEquip: string | null;
  }[];
}

function estimateConsumoReferenciaRateio(
  payload: ServicesPayload,
  limiteMensal: number,
  dashboard?: DashboardState | null,
): { valor: number; fonte: SaudeDistribuicao['consumoFonteRateio'] } {
  const janela = resolveJanelaAnaliseMeses(payload.settings?.methodology);

  if (dashboard?.rows?.length) {
    const f = forecastNextMonth(dashboard.rows, janela);
    if (f.valor != null && f.valor > 0) {
      return { valor: Math.round(f.valor), fonte: 'previsao' };
    }
  }

  const processed = processedRowsFromPayload(payload);
  const validRows = processed.filter((r) => r.usoNoModelo === 'Sim');
  if (validRows.length >= 2) {
    const f = forecastNextMonth(validRows, janela);
    if (f.valor != null && f.valor > 0) {
      return { valor: Math.round(f.valor), fonte: 'previsao' };
    }
  }

  const agg = aggregateHistoryByMonth(payload.history);
  const keys = validMonthKeysForPayload(payload);
  const filtered = agg.filter((r) => keys.includes(parseMonthKey(r.mes)));
  const vals = (filtered.length ? filtered : agg)
    .slice(-3)
    .map((r) => r.total)
    .filter((t) => t > 0);
  if (vals.length) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return { valor: Math.round(avg), fonte: 'historico' };
  }

  if (limiteMensal > 0) {
    return { valor: limiteMensal, fonte: 'meta' };
  }

  return { valor: TOTAL_MENSAL_EMERGENCIAL_PADRAO, fonte: 'ritmo' };
}

export function buildSaudeDistribuicao(
  payload: ServicesPayload,
  resumo: MonitorResumoSaude,
  dashboard?: DashboardState | null,
  mesesIdeais: number = MESES_SAUDE_IDEAIS,
): SaudeDistribuicao {
  const limiteMensal =
    resumo.metaMesTotal > 0 ? resumo.metaMesTotal : TOTAL_MENSAL_EMERGENCIAL_PADRAO;
  const limiteSemanal =
    resumo.limiteSemanal > 0
      ? resumo.limiteSemanal
      : Math.round(limiteMensal / Math.max(1, resumo.semanasNoMes));

  const { valor: consumoReferenciaRateio, fonte: consumoFonteRateio } =
    estimateConsumoReferenciaRateio(payload, limiteMensal, dashboard);

  const empenho = buildEmpenhoControle(payload);

  const saldo = resumo.saldoAtual;
  const autonomiaMeses =
    saldo != null && limiteMensal > 0 ? saldo / limiteMensal : null;
  const autonomiaSemanasSaldo = resumo.autonomiaSemanasSaldo;
  const autonomiaDiasSaldo = resumo.autonomiaDiasSaldo;
  const autonomiaSemanas =
    autonomiaSemanasSaldo ??
    (autonomiaMeses != null
      ? autonomiaMeses * (resumo.semanasNoMes || 4)
      : null);

  const gapMesesParaIdeal =
    autonomiaMeses != null ? Math.max(0, mesesIdeais - autonomiaMeses) : null;

  const nivelEstoque = nivelFromMeses(autonomiaMeses);
  const pctUsoLimiteMes = resumo.pctMes;
  const pctUsoLimiteSemana = resumo.pctLimiteSemana;
  const nivelLimiteMes = nivelLimiteParaSaude(pctUsoLimiteMes);
  const nivelLimiteSemana = nivelLimiteParaSaude(pctUsoLimiteSemana);

  const estouroMes = resumo.estouroMes;
  const estouroSemana = resumo.estouroSemana;
  const margemMes = resumo.margemMes;
  const margemSemana = resumo.margemSemana;

  const pctEstoque =
    autonomiaMeses != null
      ? Math.min(100, (autonomiaMeses / mesesIdeais) * 100)
      : 40;
  const scoreMes = scoreDentroDoLimite(pctUsoLimiteMes);
  const scoreSemana = scoreDentroDoLimite(pctUsoLimiteSemana);
  const mesEmpenho = empenho.meses.find(
    (m) => parseMonthKey(m.mes) === parseMonthKey(resumo.mes),
  );
  const pctEmpenhoMes =
    mesEmpenho && mesEmpenho.metaMensal > 0
      ? (mesEmpenho.enviado / mesEmpenho.metaMensal) * 100
      : pctUsoLimiteMes;
  const scoreEmpenho = scoreDentroDoLimite(pctEmpenhoMes);

  const pctProjecaoMes = resumo.pctProjecaoMes;
  const estouroProjetadoMes = resumo.estouroProjetadoMes;
  const scoreProjecao = scoreDentroDoLimite(pctProjecaoMes);

  let indiceSaudeGeral = Math.round(
    pctEstoque * 0.35 +
      scoreMes * 0.25 +
      scoreSemana * 0.15 +
      scoreProjecao * 0.15 +
      scoreEmpenho * 0.1,
  );
  if (estouroMes > 0 || estouroSemana > 0) {
    indiceSaudeGeral = Math.min(indiceSaudeGeral, 45);
  }
  if (estouroProjetadoMes > 0 || pctProjecaoMes > 100) {
    indiceSaudeGeral = Math.min(indiceSaudeGeral, 40);
  }
  if (
    autonomiaSemanasSaldo != null &&
    autonomiaSemanasSaldo < resumo.semanasRestantesNoMes + 1
  ) {
    indiceSaudeGeral = Math.min(indiceSaudeGeral, 35);
  }
  if (empenho.restante < 0) {
    indiceSaudeGeral = Math.min(indiceSaudeGeral, 30);
  }

  const acoesSemana: string[] = [];

  if (saldo == null) {
    acoesSemana.push('Informar o saldo atual no Banco.');
  } else if (gapMesesParaIdeal != null && gapMesesParaIdeal > 0) {
    acoesSemana.push(
      `Preservar estoque: autonomia ~${num(autonomiaMeses)} mês(es) (teto ${num(limiteMensal)}/mês de saída).`,
    );
  }

  if (estouroMes > 0) {
    acoesSemana.push(
      `Crítico — estouro mensal: ${num(estouroMes)} cestas acima do teto ${num(limiteMensal)}. Não enviar além do limite até regularizar.`,
    );
  } else if (pctUsoLimiteMes > 90) {
    acoesSemana.push(
      `Atenção: ${pctUsoLimiteMes.toFixed(0)}% do teto mensal usado. Margem restante: ${num(margemMes)} cestas.`,
    );
  }

  if (
    autonomiaSemanasSaldo != null &&
    autonomiaSemanasSaldo < resumo.semanasRestantesNoMes + 1
  ) {
    acoesSemana.push(
      `Saldo não chega ao fim do mês: ~${autonomiaSemanasSaldo.toFixed(1)} semana(s) (${autonomiaDiasSaldo ?? '—'} dias) ao ritmo ${num(resumo.ritmoSemanalMedio)}/sem — faltam ${resumo.semanasRestantesNoMes} semana(s).`,
    );
  }

  if (estouroProjetadoMes > 0 && estouroMes === 0) {
    acoesSemana.push(
      `Projeção estoura o teto antes do fim do mês (+${num(estouroProjetadoMes)} cestas)${resumo.semanaProjetadaEstouro != null ? ` — previsto na S${resumo.semanaProjetadaEstouro}` : ''}. Cortar já na próxima semana.`,
    );
  }

  if (estouroSemana > 0) {
    acoesSemana.push(
      `Crítico — semana ${resumo.semanaAtual}: ${num(estouroSemana)} acima do teto ~${num(limiteSemanal)} (${pctUsoLimiteSemana.toFixed(0)}%).`,
    );
  } else if (pctUsoLimiteSemana > 90) {
    acoesSemana.push(
      `Semana ${resumo.semanaAtual} perto do teto: margem ${num(margemSemana)} de ~${num(limiteSemanal)}.`,
    );
  }

  if (empenho.restante < 0) {
    acoesSemana.push(
      `Empenho ${num(empenho.totalEmpenho)} estourado em ${num(Math.abs(empenho.restante))} cestas — revise meses anteriores.`,
    );
  } else if (mesEmpenho && mesEmpenho.saldoMes < 0) {
    acoesSemana.push(
      `${resumo.mes}: ${num(Math.abs(mesEmpenho.saldoMes))} acima do limite mensal do empenho.`,
    );
  } else if (empenho.restante > 0 && empenho.proximoMes) {
    acoesSemana.push(
      `Empenho: ${num(empenho.restante)} restantes em ${empenho.mesesRestantes} mês(es). Teto sugerido ${empenho.proximoMes}: ~${num(empenho.sugestaoProximoMes)}.`,
    );
  }

  const acima = resumo.equipamentos.filter((e) => e.status === 'critico');
  if (acima.length) {
    acoesSemana.push(
      `${acima.length} unidade(s) acima do teto — ver coluna projeção na grade.`,
    );
  }

  const verdesPerigosos = resumo.equipamentos.filter(
    (e) => e.pctMes <= 100 && e.pctSemana <= 95 && e.pctProjecaoMes > 95,
  );
  if (verdesPerigosos.length) {
    acoesSemana.push(
      `${verdesPerigosos.length} unidade(s) com semana ok mas projeção de mês alta — não repetir o volume da S${resumo.semanaAtual}.`,
    );
  }

  if (!acoesSemana.length) {
    acoesSemana.push(
      `Dentro dos limites: ${pctUsoLimiteMes.toFixed(0)}% do mês · ${pctUsoLimiteSemana.toFixed(0)}% da semana ${resumo.semanaAtual}.`,
    );
  }

  let resumoDecisao: string;
  if (estouroMes > 0 || estouroSemana > 0) {
    resumoDecisao = `Fora do controle: estouro ${estouroMes > 0 ? `mensal +${num(estouroMes)}` : ''}${estouroMes > 0 && estouroSemana > 0 ? ' · ' : ''}${estouroSemana > 0 ? `semanal +${num(estouroSemana)}` : ''} (teto ${num(limiteMensal)}/mês).`;
  } else if (
    autonomiaSemanasSaldo != null &&
    autonomiaSemanasSaldo < resumo.semanasRestantesNoMes + 1
  ) {
    resumoDecisao = `Saldo acaba em ~${autonomiaSemanasSaldo.toFixed(1)} semana(s) (${autonomiaDiasSaldo ?? '—'} dias) ao ritmo ${num(resumo.ritmoSemanalMedio)}/sem — faltam ${resumo.semanasRestantesNoMes} semana(s) no mês. Reajuste já na próxima semana.`;
  } else if (estouroProjetadoMes > 0) {
    resumoDecisao = `Dentro do teto hoje (${pctUsoLimiteMes.toFixed(0)}%), mas projeção ${pctProjecaoMes.toFixed(0)}% (+${num(estouroProjetadoMes)} cestas)${resumo.semanaProjetadaEstouro != null ? ` — estouro previsto na S${resumo.semanaProjetadaEstouro}` : ''}. Cortar volume na próxima semana.`;
  } else if (
    nivelLimiteMes === 'verde' &&
    nivelLimiteSemana === 'verde' &&
    autonomiaMeses != null &&
    autonomiaMeses >= mesesIdeais
  ) {
    resumoDecisao = `Controle estável: ${pctUsoLimiteMes.toFixed(0)}% do teto mensal · ${pctUsoLimiteSemana.toFixed(0)}% da semana · ~${autonomiaMeses.toFixed(1)} mês(es) de estoque.`;
  } else {
    resumoDecisao = `Uso ${pctUsoLimiteMes.toFixed(0)}% do teto ${num(limiteMensal)} · S${resumo.semanaAtual} ${pctUsoLimiteSemana.toFixed(0)}% · margem ${num(margemMes)} no mês · empenho ${num(empenho.restante)} restantes.`;
  }

  return {
    mesesIdeais,
    limiteMensal,
    limiteSemanal,
    consumoReferenciaRateio,
    consumoFonteRateio,
    saldoAtual: saldo,
    autonomiaMeses,
    autonomiaSemanas,
    gapMesesParaIdeal,
    nivelEstoque,
    nivelLimiteMes,
    nivelLimiteSemana,
    indiceSaudeGeral,
    pctUsoLimiteMes,
    pctUsoLimiteSemana,
    estouroMes,
    estouroSemana,
    margemMes,
    margemSemana,
    enviadoMes: resumo.enviadoMesTotal,
    enviadoSemana: resumo.enviadoSemanaAtual,
    projecaoMesTotal: resumo.projecaoMesTotal,
    pctProjecaoMes,
    estouroProjetadoMes,
    ritmoSemanalConsumo: resumo.ritmoSemanalMedio,
    semanasRestantesNoMes: resumo.semanasRestantesNoMes,
    semanaProjetadaEstouro: resumo.semanaProjetadaEstouro,
    autonomiaSemanasSaldo,
    autonomiaDiasSaldo,
    empenho,
    acoesSemana,
    resumoDecisao,
  };
}

function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
