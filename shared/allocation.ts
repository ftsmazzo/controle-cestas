import { parseMonthKey } from './monthUtils.js';
import type {
  MonthAllocationResult,
  MonthlyPlan,
  ServiceAllocationLine,
  ServiceDef,
  ServiceMonthRecord,
  ServiceStats,
} from './serviceTypes.js';

function round(n: number): number {
  return Math.round(n);
}

/** Média de consumo por serviço (somente meses com dado > 0) */
export function computeServiceStats(
  history: ServiceMonthRecord[],
  serviceIds?: string[],
): ServiceStats[] {
  const byService = new Map<string, { nome: string; vals: number[] }>();

  for (const h of history) {
    if (h.total <= 0) continue;
    let entry = byService.get(h.servicoId);
    if (!entry) {
      entry = { nome: h.servicoNome, vals: [] };
      byService.set(h.servicoId, entry);
    }
    entry.vals.push(h.total);
  }

  const ids = serviceIds ?? [...byService.keys()];
  const totals = ids.map((id) => {
    const e = byService.get(id);
    if (!e || e.vals.length === 0) return { id, media: 0, nome: e?.nome ?? id };
    const media = e.vals.reduce((a, b) => a + b, 0) / e.vals.length;
    return { id, media, nome: e.nome };
  });

  const sumMedia = totals.reduce((s, t) => s + t.media, 0);

  return totals.map((t) => ({
    servicoId: t.id,
    servicoNome: t.nome,
    mediaHistorica: round(t.media),
    participacaoPct: sumMedia > 0 ? (t.media / sumMedia) * 100 : 0,
    mesesConsiderados: byService.get(t.id)?.vals.length ?? 0,
  }));
}

function minimoServico(
  svc: ServiceDef,
  mediaHistorica: number,
): number {
  if (svc.cotaFixa != null && svc.cotaFixa > 0) return round(svc.cotaFixa);
  if (svc.fixo) return round(mediaHistorica);
  return 0;
}

/** Distribui `totalDisponivel` entre serviços; fixos recebem cota/média primeiro */
export function allocateMonth(
  plan: MonthlyPlan,
  services: ServiceDef[],
  history: ServiceMonthRecord[],
): MonthAllocationResult {
  const stats = computeServiceStats(history, services.map((s) => s.id));
  const statsMap = new Map(stats.map((s) => [s.servicoId, s]));

  const linhasDraft: {
    svc: ServiceDef;
    media: number;
    pct: number;
    minimo: number;
    fixo: boolean;
  }[] = services.map((svc) => {
    const st = statsMap.get(svc.id);
    const media = st?.mediaHistorica ?? 0;
    const pct = st?.participacaoPct ?? 0;
    return {
      svc,
      media,
      pct,
      minimo: minimoServico(svc, media),
      fixo: svc.fixo,
    };
  });

  const totalDemandaReferencia = linhasDraft.reduce((s, l) => s + l.media, 0);
  let totalDisponivel = plan.totalDisponivel;
  let alerta: string | null = null;

  const sumMinimos = linhasDraft.reduce((s, l) => s + l.minimo, 0);

  if (sumMinimos > totalDisponivel) {
    alerta = `Cotas fixas (${sumMinimos}) superam o disponível (${totalDisponivel}). Ajuste cotas, marque menos serviços como fixos ou aumente o montante.`;
  }

  const fixos = linhasDraft.filter((l) => l.fixo);
  const flexiveis = linhasDraft.filter((l) => !l.fixo);

  let reservadoFixos = fixos.reduce((s, l) => s + l.minimo, 0);
  let restante = totalDisponivel - reservadoFixos;

  if (restante < 0) {
    restante = 0;
  }

  const pesoFlex = flexiveis.reduce((s, l) => s + l.media, 0);
  const alocacoes = new Map<string, number>();

  for (const l of fixos) {
    alocacoes.set(l.svc.id, l.minimo);
  }

  if (flexiveis.length === 0) {
    // só fixos
  } else if (pesoFlex <= 0) {
    const cada = round(restante / flexiveis.length);
    let usado = 0;
    flexiveis.forEach((l, i) => {
      const v =
        i === flexiveis.length - 1 ? restante - usado : Math.min(cada, restante - usado);
      alocacoes.set(l.svc.id, Math.max(0, v));
      usado += v;
    });
  } else {
    let assigned = 0;
    const parts = flexiveis.map((l, i) => {
      if (i === flexiveis.length - 1) {
        return { id: l.svc.id, raw: restante - assigned };
      }
      const v = round((restante * l.media) / pesoFlex);
      assigned += v;
      return { id: l.svc.id, raw: v };
    });
    for (const p of parts) {
      alocacoes.set(p.id, Math.max(0, p.raw));
    }
  }

  // Ajuste fino para bater no total
  let totalAlocado = [...alocacoes.values()].reduce((a, b) => a + b, 0);
  let diff = totalDisponivel - totalAlocado;
  if (diff !== 0 && flexiveis.length > 0) {
    const target = flexiveis[flexiveis.length - 1].svc.id;
    alocacoes.set(target, (alocacoes.get(target) ?? 0) + diff);
    totalAlocado = [...alocacoes.values()].reduce((a, b) => a + b, 0);
  }

  const linhas: ServiceAllocationLine[] = linhasDraft.map((l) => {
    const alocado = alocacoes.get(l.svc.id) ?? 0;
    let observacao = '';
    if (l.fixo) {
      observacao =
        l.svc.cotaFixa != null
          ? `Fixo — cota ${l.svc.cotaFixa}`
          : `Fixo — média histórica ${l.media}`;
    } else if (pesoFlex > 0) {
      observacao = `${l.pct.toFixed(1)}% do histórico (proporcional)`;
    } else {
      observacao = 'Divisão igual (sem histórico)';
    }
    return {
      servicoId: l.svc.id,
      servicoNome: l.svc.nome,
      fixo: l.fixo,
      cotaFixa: l.svc.cotaFixa,
      mediaHistorica: l.media,
      participacaoHistoricaPct: l.pct,
      alocado,
      minimoGarantido: l.minimo,
      observacao,
    };
  });

  if (totalDemandaReferencia > totalDisponivel && !alerta) {
    alerta = `INFORMATIVO: soma das médias (${totalDemandaReferencia}) > total informado (${totalDisponivel}). A divisão usa só o total informado.`;
  }

  return {
    mes: plan.mes,
    totalDisponivel,
    totalDemandaReferencia: round(totalDemandaReferencia),
    linhas,
    totalAlocado,
    sobra: totalDisponivel - totalAlocado,
    alerta,
  };
}

export function allocatePlans(
  plans: MonthlyPlan[],
  services: ServiceDef[],
  history: ServiceMonthRecord[],
): MonthAllocationResult[] {
  return [...plans]
    .sort((a, b) => parseMonthKey(a.mes) - parseMonthKey(b.mes))
    .map((p) => allocateMonth(p, services, history));
}

/** Próximos N meses a partir do último mês do histórico (labels PT) */
export function suggestNextMonths(
  history: ServiceMonthRecord[],
  count = 4,
): string[] {
  const PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  let maxKey = 0;
  for (const h of history) {
    const k = parseMonthKey(h.mes);
    if (k > maxKey) maxKey = k;
  }
  if (maxKey === 0) {
    const now = new Date();
    maxKey = now.getFullYear() * 100 + now.getMonth();
  }
  const result: string[] = [];
  let y = Math.floor(maxKey / 100);
  let m = maxKey % 100;
  for (let i = 0; i < count; i++) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    result.push(`${PT[m - 1]}/${y}`);
  }
  return result;
}
