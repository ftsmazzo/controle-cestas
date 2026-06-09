import { buildEmpenhoControle } from './empenhoControle.js';
import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  SEMANAS_POR_CICLO_OPERACIONAL,
} from './monitorConstants.js';
import {
  cicloOperacionalDeIndice,
  civilPorIndiceOperacional,
  enviadoCicloOperacionalAte,
  indiceOperacionalCivil,
  tetoMaximoCicloOperacional,
} from './operationalWeeks.js';
import { projecaoFimCicloOperacional } from './projecaoOperacionalCiclo.js';
import type { ServicesPayload } from './serviceTypes.js';

/** 4 ciclos operacionais × 4 semanas */
export const SEMANAS_PROCESSO_OPERACIONAL = 16;
export const CICLOS_PROCESSO_OPERACIONAL = 4;

export interface ContagemSemanasProcesso {
  total: number;
  decorridas: number;
  restantes: number;
  indiceAtual: number | null;
}

export interface SaudeEmpenhoProcesso {
  totalEmpenho: number;
  consumido: number;
  restante: number;
  semanasTotal: number;
  semanasDecorridas: number;
  semanasRestantes: number;
  /** Média acumulada desde o ponto zero (consumido ÷ semanas decorridas) */
  ritmoAcumulado: number;
  /** Cestas/sem para fechar 5.000 em 16 semanas no ritmo restante */
  ritmoSustentavel: number;
  fechamentoProjetadoProcesso: number;
  noTrilho: boolean;
  mensagem: string;
}

export function contagemSemanasProcesso(
  mesRef: string,
  semanaRef: number,
  empenhoMeses?: string[],
): ContagemSemanasProcesso {
  const total = SEMANAS_PROCESSO_OPERACIONAL;
  const idx = indiceOperacionalCivil(mesRef, semanaRef, empenhoMeses);
  const idxIni = indiceOperacionalCivil(
    MONITOR_CONTROLE_MES_INICIO,
    MONITOR_CONTROLE_SEMANA_INICIO,
    empenhoMeses,
  );
  if (idx == null || idxIni == null) {
    return { total, decorridas: 0, restantes: total, indiceAtual: idx };
  }
  const decorridas = Math.min(total, Math.max(0, idx - idxIni + 1));
  return {
    total,
    decorridas,
    restantes: Math.max(0, total - decorridas),
    indiceAtual: idx,
  };
}

/** Empenho cumulativo — 16 semanas, 5.000 cestas (1.350 + 1.150×3), independente do ciclo semanal */
export function buildSaudeEmpenhoProcesso(
  payload: ServicesPayload,
  mesRef: string,
  semanaRef: number,
  empenhoMeses?: string[],
): SaudeEmpenhoProcesso {
  const empenho = buildEmpenhoControle(payload);
  const contagem = contagemSemanasProcesso(mesRef, semanaRef, empenhoMeses);
  const mon = payload.emergencial.monitoramento;
  const idx = contagem.indiceAtual;

  const ritmoAcumulado =
    contagem.decorridas > 0
      ? empenho.totalConsumido / contagem.decorridas
      : 0;
  const ritmoSustentavel =
    contagem.restantes > 0 ? empenho.restante / contagem.restantes : 0;

  let fechamentoProjetadoProcesso = empenho.totalConsumido;
  if (idx != null) {
    const ciclo = cicloOperacionalDeIndice(idx);
    const cicloInfo = enviadoCicloOperacionalAte(
      mon,
      mesRef,
      semanaRef,
      empenhoMeses,
    );
    const projCiclo = projecaoFimCicloOperacional(
      payload,
      mesRef,
      semanaRef,
      empenhoMeses ?? [],
    );
    const aLancarCicloAtual = Math.max(
      0,
      projCiclo.fechamentoProjetado - cicloInfo.enviado,
    );
    let tetosFuturos = 0;
    for (let c = ciclo + 1; c <= CICLOS_PROCESSO_OPERACIONAL; c++) {
      tetosFuturos += tetoMaximoCicloOperacional(c);
    }
    fechamentoProjetadoProcesso =
      empenho.totalConsumido + aLancarCicloAtual + tetosFuturos;
  }

  const noTrilho = fechamentoProjetadoProcesso <= empenho.totalEmpenho;

  let mensagem = '';
  if (contagem.decorridas === 0) {
    mensagem = 'Aguardando lançamentos no processo (16 semanas operacionais).';
  } else if (noTrilho) {
    mensagem =
      `${empenho.restante.toLocaleString('pt-BR')} cestas para ${contagem.restantes} sem. restantes — sustentável ~${Math.round(ritmoSustentavel)}/sem · fechamento projetado ${fechamentoProjetadoProcesso.toLocaleString('pt-BR')} dentro dos ${empenho.totalEmpenho.toLocaleString('pt-BR')}.`;
  } else {
    mensagem = `Atenção: fechamento projetado ${fechamentoProjetadoProcesso.toLocaleString('pt-BR')} ultrapassa o empenho de ${empenho.totalEmpenho.toLocaleString('pt-BR')}.`;
  }

  return {
    totalEmpenho: empenho.totalEmpenho,
    consumido: empenho.totalConsumido,
    restante: empenho.restante,
    semanasTotal: contagem.total,
    semanasDecorridas: contagem.decorridas,
    semanasRestantes: contagem.restantes,
    ritmoAcumulado,
    ritmoSustentavel,
    fechamentoProjetadoProcesso,
    noTrilho,
    mensagem,
  };
}
