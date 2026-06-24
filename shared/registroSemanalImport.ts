import {
  upsertWeeklyQty,
  type EmergencialMonitoramento,
} from './emergencyMonitoring.js';
import { parseMonthKey } from './monthUtils.js';
import type { RegistroSemanalParseResult } from './registroSemanalPdfParser.js';
import { ensureFamiliaHierarchy } from './serviceFamilies.js';
import { ensureServiceByUnitName } from './requisicaoHistorico.js';
import type { ServicesPayload } from './serviceTypes.js';

export interface ApplyRegistroSemanalResult {
  payload: ServicesPayload;
  linhasAplicadas: number;
  totalSemana: number;
  warnings: string[];
  novosEquipamentos: string[];
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
    return {
      payload,
      linhasAplicadas: 0,
      totalSemana: 0,
      warnings,
      novosEquipamentos: [],
    };
  }

  const rows = parsed.rows.filter((r) => r.semana === semana);
  if (!rows.length) {
    warnings.push(
      `Nenhuma quantidade na semana ${semana} do PDF para ${mes}. Confira mês/semana ou o documento.`,
    );
    return {
      payload,
      linhasAplicadas: 0,
      totalSemana: 0,
      warnings,
      novosEquipamentos: [],
    };
  }

  let services = payload.services;
  const novosEquipamentos: string[] = [];
  let mon: EmergencialMonitoramento = {
    ...payload.emergencial.monitoramento,
    mesAtivo: mes,
  };
  let linhasAplicadas = 0;
  let totalSemana = 0;

  const porServico = new Map<string, number>();
  for (const row of rows) {
    if (row.match !== 'ok' || row.quantidade <= 0) continue;
    const ensured = ensureServiceByUnitName(services, row.canonicalNome);
    services = ensured.services;
    if (ensured.criado) novosEquipamentos.push(ensured.nome);
    porServico.set(
      ensured.id,
      (porServico.get(ensured.id) ?? 0) + row.quantidade,
    );
  }

  for (const [servicoId, quantidade] of porServico) {
    mon = upsertWeeklyQty(mon, mes, semana, servicoId, quantidade);
    linhasAplicadas += 1;
    totalSemana += quantidade;
  }

  if (novosEquipamentos.length) {
    warnings.push(
      `Cadastro atualizado: ${novosEquipamentos.length} equipamento(s) criado(s) (${novosEquipamentos.slice(0, 4).join(', ')}${novosEquipamentos.length > 4 ? '…' : ''}).`,
    );
  }

  return {
    payload: {
      ...payload,
      services: ensureFamiliaHierarchy(services),
      emergencial: {
        ...payload.emergencial,
        monitoramento: mon,
      },
    },
    linhasAplicadas,
    totalSemana,
    warnings,
    novosEquipamentos,
  };
}
