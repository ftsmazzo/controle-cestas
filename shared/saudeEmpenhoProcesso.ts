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
import { totalEnviadoNaSemana } from './weeklyQty.js';
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
  /** Média real desde o ponto zero (semanas com lançamento) */
  ritmoRealMedio: number;
  /** Cestas/sem para fechar 5.000 em 16 semanas no ritmo restante */
  ritmoSustentavel: number;
  fechamentoProjetadoProcesso: number;
  noTrilho: boolean;
  acimaRitmoSustentavel: boolean;
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

function semanasComLancamentoProcesso(
  mon: EmergencialMonitoramento,
  ateIndice: number,
  empenhoMeses?: string[],
): number {
  const idxIni = indiceOperacionalCivil(
    MONITOR_CONTROLE_MES_INICIO,
    MONITOR_CONTROLE_SEMANA_INICIO,
    empenhoMeses,
  );
  if (idxIni == null) return 0;
  let n = 0;
  for (let i = idxIni; i <= ateIndice; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    if (totalEnviadoNaSemana(mon, civil.mes, civil.semana) > 0) n++;
  }
  return n;
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

  const semanasComDado =
    idx != null
      ? semanasComLancamentoProcesso(mon, idx, empenhoMeses)
      : 0;
  const ritmoRealMedio =
    semanasComDado > 0
      ? empenho.totalConsumido / semanasComDado
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
  const acimaRitmoSustentavel =
    ritmoRealMedio > 0 &&
    ritmoSustentavel > 0 &&
    ritmoRealMedio > ritmoSustentavel * 1.08;

  let mensagem = '';
  if (contagem.decorridas === 0) {
    mensagem = 'Aguardando lançamentos no processo (16 semanas operacionais).';
  } else if (noTrilho && !acimaRitmoSustentavel) {
    mensagem =
      `${empenho.restante.toLocaleString('pt-BR')} cestas para ${contagem.restantes} sem. restantes — fechamento projetado ${fechamentoProjetadoProcesso.toLocaleString('pt-BR')} dentro dos ${empenho.totalEmpenho.toLocaleString('pt-BR')}.`;
  } else if (!noTrilho) {
    mensagem = `Atenção: fechamento projetado ${fechamentoProjetadoProcesso.toLocaleString('pt-BR')} ultrapassa o empenho de ${empenho.totalEmpenho.toLocaleString('pt-BR')}.`;
  } else {
    mensagem = `Ritmo real ~${Math.round(ritmoRealMedio)}/sem acima do sustentável ~${Math.round(ritmoSustentavel)}/sem — ajuste nas próximas semanas.`;
  }

  return {
    totalEmpenho: empenho.totalEmpenho,
    consumido: empenho.totalConsumido,
    restante: empenho.restante,
    semanasTotal: contagem.total,
    semanasDecorridas: contagem.decorridas,
    semanasRestantes: contagem.restantes,
    ritmoRealMedio,
    ritmoSustentavel,
    fechamentoProjetadoProcesso,
    noTrilho,
    acimaRitmoSustentavel,
    mensagem,
  };
}
