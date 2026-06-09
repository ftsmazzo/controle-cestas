import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import { getWeeklyQty, totalEnviadoNaSemana } from './weeklyQty.js';
import { parseMonthKey } from './monthUtils.js';
import {
  planoJunSemana,
  TOTAL_PLANO_JUN_S1,
  TOTAL_PLANO_JUN_S2,
} from './planoAprovadoCiclo1.js';
import { formatSemanaOperacionalCurta } from './operationalWeeks.js';
import type { ServiceDef } from './serviceTypes.js';
import { isServicoCotaMensalUnica } from './coderpRequisitanteRules.js';

export interface ConformidadeSemanaPlano {
  mes: string;
  semana: number;
  label: string;
  planejadoFlex: number;
  lancadoFlex: number;
  delta: number;
  conforme: boolean;
  jaLancada: boolean;
}

export interface ConformidadePlanoJun {
  semanas: ConformidadeSemanaPlano[];
  totalPlanejadoFlex: number;
  totalLancadoFlex: number;
  conformeGeral: boolean;
  mensagem: string;
}

function totalFlexSemana(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
  services: ServiceDef[],
): number {
  let t = 0;
  for (const s of services) {
    if (isServicoCotaMensalUnica(s.nome)) continue;
    t += getWeeklyQty(mon, mes, semana, s.id);
  }
  return t;
}

function planejadoFlexSemana(
  services: ServiceDef[],
  semanaJun: 1 | 2,
): number {
  let t = 0;
  for (const s of services) {
    if (isServicoCotaMensalUnica(s.nome)) continue;
    t += planoJunSemana(s.nome, semanaJun) ?? 0;
  }
  return t;
}

/** Compara lançamentos reais vs plano aprovado Jun S1/S2 (só equipamentos flexíveis) */
export function auditoriaPlanoJunCiclo1(
  mon: EmergencialMonitoramento,
  services: ServiceDef[],
  empenhoMeses?: string[],
): ConformidadePlanoJun {
  const semanas: ConformidadeSemanaPlano[] = [];

  for (const semana of [1, 2] as const) {
    const lancadoFlex = totalFlexSemana(mon, 'Jun/2026', semana, services);
    const planejadoFlex = planejadoFlexSemana(services, semana);
    const jaLancada = lancadoFlex > 0;
    const delta = jaLancada ? lancadoFlex - planejadoFlex : 0;
    const conforme = jaLancada
      ? Math.abs(delta) <= Math.max(2, Math.round(planejadoFlex * 0.05))
      : false;
    semanas.push({
      mes: 'Jun/2026',
      semana,
      label: formatSemanaOperacionalCurta('Jun/2026', semana, empenhoMeses),
      planejadoFlex,
      lancadoFlex,
      delta,
      conforme,
      jaLancada,
    });
  }

  const lancadas = semanas.filter((s) => s.jaLancada);
  const conformeGeral =
    lancadas.length > 0 && lancadas.every((s) => s.conforme);

  let mensagem = '';
  if (lancadas.length === 0) {
    mensagem = 'Aguardando lançamento das semanas do plano Jun.';
  } else if (conformeGeral) {
    mensagem =
      'Lançamentos de Jun estão alinhados ao plano aprovado — controle nos trilhos.';
  } else {
    const off = lancadas.filter((s) => !s.conforme);
    mensagem = `Atenção: ${off.map((s) => s.label).join(', ')} fora do plano (revise lançamento ou plano).`;
  }

  return {
    semanas,
    totalPlanejadoFlex: TOTAL_PLANO_JUN_S1 + TOTAL_PLANO_JUN_S2,
    totalLancadoFlex: semanas.reduce((s, x) => s + x.lancadoFlex, 0),
    conformeGeral,
    mensagem,
  };
}

export function semanaJaLancada(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
): boolean {
  return totalEnviadoNaSemana(mon, mes, semana) > 0;
}

export function valorExibicaoSemana(
  mon: EmergencialMonitoramento,
  servicoId: string,
  servicoNome: string,
  mes: string,
  semana: number,
  propostaAlgoritmo: number,
): number {
  const q = getWeeklyQty(mon, mes, semana, servicoId);
  if (q > 0) return q;
  const junKey = parseMonthKey('Jun/2026');
  if (parseMonthKey(mes) === junKey && (semana === 1 || semana === 2)) {
    return planoJunSemana(servicoNome, semana) ?? propostaAlgoritmo;
  }
  return propostaAlgoritmo;
}
