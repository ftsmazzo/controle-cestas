import { buildMonitoramentoResumo } from './emergencyMonitoring.js';
import { groupByFamilia, type FamiliaGroup } from './serviceFamilies.js';
import { buildTabelaCessaoEmergencial } from './tabelaCessaoEmergencial.js';
import type { ServicesPayload } from './serviceTypes.js';

export interface EstouroRetomadaItem {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  mediaHistorica: number;
  cotaMensal: number;
  enviadoRetomada: number;
  excessoCota: number;
  excessoMedia: number;
  pctCota: number;
  pctMedia: number;
  /** Soma dos excessos absolutos — critério de ordenação */
  score: number;
}

export interface TopEstourosRetomada {
  items: EstouroRetomadaItem[];
  mes: string;
  semanaInicioControle: number;
  semanaBaseRitmo: number;
  temDados: boolean;
}

function enviadoNoPeriodoControle(
  semanas: Record<number, number>,
  semanaInicio: number,
  semanaFim: number,
): number {
  let sum = 0;
  for (let w = semanaInicio; w <= semanaFim; w++) {
    sum += semanas[w] ?? 0;
  }
  return sum;
}

export function buildTopEstourosRetomada(
  payload: ServicesPayload,
  limit = 4,
): TopEstourosRetomada {
  const resumo = buildMonitoramentoResumo(payload);
  const tabela = buildTabelaCessaoEmergencial(payload);
  const mediaMap = new Map(
    tabela.rows.map((r) => [r.servicoId, r.mediaHistorica]),
  );
  const cotaMap = new Map(
    tabela.rows.map((r) => [r.servicoId, r.cotaMensal]),
  );

  const candidatos: EstouroRetomadaItem[] = resumo.equipamentos
    .map((e) => {
      const cota = e.metaMensal > 0 ? e.metaMensal : (cotaMap.get(e.servicoId) ?? 0);
      const media = mediaMap.get(e.servicoId) ?? 0;
      const enviado = enviadoNoPeriodoControle(
        e.semanas,
        resumo.semanaInicioControle,
        resumo.semanaBaseRitmo,
      );
      const excessoCota = Math.max(0, enviado - cota);
      const excessoMedia = Math.max(0, enviado - media);
      const pctCota = cota > 0 ? (enviado / cota) * 100 : 0;
      const pctMedia = media > 0 ? (enviado / media) * 100 : 0;
      return {
        servicoId: e.servicoId,
        servicoNome: e.servicoNome,
        familiaCodigo: e.familiaCodigo,
        mediaHistorica: media,
        cotaMensal: cota,
        enviadoRetomada: enviado,
        excessoCota,
        excessoMedia,
        pctCota,
        pctMedia,
        score: excessoCota + excessoMedia,
      };
    })
    .filter((e) => e.enviadoRetomada > 0 && e.excessoCota > 0 && e.excessoMedia > 0)
    .sort((a, b) => b.score - a.score || b.pctCota - a.pctCota);

  const temDados = resumo.equipamentos.some(
    (e) =>
      enviadoNoPeriodoControle(
        e.semanas,
        resumo.semanaInicioControle,
        resumo.semanaBaseRitmo,
      ) > 0,
  );

  return {
    items: candidatos.slice(0, limit),
    mes: resumo.mes,
    semanaInicioControle: resumo.semanaInicioControle,
    semanaBaseRitmo: resumo.semanaBaseRitmo,
    temDados,
  };
}

export function groupEstourosPorFamilia(
  items: EstouroRetomadaItem[],
  payload: ServicesPayload,
): FamiliaGroup<EstouroRetomadaItem>[] {
  return groupByFamilia(items, payload.services);
}
