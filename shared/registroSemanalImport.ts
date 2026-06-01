import {
  upsertWeeklyQty,
  type EmergencialMonitoramento,
} from './emergencyMonitoring.js';
import { parseMonthKey } from './monthUtils.js';
import type { RegistroSemanalParseResult } from './registroSemanalPdfParser.js';
import type { ServicesPayload } from './serviceTypes.js';

export interface ApplyRegistroSemanalResult {
  payload: ServicesPayload;
  linhasAplicadas: number;
  totalSemana: number;
  warnings: string[];
}

/** Grava envios reais da semana a partir do PDF operacional (não altera metas/histórico). */
export function applyRegistroSemanalImport(
  payload: ServicesPayload,
  parsed: RegistroSemanalParseResult,
  mes: string,
  semana: number,
): ApplyRegistroSemanalResult {
  const warnings = [...parsed.warnings];
  const mesKey = parseMonthKey(mes);
  if (!mesKey) {
    warnings.push('Mês monitorado inválido.');
    return { payload, linhasAplicadas: 0, totalSemana: 0, warnings };
  }

  const rows = parsed.rows.filter((r) => r.semana === semana);
  if (!rows.length) {
    warnings.push(
      `Nenhuma quantidade na semana ${semana} do PDF para ${mes}. Confira mês/semana ou o documento.`,
    );
    return { payload, linhasAplicadas: 0, totalSemana: 0, warnings };
  }

  let mon: EmergencialMonitoramento = {
    ...payload.emergencial.monitoramento,
    mesAtivo: mes,
  };
  let linhasAplicadas = 0;
  let totalSemana = 0;

  for (const row of rows) {
    if (!row.servicoId || row.match !== 'ok') continue;
    mon = upsertWeeklyQty(mon, mes, semana, row.servicoId, row.quantidade);
    linhasAplicadas += 1;
    totalSemana += row.quantidade;
  }

  return {
    payload: {
      ...payload,
      emergencial: {
        ...payload.emergencial,
        monitoramento: mon,
      },
    },
    linhasAplicadas,
    totalSemana,
    warnings,
  };
}
