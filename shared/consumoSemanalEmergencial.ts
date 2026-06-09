import {
  getWeeklyQty,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  totalEnviadoNaSemana,
} from './emergencyMonitoring.js';
import {
  SEMANAS_POR_CICLO_OPERACIONAL,
  listarSemanasCivisControle,
  refSemanaOperacional,
} from './operationalWeeks.js';
import {
  EMPENHO_DURACAO_MESES_PADRAO,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import { formatSemanaCurta, getYearMonth, parseMonthKey } from './monthUtils.js';
import { consumptionUnits, groupByFamilia, type FamiliaGroup } from './serviceFamilies.js';
import { isServicoCotaMensalUnica } from './coderpRequisitanteRules.js';
import { buildTabelaCessaoEmergencial } from './tabelaCessaoEmergencial.js';
import type { ServicesPayload } from './serviceTypes.js';

export interface SemanaColunaConsumo {
  mes: string;
  semana: number;
  label: string;
  periodo: string;
}

export interface CelulaConsumoSemanal {
  quantidade: number;
  acimaCota: boolean;
  acimaMedia: boolean;
  excessoCota: number;
  excessoMedia: number;
}

export interface ConsumoSemanalEquipRow {
  servicoId: string;
  servicoNome: string;
  familiaCodigo?: string;
  /** SAICA, WARAOS, Mãos Dadas — cota mensal única, sem alerta semanal */
  cotaMensalUnica: boolean;
  cotaMensal: number;
  cotaSemanal: number;
  mediaHistorica: number;
  mediaSemanal: number;
  celulas: CelulaConsumoSemanal[];
  acumulado: number;
  excessoAcumCota: number;
  excessoAcumMedia: number;
  semanasAcimaCota: number;
  semanasAcimaMedia: number;
}

export interface ConsumoSemanalEmergencial {
  colunas: SemanaColunaConsumo[];
  equipamentos: ConsumoSemanalEquipRow[];
  familias: FamiliaGroup<ConsumoSemanalEquipRow>[];
  totaisSemana: number[];
  temDados: boolean;
  periodoLabel: string;
}

function listarSemanasComDados(payload: ServicesPayload): SemanaColunaConsumo[] {
  const mon = payload.emergencial.monitoramento;
  const empenhoMeses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );

  const civis = listarSemanasCivisControle(empenhoMeses);
  const candidatas: SemanaColunaConsumo[] = civis.map((c, i) => {
    const ref = refSemanaOperacional(i + 1, empenhoMeses);
    return {
      mes: c.mes,
      semana: c.semana,
      label: ref?.label ?? formatSemanaCurta(c.mes, c.semana),
      periodo: ref?.periodo ?? `S${c.semana}`,
    };
  });

  let ultimaComDados = -1;
  for (let i = 0; i < candidatas.length; i++) {
    const { mes, semana } = candidatas[i];
    if (totalEnviadoNaSemana(mon, mes, semana) > 0) ultimaComDados = i;
  }

  return ultimaComDados >= 0 ? candidatas.slice(0, ultimaComDados + 1) : [];
}

function mediaSemanalRef(mediaHistorica: number): number {
  if (mediaHistorica <= 0) return 0;
  return Math.round(mediaHistorica / SEMANAS_POR_CICLO_OPERACIONAL);
}

export function buildConsumoSemanalEmergencial(
  payload: ServicesPayload,
): ConsumoSemanalEmergencial {
  const colunas = listarSemanasComDados(payload);
  const tabela = buildTabelaCessaoEmergencial(payload);
  const cotaMap = new Map(tabela.rows.map((r) => [r.servicoId, r.cotaMensal]));
  const mediaMap = new Map(tabela.rows.map((r) => [r.servicoId, r.mediaHistorica]));
  const mon = payload.emergencial.monitoramento;
  const units = consumptionUnits(payload.services);

  const equipamentos: ConsumoSemanalEquipRow[] = units.map((s) => {
    const cotaMes = cotaMap.get(s.id) ?? 0;
    const mediaHistorica = mediaMap.get(s.id) ?? 0;
    const cotaMensalUnica = isServicoCotaMensalUnica(s);
    let acumulado = 0;
    let semanasAcimaCota = 0;
    let semanasAcimaMedia = 0;

    const cotaSemanal =
      cotaMensalUnica || cotaMes <= 0
        ? 0
        : Math.round(cotaMes / SEMANAS_POR_CICLO_OPERACIONAL);
    const mediaSemanal = cotaMensalUnica ? 0 : mediaSemanalRef(mediaHistorica);

    const celulas: CelulaConsumoSemanal[] = colunas.map(({ mes, semana }) => {
      const quantidade = getWeeklyQty(mon, mes, semana, s.id);
      acumulado += quantidade;
      if (cotaMensalUnica) {
        return {
          quantidade,
          acimaCota: false,
          acimaMedia: false,
          excessoCota: 0,
          excessoMedia: 0,
        };
      }
      const excessoCota =
        cotaSemanal > 0 && quantidade > cotaSemanal ? quantidade - cotaSemanal : 0;
      const excessoMedia =
        mediaSemanal > 0 && quantidade > mediaSemanal
          ? quantidade - mediaSemanal
          : 0;
      if (excessoCota > 0) semanasAcimaCota++;
      if (excessoMedia > 0) semanasAcimaMedia++;
      return {
        quantidade,
        acimaCota: excessoCota > 0,
        acimaMedia: excessoMedia > 0,
        excessoCota,
        excessoMedia,
      };
    });

    const excessoAcumCota = cotaMensalUnica
      ? Math.max(0, acumulado - cotaMes)
      : Math.max(
          0,
          acumulado -
            cotaSemanal * celulas.filter((c) => c.quantidade > 0).length,
        );
    const excessoAcumMedia = cotaMensalUnica
      ? Math.max(0, acumulado - mediaHistorica)
      : Math.max(
          0,
          acumulado -
            mediaSemanal * celulas.filter((c) => c.quantidade > 0).length,
        );

    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      cotaMensalUnica,
      cotaMensal: cotaMes,
      cotaSemanal,
      mediaHistorica,
      mediaSemanal,
      celulas,
      acumulado,
      excessoAcumCota,
      excessoAcumMedia,
      semanasAcimaCota: cotaMensalUnica ? 0 : semanasAcimaCota,
      semanasAcimaMedia: cotaMensalUnica ? 0 : semanasAcimaMedia,
    };
  }).filter((r) => r.acumulado > 0 || r.celulas.some((c) => c.quantidade > 0));

  const familias = groupByFamilia(equipamentos, payload.services);
  const totaisSemana = colunas.map((_, i) =>
    equipamentos.reduce((s, r) => s + (r.celulas[i]?.quantidade ?? 0), 0),
  );

  const periodoLabel =
    colunas.length >= 2
      ? `${colunas[0].label} – ${colunas[colunas.length - 1].label}`
      : colunas[0]?.label ?? '—';

  return {
    colunas,
    equipamentos,
    familias,
    totaisSemana,
    temDados: colunas.length > 0,
    periodoLabel,
  };
}
