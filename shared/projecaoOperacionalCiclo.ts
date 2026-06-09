import {
  auditoriaPlanoJunCiclo1,
  planejadoFlexJunSemana,
} from './conformidadePlano.js';
import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import { planoJunSemana } from './planoAprovadoCiclo1.js';
import {
  SEMANAS_POR_CICLO_OPERACIONAL,
  civilPorIndiceOperacional,
  cicloOperacionalDeIndice,
  indiceOperacionalCivil,
  semanaNoCicloDeIndice,
  tetoMaximoCicloOperacional,
} from './operationalWeeks.js';
import { parseMonthKey } from './monthUtils.js';
import { isServicoCotaMensalUnica } from './coderpRequisitanteRules.js';
import type { ServicesPayload } from './serviceTypes.js';
import { getWeeklyQty, totalEnviadoNaSemana } from './weeklyQty.js';

export type FonteProjecaoOperacional =
  | 'plano_aprovado'
  | 'teto_operacional'
  | 'enviado_atual';

export interface ProjecaoOperacionalCiclo {
  fechamentoProjetado: number;
  propostaFutura: number;
  fonte: FonteProjecaoOperacional;
  dentroDoTeto: boolean;
  estouroProjetado: number;
  semanaProjetadaEstouro: number | null;
  usaPlanoAprovado: boolean;
  conformidadeOk: boolean;
  /** Ritmo forward para autonomia (cestas/sem nas semanas restantes do ciclo) */
  ritmoOperacionalForward: number;
}

function enviadoNoCicloAte(
  mon: EmergencialMonitoramento,
  mesRef: string,
  semanaRef: number,
  empenhoMeses: string[],
): { ciclo: number; enviado: number; semanaNoCiclo: number } {
  const idx = indiceOperacionalCivil(mesRef, semanaRef, empenhoMeses);
  if (idx == null) {
    return { ciclo: 1, enviado: 0, semanaNoCiclo: 0 };
  }
  const ciclo = cicloOperacionalDeIndice(idx);
  const inicioCiclo = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  let enviado = 0;
  for (let i = inicioCiclo; i <= idx; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    enviado += totalEnviadoNaSemana(mon, civil.mes, civil.semana);
  }
  return {
    ciclo,
    enviado,
    semanaNoCiclo: semanaNoCicloDeIndice(idx),
  };
}

function propostaFlexPlanoJunRestante(
  mon: EmergencialMonitoramento,
  services: ServicesPayload['services'],
): number {
  const audit = auditoriaPlanoJunCiclo1(mon, services);
  return audit.semanas
    .filter((s) => !s.jaLancada)
    .reduce((t, s) => t + s.planejadoFlex, 0);
}

/** Fechamento do ciclo pelo plano operacional — não extrapola ritmo inercial */
export function projecaoFimCicloOperacional(
  payload: ServicesPayload,
  mesRef: string,
  semanaRef: number,
  empenhoMeses: string[],
): ProjecaoOperacionalCiclo {
  const mon = payload.emergencial.monitoramento;
  const { ciclo, enviado, semanaNoCiclo } = enviadoNoCicloAte(
    mon,
    mesRef,
    semanaRef,
    empenhoMeses,
  );
  const teto = tetoMaximoCicloOperacional(ciclo);
  const semanasRestantes = Math.max(
    0,
    SEMANAS_POR_CICLO_OPERACIONAL - semanaNoCiclo,
  );

  if (ciclo === 1) {
    const audit = auditoriaPlanoJunCiclo1(mon, payload.services, empenhoMeses);
    const propostaFutura = propostaFlexPlanoJunRestante(mon, payload.services);
    const fechamento = enviado + propostaFutura;
    const dentroDoTeto = fechamento <= teto;
    return {
      fechamentoProjetado: Math.min(fechamento, teto),
      propostaFutura,
      fonte: 'plano_aprovado',
      dentroDoTeto,
      estouroProjetado: Math.max(0, fechamento - teto),
      semanaProjetadaEstouro:
        fechamento > teto && semanasRestantes > 0
          ? Math.min(
              SEMANAS_POR_CICLO_OPERACIONAL,
              semanaNoCiclo + semanasRestantes,
            )
          : null,
      usaPlanoAprovado: true,
      conformidadeOk: audit.conformeGeral,
      ritmoOperacionalForward:
        semanasRestantes > 0 ? propostaFutura / semanasRestantes : 0,
    };
  }

  const tetoSemanal = Math.round(teto / SEMANAS_POR_CICLO_OPERACIONAL);
  const propostaFutura =
    semanasRestantes > 0 ? semanasRestantes * tetoSemanal : 0;
  const fechamento = Math.min(teto, enviado + propostaFutura);

  return {
    fechamentoProjetado: semanasRestantes > 0 ? fechamento : enviado,
    propostaFutura: Math.max(0, fechamento - enviado),
    fonte: semanasRestantes > 0 ? 'teto_operacional' : 'enviado_atual',
    dentroDoTeto: fechamento <= teto,
    estouroProjetado: 0,
    semanaProjetadaEstouro: null,
    usaPlanoAprovado: false,
    conformidadeOk: false,
    ritmoOperacionalForward:
      semanasRestantes > 0 ? tetoSemanal : 0,
  };
}

/** Projeção por equipamento alinhada ao plano/teto — evita % inercial falso */
export function projecaoEquipamentoCiclo(
  mon: EmergencialMonitoramento,
  servicoId: string,
  servicoNome: string,
  metaMensal: number,
  enviadoCicloEq: number,
  mesRef: string,
  semanaRef: number,
  empenhoMeses: string[],
  projecaoCiclo: ProjecaoOperacionalCiclo,
): number {
  if (metaMensal <= 0) return enviadoCicloEq;
  const { ciclo, semanaNoCiclo } = enviadoNoCicloAte(
    mon,
    mesRef,
    semanaRef,
    empenhoMeses,
  );
  const semanasRestantes = Math.max(
    0,
    SEMANAS_POR_CICLO_OPERACIONAL - semanaNoCiclo,
  );
  if (semanasRestantes <= 0) return enviadoCicloEq;

  let futuro = 0;
  if (projecaoCiclo.usaPlanoAprovado && ciclo === 1) {
    const junKey = parseMonthKey('Jun/2026');
    for (let op = 1; op <= semanasRestantes; op++) {
      const idx =
        (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + semanaNoCiclo + op;
      const civil = civilPorIndiceOperacional(idx, empenhoMeses);
      if (!civil) continue;
      const q = getWeeklyQty(mon, civil.mes, civil.semana, servicoId);
      if (q > 0) continue;
      if (
        parseMonthKey(civil.mes) === junKey &&
        (civil.semana === 1 || civil.semana === 2) &&
        !isServicoCotaMensalUnica(servicoNome)
      ) {
        futuro += planoJunSemana(servicoNome, civil.semana as 1 | 2) ?? 0;
      }
    }
  } else {
    const teto = tetoMaximoCicloOperacional(ciclo);
    const tetoSemanal = Math.round(teto / SEMANAS_POR_CICLO_OPERACIONAL);
    if (!isServicoCotaMensalUnica(servicoNome)) {
      futuro = semanasRestantes * tetoSemanal * (metaMensal / teto);
    }
  }

  return Math.min(metaMensal, Math.round(enviadoCicloEq + futuro));
}

export interface LimiteSemanaCiclo {
  limite: number;
  margemCiclo: number;
  semanasRestantes: number;
  planejadoSemana: number | null;
  fonte: 'plano' | 'margem_ciclo';
}

/** Teto da semana = margem restante do ciclo ÷ semanas restantes (ou plano aprovado) */
export function limiteSemanaCicloOperacional(
  payload: ServicesPayload,
  mesAnalise: string,
  semanaAnalise: number,
  enviadoCiclo: number,
  tetoCiclo: number,
  empenhoMeses: string[],
): LimiteSemanaCiclo {
  const mon = payload.emergencial.monitoramento;
  const idx = indiceOperacionalCivil(mesAnalise, semanaAnalise, empenhoMeses);
  const semanaNoCiclo = idx != null ? semanaNoCicloDeIndice(idx) : 1;
  const semanasRestantes = Math.max(
    1,
    SEMANAS_POR_CICLO_OPERACIONAL - semanaNoCiclo + 1,
  );
  const margemCiclo = Math.max(0, tetoCiclo - enviadoCiclo);
  const margemPorSemana = Math.round(margemCiclo / semanasRestantes);

  let planejadoSemana: number | null = null;
  if (idx != null) {
    const civil = civilPorIndiceOperacional(idx, empenhoMeses);
    const junKey = parseMonthKey('Jun/2026');
    if (
      civil &&
      parseMonthKey(civil.mes) === junKey &&
      (civil.semana === 1 || civil.semana === 2)
    ) {
      const t = planejadoFlexJunSemana(
        payload.services,
        civil.semana as 1 | 2,
      );
      if (t > 0) planejadoSemana = t;
    }
  }

  if (planejadoSemana != null) {
    return {
      limite: Math.min(margemCiclo, planejadoSemana),
      margemCiclo,
      semanasRestantes,
      planejadoSemana,
      fonte: 'plano',
    };
  }

  return {
    limite: margemPorSemana,
    margemCiclo,
    semanasRestantes,
    planejadoSemana: null,
    fonte: 'margem_ciclo',
  };
}

export function labelFonteProjecao(fonte: FonteProjecaoOperacional): string {
  if (fonte === 'plano_aprovado') return 'plano aprovado Jun';
  if (fonte === 'teto_operacional') return 'teto operacional 1.150/ciclo';
  return 'enviado no ciclo';
}
