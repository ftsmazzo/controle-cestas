import {
  getCotaFixaDinamica,
  isServicoCotaMensalUnica,
} from './coderpRequisitanteRules.js';
import { computeServiceStats } from './allocation.js';
import { filtrarHistoricoReferencia, PERIODO_REFERENCIA_FIM, PERIODO_REFERENCIA_INICIO } from './processoEmergencial.js';
import type { EmergencialMonitoramento } from './emergencyMonitoring.js';
import { parseMonthKey } from './monthUtils.js';
import { planoJunSemana } from './planoAprovadoCiclo1.js';
import {
  planoCotaSemanalParaUnidade,
  usaPlanoSemanalPadrao,
} from './planoCotaSemanalPadrao.js';
import {
  listarSemanasOperacionaisControle,
  type SemanaOperacionalControle,
} from './operationalWeeks.js';
import { MESES_REQUISICAO_HISTORICO } from './requisicaoHistorico.js';
import { consumptionUnits } from './serviceFamilies.js';
import type { ServiceDef, ServicesPayload } from './serviceTypes.js';
import { getWeeklyQty } from './weeklyQty.js';

export interface CelulaConsumoSemana {
  indice: number;
  colLabel: string;
  ciclo: number;
  semanaNoCiclo: number;
  mes: string;
  semana: number;
  enviado: number;
  cota: number;
  pctCota: number;
}

export interface LinhaConsumoEquipamento {
  servicoId: string;
  servicoNome: string;
  tipo: 'rateio' | 'fixo_mensal';
  celulas: CelulaConsumoSemana[];
}

export interface GradeConsumoSemanal {
  colunas: SemanaOperacionalControle[];
  linhas: LinhaConsumoEquipamento[];
}

export function cotaSemanalReferencia(
  u: ServiceDef,
  ciclo: number,
  mes: string,
  semana: number,
  overrides?: Record<string, number>,
): number {
  if (overrides?.[u.id] != null) return overrides[u.id]!;

  if (isServicoCotaMensalUnica(u)) {
    return getCotaFixaDinamica(u.nome, ciclo, undefined);
  }

  if (usaPlanoSemanalPadrao(ciclo)) {
    return planoCotaSemanalParaUnidade(u.nome) ?? 0;
  }

  const junKey = parseMonthKey('Jun/2026');
  if (parseMonthKey(mes) === junKey && (semana === 1 || semana === 2)) {
    return (
      planoJunSemana(u.nome, semana as 1 | 2) ??
      planoCotaSemanalParaUnidade(u.nome) ??
      0
    );
  }

  return planoCotaSemanalParaUnidade(u.nome) ?? 0;
}

/** Equipamentos com cota no plano operacional (flex + fixos mensais) */
export function equipamentosComCotaOperacional(
  services: ServiceDef[],
): ServiceDef[] {
  return consumptionUnits(services).filter(
    (u) =>
      isServicoCotaMensalUnica(u) ||
      planoCotaSemanalParaUnidade(u.nome) != null,
  );
}

export function buildGradeConsumoSemanal(
  payload: ServicesPayload,
  empenhoMeses: string[],
  ateIndice?: number,
): GradeConsumoSemanal {
  const mon = payload.emergencial.monitoramento;
  const overrides = payload.settings?.cotasSemanaisOverrides ?? {};
  const todas = listarSemanasOperacionaisControle(mon, empenhoMeses);
  const colunas =
    ateIndice != null
      ? todas.filter((s) => s.indice <= ateIndice)
      : todas.filter((s) => s.temDados || s.indice === todas.length);

  const unidades = equipamentosComCotaOperacional(payload.services);

  const linhas: LinhaConsumoEquipamento[] = unidades.map((u) => {
    const celulas: CelulaConsumoSemana[] = colunas.map((col) => {
      const enviado = getWeeklyQty(mon, col.mes, col.semana, u.id);
      const cota = cotaSemanalReferencia(
        u,
        col.ciclo,
        col.mes,
        col.semana,
        overrides,
      );
      const pctCota =
        cota > 0 ? Math.round((enviado / cota) * 100) : enviado > 0 ? 100 : 0;
      return {
        indice: col.indice,
        colLabel: `C${col.ciclo}S${col.semanaNoCiclo}`,
        ciclo: col.ciclo,
        semanaNoCiclo: col.semanaNoCiclo,
        mes: col.mes,
        semana: col.semana,
        enviado,
        cota,
        pctCota,
      };
    });
    return {
      servicoId: u.id,
      servicoNome: u.nome,
      tipo: isServicoCotaMensalUnica(u) ? 'fixo_mensal' : 'rateio',
      celulas,
    };
  });

  return { colunas, linhas };
}

export interface LinhaCotaEquipamento {
  servicoId: string;
  servicoNome: string;
  tipo: 'rateio' | 'fixo_mensal';
  mediaHistorica: number;
  participacaoPct: number;
  cotaSemanalPlano: number;
  cotaSemanalEfetiva: number;
  editavel: boolean;
}

export function buildLinhasCotasEquipamentos(
  payload: ServicesPayload,
): LinhaCotaEquipamento[] {
  const overrides = payload.settings?.cotasSemanaisOverrides ?? {};
  const refKeys = new Set(
    MESES_REQUISICAO_HISTORICO.map((m) => parseMonthKey(m)),
  );
  const history = filtrarHistoricoReferencia(payload).filter((h) =>
    refKeys.has(parseMonthKey(h.mes)),
  );
  const units = equipamentosComCotaOperacional(payload.services);
  const stats = computeServiceStats(
    history,
    units.map((u) => u.id),
  );
  const statsMap = new Map(stats.map((s) => [s.servicoId, s]));
  const totalMedia = stats.reduce((s, x) => s + x.mediaHistorica, 0);

  return units.map((u) => {
    const st = statsMap.get(u.id);
    const media = st?.mediaHistorica ?? 0;
    const participacaoPct =
      totalMedia > 0 ? (media / totalMedia) * 100 : st?.participacaoPct ?? 0;
    const plano = isServicoCotaMensalUnica(u)
      ? getCotaFixaDinamica(u.nome, 2, undefined)
      : planoCotaSemanalParaUnidade(u.nome) ?? 0;
    const efetiva = overrides[u.id] ?? plano;
    return {
      servicoId: u.id,
      servicoNome: u.nome,
      tipo: isServicoCotaMensalUnica(u) ? 'fixo_mensal' : 'rateio',
      mediaHistorica: Math.round(media),
      participacaoPct,
      cotaSemanalPlano: plano,
      cotaSemanalEfetiva: efetiva,
      editavel: !isServicoCotaMensalUnica(u),
    };
  });
}

export function pctCorClasse(pct: number, temDados: boolean): string {
  if (!temDados) return 'cel-vazia';
  if (pct > 100) return 'cel-estouro';
  if (pct >= 90) return 'cel-alto';
  if (pct >= 70) return 'cel-medio';
  return 'cel-ok';
}

export { PERIODO_REFERENCIA_INICIO, PERIODO_REFERENCIA_FIM };
