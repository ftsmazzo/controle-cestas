import { aggregateHistoryByMonth } from './processAnalysis.js';
import { forecastNextMonth } from './forecastPlan.js';
import { resolveJanelaAnaliseMeses } from './methodologyCalendar.js';
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
  consumoMensalEstimado: number;
  consumoFonte: 'previsao' | 'historico' | 'meta' | 'ritmo';
  saldoAtual: number | null;
  autonomiaMeses: number | null;
  autonomiaSemanas: number | null;
  gapMesesParaIdeal: number | null;
  nivelEstoque: SaudeNivel;
  /** 0–100: combina estoque + ritmo da proposta do mês */
  indiceSaudeGeral: number;
  propostaMensal: number;
  pctPropostaMes: number;
  pctRitmoAcumulado: number;
  semanasRestantes: number;
  faltaNoMes: number;
  envioIdealPorSemana: number;
  ajusteSemanalCestas: number;
  ritmoSemanalAtual: number;
  saldoAlvoMesesIdeais: number | null;
  deficitSaldoParaIdeal: number | null;
  acoesSemana: string[];
  resumoDecisao: string;
}

function nivelFromMeses(meses: number | null): SaudeNivel {
  if (meses == null) return 'amarelo';
  if (meses >= MESES_SAUDE_IDEAIS) return 'verde';
  if (meses >= 2) return 'amarelo';
  return 'vermelho';
}

export type MonitorResumoSaude = Pick<
  MonitoramentoResumoShape,
  | 'semanaAtual'
  | 'semanasNoMes'
  | 'semanasNoPeriodoControle'
  | 'metaMesTotal'
  | 'enviadoMesTotal'
  | 'enviadoAcumulado'
  | 'pctMes'
  | 'pctRitmoGeral'
  | 'saldoAtual'
  | 'autonomiaSemanasSaldo'
  | 'equipamentos'
>;

interface MonitoramentoResumoShape {
  semanaAtual: number;
  semanasNoMes: number;
  semanasNoPeriodoControle: number;
  metaMesTotal: number;
  enviadoMesTotal: number;
  enviadoAcumulado: number;
  pctMes: number;
  pctRitmoGeral: number;
  saldoAtual: number | null;
  autonomiaSemanasSaldo: number | null;
  equipamentos: { status: string }[];
}

function estimateConsumoMensal(
  payload: ServicesPayload,
  resumo: MonitorResumoSaude,
  dashboard?: DashboardState | null,
): { valor: number; fonte: SaudeDistribuicao['consumoFonte'] } {
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

  if (resumo.metaMesTotal > 0) {
    return { valor: resumo.metaMesTotal, fonte: 'meta' };
  }

  const ritmoMes =
    resumo.enviadoAcumulado > 0 && resumo.semanasNoPeriodoControle > 0
      ? (resumo.enviadoAcumulado / resumo.semanasNoPeriodoControle) *
        resumo.semanasNoMes
      : TOTAL_MENSAL_EMERGENCIAL_PADRAO;
  return { valor: Math.round(ritmoMes), fonte: 'ritmo' };
}

export function buildSaudeDistribuicao(
  payload: ServicesPayload,
  resumo: MonitorResumoSaude,
  dashboard?: DashboardState | null,
  mesesIdeais: number = MESES_SAUDE_IDEAIS,
): SaudeDistribuicao {
  const { valor: consumoMensalEstimado, fonte: consumoFonte } =
    estimateConsumoMensal(payload, resumo, dashboard);

  const saldo = resumo.saldoAtual;
  const autonomiaMeses =
    saldo != null && consumoMensalEstimado > 0
      ? saldo / consumoMensalEstimado
      : null;
  const autonomiaSemanas =
    autonomiaMeses != null ? autonomiaMeses * (resumo.semanasNoMes || 4) : resumo.autonomiaSemanasSaldo;

  const gapMesesParaIdeal =
    autonomiaMeses != null ? Math.max(0, mesesIdeais - autonomiaMeses) : null;

  const nivelEstoque = nivelFromMeses(autonomiaMeses);

  const semanasRestantes = Math.max(0, resumo.semanasNoMes - resumo.semanaAtual);
  const semanasComAtual = Math.max(1, semanasRestantes + 1);
  const faltaNoMes = Math.max(0, resumo.metaMesTotal - resumo.enviadoMesTotal);
  const envioIdealPorSemana = Math.ceil(faltaNoMes / semanasComAtual);
  const ritmoSemanalAtual =
    resumo.semanasNoPeriodoControle > 0
      ? resumo.enviadoAcumulado / resumo.semanasNoPeriodoControle
      : resumo.metaMesTotal / resumo.semanasNoMes;
  const ajusteSemanalCestas = Math.round(envioIdealPorSemana - ritmoSemanalAtual);

  const saldoAlvoMesesIdeais =
    consumoMensalEstimado > 0 ? consumoMensalEstimado * mesesIdeais : null;
  const deficitSaldoParaIdeal =
    saldo != null && saldoAlvoMesesIdeais != null
      ? Math.max(0, saldoAlvoMesesIdeais - saldo)
      : null;

  const pctEstoque =
    autonomiaMeses != null
      ? Math.min(100, (autonomiaMeses / mesesIdeais) * 100)
      : 40;
  const pctRitmo = Math.min(100, resumo.pctRitmoGeral);
  const pctProposta = Math.min(100, resumo.pctMes);
  const indiceSaudeGeral = Math.round(
    pctEstoque * 0.55 + pctRitmo * 0.25 + pctProposta * 0.2,
  );

  const acoesSemana: string[] = [];

  if (saldo == null) {
    acoesSemana.push('Informar o saldo atual no Banco.');
  } else if (gapMesesParaIdeal != null && gapMesesParaIdeal > 0) {
    acoesSemana.push(
      `Repor ou preservar estoque: faltam ~${Math.round(gapMesesParaIdeal * 10) / 10} mês(es) para atingir ${mesesIdeais} meses de saúde (${num(consumoMensalEstimado)}/mês de tendência).`,
    );
    if (deficitSaldoParaIdeal != null && deficitSaldoParaIdeal > 0) {
      acoesSemana.push(
        `Saldo ideal (${mesesIdeais} meses): ~${deficitSaldoParaIdeal.toLocaleString('pt-BR')} cestas acima do saldo atual.`,
      );
    }
  }

  if (resumo.pctRitmoGeral < 90 && resumo.metaMesTotal > 0) {
    if (ajusteSemanalCestas > 0) {
      acoesSemana.push(
        `Nesta semana e nas ${semanasRestantes} restante(s): enviar ~${envioIdealPorSemana.toLocaleString('pt-BR')} cestas/semana no total (≈ +${ajusteSemanalCestas.toLocaleString('pt-BR')} vs ritmo atual) para fechar ${resumo.metaMesTotal} no mês.`,
      );
    } else if (ajusteSemanalCestas < -50) {
      acoesSemana.push(
        `Ritmo acima do necessário: pode reduzir ~${Math.abs(ajusteSemanalCestas).toLocaleString('pt-BR')} cestas/semana e ainda bater a meta — cuide o saldo.`,
      );
    }
  } else if (faltaNoMes === 0) {
    acoesSemana.push('Meta do mês cumprida no volume — mantenha o saldo e a regularidade semanal.');
  }

  const atrasados = resumo.equipamentos.filter((e) => e.status === 'critico').length;
  if (atrasados > 0) {
    acoesSemana.push(
      `Priorizar ${atrasados} unidade(s) em vermelho na grade (abaixo do ritmo proporcional).`,
    );
  }

  if (!acoesSemana.length) {
    acoesSemana.push('Distribuição e estoque dentro do esperado — manter cadência semanal.');
  }

  let resumoDecisao: string;
  if (autonomiaMeses != null && autonomiaMeses >= mesesIdeais && resumo.pctRitmoGeral >= 90) {
    resumoDecisao = `Saúde estável: ~${autonomiaMeses.toFixed(1)} meses de estoque e ritmo alinhado à proposta de ${resumo.metaMesTotal} cestas.`;
  } else if (autonomiaMeses != null && autonomiaMeses < 2) {
    resumoDecisao = `Atenção: autonomia ~${autonomiaMeses.toFixed(1)} mês(es) (meta ${mesesIdeais}). Ajuste envio semanal e reposição.`;
  } else {
    resumoDecisao = `Autonomia ~${autonomiaMeses?.toFixed(1) ?? '—'} mês(es) · proposta ${resumo.pctMes.toFixed(0)}% · ritmo ${resumo.pctRitmoGeral.toFixed(0)}% até hoje.`;
  }

  return {
    mesesIdeais,
    consumoMensalEstimado,
    consumoFonte,
    saldoAtual: saldo,
    autonomiaMeses,
    autonomiaSemanas,
    gapMesesParaIdeal,
    nivelEstoque,
    indiceSaudeGeral,
    propostaMensal: resumo.metaMesTotal,
    pctPropostaMes: resumo.pctMes,
    pctRitmoAcumulado: resumo.pctRitmoGeral,
    semanasRestantes,
    faltaNoMes,
    envioIdealPorSemana,
    ajusteSemanalCestas,
    ritmoSemanalAtual: Math.round(ritmoSemanalAtual),
    saldoAlvoMesesIdeais,
    deficitSaldoParaIdeal,
    acoesSemana,
    resumoDecisao,
  };
}

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
