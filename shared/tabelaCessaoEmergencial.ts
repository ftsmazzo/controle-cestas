import { allocateMonth, computeServiceStats } from './allocation.js';
import { MONITOR_CONTROLE_MES_INICIO } from './emergencyMonitoring.js';
import { parseMonthKey } from './monthUtils.js';
import {
  filtrarHistoricoReferencia,
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
  TETO_MENSAL_OPERACIONAL,
} from './processoEmergencial.js';
import { MESES_REQUISICAO_HISTORICO } from './requisicaoHistorico.js';
import { consumptionUnits, groupByFamilia, type FamiliaGroup } from './serviceFamilies.js';
import type { ServicesPayload } from './serviceTypes.js';

export interface CessaoEquipamentoRow {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  mediaHistorica: number;
  cotaMensal: number;
  /** Positivo = precisa reduzir vs histórico; negativo = abaixo da média */
  reducaoPct: number;
  mesesHistorico: number;
}

export interface TabelaCessaoEmergencial {
  rows: CessaoEquipamentoRow[];
  familias: FamiliaGroup<CessaoEquipamentoRow>[];
  tetoMensal: number;
  somaMedias: number;
  somaCotas: number;
  periodoRef: string;
  mesesUsados: string[];
}

export function buildTabelaCessaoEmergencial(
  payload: ServicesPayload,
): TabelaCessaoEmergencial {
  const tetoMensal =
    payload.emergencial.cestasPorMes ?? TETO_MENSAL_OPERACIONAL;
  const refKeys = new Set(
    MESES_REQUISICAO_HISTORICO.map((m) => parseMonthKey(m)),
  );
  const history = filtrarHistoricoReferencia(payload).filter((h) =>
    refKeys.has(parseMonthKey(h.mes)),
  );
  const mesesUsados = MESES_REQUISICAO_HISTORICO.filter((m) =>
    history.some((h) => h.mes === m && h.total > 0),
  );

  const units = consumptionUnits(payload.services);
  const stats = computeServiceStats(
    history,
    units.map((u) => u.id),
  );
  const statsMap = new Map(stats.map((s) => [s.servicoId, s]));

  const mesPlano =
    payload.emergencial.monitoramento.mesAtivo?.trim() ||
    MONITOR_CONTROLE_MES_INICIO;
  const allocation = allocateMonth(
    { mes: mesPlano, totalDisponivel: tetoMensal },
    payload.services,
    history,
    {
      validMonthKeys: [...refKeys],
      excluirMesDistribuicao: false,
    },
  );
  const cotaMap = new Map(
    allocation.linhas.map((l) => [l.servicoId, l.alocado]),
  );

  const rows: CessaoEquipamentoRow[] = units
    .map((u) => {
      const st = statsMap.get(u.id);
      const media = st?.mediaHistorica ?? 0;
      const cota = cotaMap.get(u.id) ?? 0;
      const reducaoPct =
        media > 0 ? ((media - cota) / media) * 100 : cota > 0 ? -100 : 0;
      return {
        servicoId: u.id,
        servicoNome: u.nome,
        familiaCodigo: u.familiaCodigo ?? undefined,
        mediaHistorica: media,
        cotaMensal: cota,
        reducaoPct,
        mesesHistorico: st?.mesesConsiderados ?? 0,
      };
    })
    .filter((r) => r.mediaHistorica > 0 || r.cotaMensal > 0);

  const familias = groupByFamilia(rows, payload.services).map((fam) => ({
    ...fam,
    itens: [...fam.itens].sort((a, b) => b.mediaHistorica - a.mediaHistorica),
  }));

  const rowsOrdenadas = familias.flatMap((f) => f.itens);

  return {
    rows: rowsOrdenadas,
    familias,
    tetoMensal,
    somaMedias: rowsOrdenadas.reduce((s, r) => s + r.mediaHistorica, 0),
    somaCotas: rowsOrdenadas.reduce((s, r) => s + r.cotaMensal, 0),
    periodoRef: `${PERIODO_REFERENCIA_INICIO} – ${PERIODO_REFERENCIA_FIM}`,
    mesesUsados: mesesUsados.length ? [...mesesUsados] : [...MESES_REQUISICAO_HISTORICO],
  };
}
