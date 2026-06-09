import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import { parseMonthKey } from './monthUtils.js';

/** Total enviado na semana (todos os equipamentos) */
export function totalEnviadoNaSemana(
  mon: EmergencialMonitoramento,
  mes: string,
  semana: number,
): number {
  const mesKey = parseMonthKey(mes);
  return mon.entradasSemanais
    .filter(
      (e) => parseMonthKey(e.mes) === mesKey && e.semana === semana,
    )
    .reduce((s, e) => s + (e.quantidade || 0), 0);
}
