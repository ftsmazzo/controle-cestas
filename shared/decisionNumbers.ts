import {
  historyForMonthKeys,
  pickWindowKeys,
  monthKeysToLabels,
} from './analysisWindow.js';
import { computeServiceStats } from './allocation.js';
import { computeInsights } from './insights.js';
import {
  buildVolumeCenario,
  mediaCenariosPontos,
  type VolumeCenario,
} from './forecastCenarios.js';
import {
  computeForecastUntilYearEnd,
  forecastNextMonth,
} from './forecastPlan.js';
import { parseMonthKey } from './monthUtils.js';
import type { Kpis, ProcessedMonthRow } from './types.js';
import type { ServiceDef, ServiceMonthRecord } from './serviceTypes.js';

/** Indicadores canônicos — uma única definição para todas as telas. */
export interface DecisionNumbers {
  /** Média aritmética de todos os meses válidos no modelo */
  mediaLimpaHistorica: number;
  /** Média Abr/25 – Mar/26 (base da previsão / nota técnica) */
  mediaNotaPeriodo: number;
  /** Média dos últimos N meses válidos (janela admin); null = igual à limpa */
  mediaJanela: number | null;
  mesesMediaLimpa: number;
  mesesJanelaLista: string[];
  janelaMeses: number | null;
  /** Volume de referência — próximo mês de planejamento */
  previsaoProximoMes: number | null;
  /** Média dos volumes de referência (jun–dez) */
  mediaPrevisaoJunDez: number | null;
  /** Faixas de volume: menor, referência, maior e planejamento médio */
  cenariosProximoMes: VolumeCenario | null;
  cenariosMediaJunDez: VolumeCenario | null;
  mesesPrevisaoJunDez: string[];
  /** Média dos 3 meses válidos imediatamente antes de Abr/2026 */
  referenciaPreRuptura: number | null;
  /**
   * Soma das médias por equipamento na janela — só para distribuir cestas.
   * NÃO é previsão nem meta de entrega mensal.
   */
  somaMediasEquipamentos: number;
  mesesSomaMediasEquip: string[];
  ultimoMesValido: string | null;
}

function mediaPrevisaoJunDezAno(
  pontos: { mes: string; valor: number; tipo?: string }[],
  ano: number,
): { media: number | null; meses: string[] } {
  const filtrados = pontos.filter((p) => {
    if (p.tipo && p.tipo !== 'projecao') return false;
    const k = parseMonthKey(p.mes);
    const y = Math.floor(k / 100);
    const m = k % 100;
    return y === ano && m >= 6 && m <= 12;
  });
  if (!filtrados.length) return { media: null, meses: [] };
  const media =
    filtrados.reduce((s, p) => s + p.valor, 0) / filtrados.length;
  return {
    media: Math.round(media),
    meses: filtrados.map((p) => p.mes),
  };
}

export function computeDecisionNumbers(
  rows: ProcessedMonthRow[],
  janelaMeses: number | null,
  history: ServiceMonthRecord[],
  services: ServiceDef[],
  kpis: Kpis,
  projecao1: number | null,
): DecisionNumbers {
  const validos = rows.filter((r) => r.usoNoModelo === 'Sim');
  const mediaLimpa =
    validos.length > 0
      ? validos.reduce((s, r) => s + r.total, 0) / validos.length
      : 0;

  const janelaRows =
    janelaMeses != null && janelaMeses > 0
      ? validos.slice(-janelaMeses)
      : validos;
  const mediaJanela =
    janelaRows.length > 0
      ? janelaRows.reduce((s, r) => s + r.total, 0) / janelaRows.length
      : null;

  const notaRows = rows.filter(
    (r) => r.usoNoModelo === 'Sim' && parseMonthKey(r.mes) >= 202504,
  );
  const mediaNotaPeriodo =
    notaRows.length > 0
      ? Math.round(
          notaRows.reduce((s, r) => s + r.total, 0) / notaRows.length,
        )
      : 0;

  const desvio = kpis.desvioPadrao ?? 0;
  const { valor: previsaoProximoMes } = forecastNextMonth(rows, janelaMeses);
  const { pontos } = computeForecastUntilYearEnd(rows, {
    windowMonths: janelaMeses,
  });
  const refProximo = previsaoProximoMes ?? projecao1;
  const cenariosProximoMes =
    refProximo != null ? buildVolumeCenario(refProximo, desvio) : null;

  const lastValidKey =
    validos.length > 0
      ? Math.max(...validos.map((r) => parseMonthKey(r.mes)))
      : 0;
  const anoPrevisao =
    lastValidKey > 0 ? Math.floor(lastValidKey / 100) : new Date().getFullYear();
  const { media: mediaPrevisaoJunDez, meses: mesesPrevisaoJunDez } =
    mediaPrevisaoJunDezAno(pontos, anoPrevisao);
  const cenariosMediaJunDez = mediaCenariosPontos(pontos, anoPrevisao);

  const ins = computeInsights(rows, kpis, projecao1);

  const validKeys = validos.map((r) => parseMonthKey(r.mes)).filter((k) => k > 0);
  const picked = pickWindowKeys(validKeys, janelaMeses);
  const histJanela = historyForMonthKeys(history, picked);
  const stats = computeServiceStats(
    histJanela,
    services.map((s) => s.id),
  );
  const somaMediasEquipamentos = stats.reduce(
    (s, x) => s + x.mediaHistorica,
    0,
  );

  const ultimo = validos.reduce(
    (a, b) => (parseMonthKey(a.mes) >= parseMonthKey(b.mes) ? a : b),
    validos[0],
  );

  return {
    mediaLimpaHistorica: Math.round(mediaLimpa),
    mediaNotaPeriodo,
    mediaJanela:
      mediaJanela != null ? Math.round(mediaJanela) : null,
    mesesMediaLimpa: validos.length,
    mesesJanelaLista: janelaRows.map((r) => r.mes),
    janelaMeses,
    previsaoProximoMes: refProximo,
    mediaPrevisaoJunDez,
    mesesPrevisaoJunDez,
    cenariosProximoMes,
    cenariosMediaJunDez,
    referenciaPreRuptura: ins.demandaReferenciaPreRuptura,
    somaMediasEquipamentos,
    mesesSomaMediasEquip: monthKeysToLabels(picked),
    ultimoMesValido: ultimo?.mes ?? null,
  };
}

export const DECISION_NUMBERS_LEGEND = {
  mediaLimpa:
    'Média de todos os meses que entram no modelo (exclui COVID/2023/Abr-Mai/2026).',
  mediaJanela: 'Média só dos últimos N meses válidos (parâmetro em Metodologia).',
  previsaoProximoMes:
    'Volume de referência (estimativa central) para o próximo mês de cessão.',
  mediaPrevisaoJunDez:
    'Média dos volumes de referência de jun a dez — compare com o contrato de 1.200/mês.',
  cenarios:
    'Três faixas em torno da referência (± desvio padrão) e o planejamento médio (média das três).',
  referenciaPreRuptura:
    'Média dos 3 meses válidos antes da ruptura Abr/2026 (referência operacional).',
  somaMediasEquipamentos:
    'Se cada equipamento recebesse sua média na janela, este seria o total. Só referência na divisão — não é previsão.',
} as const;
