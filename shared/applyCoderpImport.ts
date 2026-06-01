import { parseMonthKey } from './monthUtils.js';
import {
  detectFamiliaFromName,
  enrichServiceDef,
  ensureFamiliaHierarchy,
  familiaId,
  slugServiceId,
} from './serviceFamilies.js';
import type { CoderpParseResult, CoderpRequisitanteRow } from './coderpPdfParser.js';
import {
  type EmergencialMonitoramento,
  upsertWeeklyQty,
  weeksInCalendarMonth,
} from './emergencyMonitoring.js';
import type {
  ServiceDef,
  ServiceMonthRecord,
  ServicesPayload,
} from './serviceTypes.js';

export interface CoderpImportTarget {
  mes: string;
  /** Se informado, lança tudo na semana; senão divide pelas semanas do mês */
  semana?: number;
  atualizarHistoricoMensal?: boolean;
}

export interface CoderpImportResult {
  payload: ServicesPayload;
  monitoramento: EmergencialMonitoramento;
  linhasAplicadas: number;
  linhasIgnoradas: number;
  novosEquipamentos: string[];
}

function ensureServiceForRow(
  services: ServiceDef[],
  row: CoderpRequisitanteRow,
): { services: ServiceDef[]; id: string } {
  if (row.servicoId && services.some((s) => s.id === row.servicoId)) {
    return { services, id: row.servicoId };
  }
  const nome = row.canonicalNome ?? row.requisitante.slice(0, 80);
  const id = slugServiceId(nome);
  if (services.some((s) => s.id === id)) return { services, id };
  const def = enrichServiceDef({
    id,
    nome,
    fixo: false,
    cotaFixa: null,
    level: 'unidade',
    parentId: row.familia ? familiaId(row.familia) : null,
    familiaCodigo: row.familia ?? detectFamiliaFromName(nome),
  });
  return { services: [...services, def], id };
}

function splitQtyPerWeek(
  total: number,
  semanas: number,
  semanaUnica?: number,
): Record<number, number> {
  const out: Record<number, number> = {};
  if (semanaUnica != null && semanaUnica >= 1) {
    out[semanaUnica] = total;
    return out;
  }
  const base = Math.floor(total / semanas);
  let rest = total - base * semanas;
  for (let w = 1; w <= semanas; w++) {
    out[w] = base + (rest > 0 ? 1 : 0);
    if (rest > 0) rest--;
  }
  return out;
}

export function applyCoderpImport(
  payload: ServicesPayload,
  parsed: CoderpParseResult,
  target: CoderpImportTarget,
): CoderpImportResult {
  let services = ensureFamiliaHierarchy(payload.services);
  let mon: EmergencialMonitoramento = {
    ...payload.emergencial.monitoramento,
    mesAtivo: target.mes,
  };
  const history = [...payload.history];
  const novosEquipamentos: string[] = [];
  let linhasAplicadas = 0;
  let linhasIgnoradas = 0;

  const ym = parseMonthKey(target.mes);
  const year = Math.floor(ym / 100);
  const month = ym % 100;
  const semanas =
    year > 0 && month > 0 ? weeksInCalendarMonth(year, month) : 4;

  for (const row of parsed.rows) {
    if (row.quantidade <= 0) {
      linhasIgnoradas++;
      continue;
    }
    const ensured = ensureServiceForRow(services, row);
    services = ensureFamiliaHierarchy(ensured.services);
    const sid = ensured.id;
    if (row.match === 'criar' && row.servicoNome) {
      novosEquipamentos.push(row.servicoNome);
    }

    const porSemana = splitQtyPerWeek(row.quantidade, semanas, target.semana);
    for (const [w, q] of Object.entries(porSemana)) {
      mon = upsertWeeklyQty(mon, target.mes, Number(w), sid, q);
    }

    if (target.atualizarHistoricoMensal) {
      const nome =
        services.find((s) => s.id === sid)?.nome ?? row.servicoNome ?? sid;
      const idx = history.findIndex(
        (h) => h.servicoId === sid && parseMonthKey(h.mes) === ym,
      );
      const rec: ServiceMonthRecord = {
        mes: target.mes,
        servicoId: sid,
        servicoNome: nome,
        total: row.quantidade,
      };
      if (idx >= 0) history[idx] = rec;
      else history.push(rec);
    }
    linhasAplicadas++;
  }

  return {
    payload: {
      ...payload,
      services,
      history,
      emergencial: {
        ...payload.emergencial,
        monitoramento: mon,
      },
    },
    monitoramento: mon,
    linhasAplicadas,
    linhasIgnoradas,
    novosEquipamentos,
  };
}
