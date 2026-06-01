import {
  getWeeklyQty,
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
  totalEnviadoNaSemana,
  weekDateRangeLabel,
  weeksInCalendarMonth,
} from './emergencyMonitoring.js';
import {
  EMPENHO_DURACAO_MESES_PADRAO,
  suggestEmpenhoMeses,
} from './empenhoControle.js';
import { formatSemanaCurta, getYearMonth, parseMonthKey } from './monthUtils.js';
import { consumptionUnits, groupByFamilia, type FamiliaGroup } from './serviceFamilies.js';
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
  const meses =
    payload.emergencial.empenhoMeses?.length
      ? payload.emergencial.empenhoMeses
      : suggestEmpenhoMeses(
          payload.emergencial.duracaoMeses ?? EMPENHO_DURACAO_MESES_PADRAO,
        );

  const kInicio = parseMonthKey(MONITOR_CONTROLE_MES_INICIO);
  const candidatas: SemanaColunaConsumo[] = [];

  for (const mes of meses) {
    if (parseMonthKey(mes) < kInicio) continue;
    const ym = getYearMonth(mes);
    if (!ym) continue;
    const maxW = weeksInCalendarMonth(ym.year, ym.month);
    const wStart =
      parseMonthKey(mes) === kInicio ? MONITOR_CONTROLE_SEMANA_INICIO : 1;

    for (let w = wStart; w <= maxW; w++) {
      candidatas.push({
        mes,
        semana: w,
        label: formatSemanaCurta(mes, w),
        periodo: weekDateRangeLabel(ym.year, ym.month, w),
      });
    }
  }

  let ultimaComDados = -1;
  for (let i = 0; i < candidatas.length; i++) {
    const { mes, semana } = candidatas[i];
    if (totalEnviadoNaSemana(mon, mes, semana) > 0) ultimaComDados = i;
  }

  return ultimaComDados >= 0 ? candidatas.slice(0, ultimaComDados + 1) : [];
}

function mediaSemanalRef(mediaHistorica: number, semanasNoMes: number): number {
  if (mediaHistorica <= 0) return 0;
  return semanasNoMes > 0
    ? Math.round(mediaHistorica / semanasNoMes)
    : Math.round(mediaHistorica / 4.33);
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
    let acumulado = 0;
    let semanasAcimaCota = 0;
    let semanasAcimaMedia = 0;

    const celulas: CelulaConsumoSemanal[] = colunas.map(({ mes, semana }) => {
      const ym = getYearMonth(mes);
      const semanasNoMes = ym ? weeksInCalendarMonth(ym.year, ym.month) : 4;
      const cotaSemanal =
        cotaMes > 0 && semanasNoMes > 0 ? Math.round(cotaMes / semanasNoMes) : 0;
      const mediaSem = mediaSemanalRef(mediaHistorica, semanasNoMes);
      const quantidade = getWeeklyQty(mon, mes, semana, s.id);
      acumulado += quantidade;
      const excessoCota =
        cotaSemanal > 0 && quantidade > cotaSemanal ? quantidade - cotaSemanal : 0;
      const excessoMedia =
        mediaSem > 0 && quantidade > mediaSem ? quantidade - mediaSem : 0;
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

    const ymRef = getYearMonth(colunas[0]?.mes ?? MONITOR_CONTROLE_MES_INICIO);
    const semanasRef = ymRef ? weeksInCalendarMonth(ymRef.year, ymRef.month) : 4;
    const cotaSemanal =
      cotaMes > 0 && semanasRef > 0 ? Math.round(cotaMes / semanasRef) : 0;
    const mediaSemanal = mediaSemanalRef(mediaHistorica, semanasRef);
    const semanasComDado = celulas.filter((c) => c.quantidade > 0).length;
    const cotaAcumEsperada = cotaSemanal * semanasComDado;
    const mediaAcumEsperada = mediaSemanal * semanasComDado;

    return {
      servicoId: s.id,
      servicoNome: s.nome,
      familiaCodigo: s.familiaCodigo ?? undefined,
      cotaMensal: cotaMes,
      cotaSemanal,
      mediaHistorica,
      mediaSemanal,
      celulas,
      acumulado,
      excessoAcumCota: Math.max(0, acumulado - cotaAcumEsperada),
      excessoAcumMedia: Math.max(0, acumulado - mediaAcumEsperada),
      semanasAcimaCota,
      semanasAcimaMedia,
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
