import {
  getCotaFixaDinamica,
  isServicoCotaMensalUnica,
} from './coderpRequisitanteRules.js';
import { ultimoLancamentoSemanal } from './emergencyMonitoring.js';
import { suggestEmpenhoMeses } from './empenhoControle.js';
import { parseMonthKey } from './monthUtils.js';
import { SEMANAS_POR_CICLO_OPERACIONAL } from './monitorConstants.js';
import { buildConsumoSemanalEmergencial } from './consumoSemanalEmergencial.js';
import {
  cicloOperacionalDeIndice,
  civilPorIndiceOperacional,
  indiceOperacionalCivil,
  labelCicloOperacional,
  proximaSemanaOperacional,
  refSemanaOperacional,
  tetoMaximoCicloOperacional,
} from './operationalWeeks.js';
import { planoJunSemana } from './planoAprovadoCiclo1.js';
import {
  planoCotaSemanalParaUnidade,
  usaPlanoSemanalPadrao,
} from './planoCotaSemanalPadrao.js';
import { consumptionUnits } from './serviceFamilies.js';
import type { CotasSemanaEquipamento } from './visaoPublicaOperacional.js';
import type { ServiceDef } from './serviceTypes.js';
import type { ServicesPayload } from './serviceTypes.js';
import { getWeeklyQty, totalEnviadoNaSemana } from './weeklyQty.js';

export type GrupoCotaId = 'cras' | 'creas' | 'pse' | 'fixos';

export interface GrupoCotasPublico {
  id: GrupoCotaId;
  titulo: string;
  itens: CotasSemanaEquipamento[];
  subtotalCotaSemana: number;
  subtotalPct: number;
}

export interface CotasAgrupadasPublico {
  grupos: GrupoCotasPublico[];
  totalCota: number;
}

export type TendenciaSemana = 'up' | 'down' | 'flat';

export interface ConsumoSemanalGrupo {
  indice: number;
  label: string;
  periodo: string;
  total: number;
  cras: number;
  creas: number;
  pse: number;
  fixos: number;
  deltaTotal: number | null;
  deltaPct: number | null;
  tendencia: TendenciaSemana;
}

export interface ExcessoCicloItem {
  servicoId: string;
  servicoNome: string;
  cotaPrevista: number;
  enviado: number;
  excesso: number;
  pctAcima: number;
}

export interface TopExcessoUltimoCiclo {
  ciclo: number;
  cicloLabel: string;
  items: ExcessoCicloItem[];
  temDados: boolean;
}

const ROMAN_ORDER: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
};

const FIXOS_ORDEM = ['SAICA', 'WARAOS', 'MÃOS DADAS'];

function normNome(nome: string): string {
  return nome.trim().toUpperCase();
}

export function classificarGrupoCota(
  nome: string,
  tipo: CotasSemanaEquipamento['tipo'],
): GrupoCotaId {
  if (tipo === 'fixo_mensal') return 'fixos';
  const n = normNome(nome);
  if (/^CRAS\s+\d/.test(n)) return 'cras';
  if (/^CREAS\s+[IVX\d]/.test(n)) return 'creas';
  return 'pse';
}

function sortCras(a: CotasSemanaEquipamento, b: CotasSemanaEquipamento): number {
  const na = parseInt(a.servicoNome.match(/(\d+)/)?.[1] ?? '0', 10);
  const nb = parseInt(b.servicoNome.match(/(\d+)/)?.[1] ?? '0', 10);
  return na - nb;
}

function sortCreas(a: CotasSemanaEquipamento, b: CotasSemanaEquipamento): number {
  const ra = a.servicoNome.match(/CREAS\s+([IVX]+|\d+)/i)?.[1]?.toUpperCase() ?? '';
  const rb = b.servicoNome.match(/CREAS\s+([IVX]+|\d+)/i)?.[1]?.toUpperCase() ?? '';
  const oa = ROMAN_ORDER[ra] ?? parseInt(ra, 10) ?? 99;
  const ob = ROMAN_ORDER[rb] ?? parseInt(rb, 10) ?? 99;
  return oa - ob;
}

function sortFixos(a: CotasSemanaEquipamento, b: CotasSemanaEquipamento): number {
  const ia = FIXOS_ORDEM.indexOf(normNome(a.servicoNome));
  const ib = FIXOS_ORDEM.indexOf(normNome(b.servicoNome));
  return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99);
}

function sortGrupo(
  id: GrupoCotaId,
  a: CotasSemanaEquipamento,
  b: CotasSemanaEquipamento,
): number {
  if (id === 'cras') return sortCras(a, b);
  if (id === 'creas') return sortCreas(a, b);
  if (id === 'fixos') return sortFixos(a, b);
  return a.servicoNome.localeCompare(b.servicoNome, 'pt');
}

const GRUPO_TITULOS: Record<GrupoCotaId, string> = {
  cras: 'CRAS (1–12)',
  creas: 'CREAS (I–V)',
  pse: 'Serviços PSE',
  fixos: 'Entrega única no período',
};

export function agruparCotasPublicas(
  cotas: CotasSemanaEquipamento[],
): CotasAgrupadasPublico {
  const totalCota = cotas.reduce((s, c) => s + c.cotaSemana, 0);
  const ordem: GrupoCotaId[] = ['cras', 'creas', 'pse', 'fixos'];
  const buckets = new Map<GrupoCotaId, CotasSemanaEquipamento[]>();

  for (const c of cotas) {
    const g = classificarGrupoCota(c.servicoNome, c.tipo);
    const list = buckets.get(g) ?? [];
    list.push(c);
    buckets.set(g, list);
  }

  const grupos: GrupoCotasPublico[] = ordem
    .map((id) => {
      const itens = (buckets.get(id) ?? []).sort((a, b) => sortGrupo(id, a, b));
      if (!itens.length) return null;
      const subtotalCotaSemana = itens.reduce((s, c) => s + c.cotaSemana, 0);
      return {
        id,
        titulo: GRUPO_TITULOS[id],
        itens,
        subtotalCotaSemana,
        subtotalPct: totalCota > 0 ? (subtotalCotaSemana / totalCota) * 100 : 0,
      };
    })
    .filter((g): g is GrupoCotasPublico => g != null);

  return { grupos, totalCota };
}

function classificarConsumoGrupo(u: ServiceDef): keyof Omit<
  ConsumoSemanalGrupo,
  'indice' | 'label' | 'periodo' | 'total' | 'deltaTotal' | 'deltaPct' | 'tendencia'
> {
  if (isServicoCotaMensalUnica(u)) return 'fixos';
  const n = normNome(u.nome);
  if (/^CRAS\s+\d/.test(n)) return 'cras';
  if (/^CREAS\s+[IVX\d]/.test(n)) return 'creas';
  return 'pse';
}

function tendenciaDeDelta(delta: number | null): TendenciaSemana {
  if (delta == null || delta === 0) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function buildConsumoSemanalPorGrupo(
  payload: ServicesPayload,
  maxSemanas = 16,
): ConsumoSemanalGrupo[] {
  const cfg = payload.emergencial;
  const empenhoMeses =
    cfg.empenhoMeses?.length
      ? cfg.empenhoMeses
      : suggestEmpenhoMeses(cfg.duracaoMeses ?? 4);

  const ultimo = ultimoLancamentoSemanal(cfg.monitoramento);
  if (!ultimo) return [];

  const idxUltimo = indiceOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  if (idxUltimo == null) return [];

  const units = consumptionUnits(payload.services);
  const inicio = Math.max(1, idxUltimo - maxSemanas + 1);
  const pontos: ConsumoSemanalGrupo[] = [];

  for (let i = inicio; i <= idxUltimo; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    const ref = refSemanaOperacional(i, empenhoMeses);
    const row: ConsumoSemanalGrupo = {
      indice: i,
      label: ref?.label ?? `Sem ${i}`,
      periodo: ref?.periodo ?? `${civil.mes} S${civil.semana}`,
      total: 0,
      cras: 0,
      creas: 0,
      pse: 0,
      fixos: 0,
      deltaTotal: null,
      deltaPct: null,
      tendencia: 'flat',
    };

    for (const u of units) {
      const q = getWeeklyQty(
        cfg.monitoramento,
        civil.mes,
        civil.semana,
        u.id,
      );
      if (q <= 0) continue;
      const g = classificarConsumoGrupo(u);
      row[g] += q;
      row.total += q;
    }

    if (row.total === 0 && totalEnviadoNaSemana(cfg.monitoramento, civil.mes, civil.semana) === 0) {
      continue;
    }
    pontos.push(row);
  }

  for (let i = 1; i < pontos.length; i++) {
    const prev = pontos[i - 1]!.total;
    const cur = pontos[i]!.total;
    pontos[i]!.deltaTotal = cur - prev;
    pontos[i]!.deltaPct = prev > 0 ? ((cur - prev) / prev) * 100 : null;
    pontos[i]!.tendencia = tendenciaDeDelta(pontos[i]!.deltaTotal);
  }

  return pontos;
}

function cotaSemanaEsperadaCiclo(
  u: ServiceDef,
  ciclo: number,
  mes: string,
  semana: number,
  fixosReaisPorCiclo: ServicesPayload['emergencial']['monitoramento']['fixosReaisPorCiclo'],
): number {
  if (isServicoCotaMensalUnica(u)) return 0;

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

function cotaPrevistaCicloEquipamento(
  u: ServiceDef,
  ciclo: number,
  empenhoMeses: string[],
  fixosReaisPorCiclo: ServicesPayload['emergencial']['monitoramento']['fixosReaisPorCiclo'],
): number {
  if (isServicoCotaMensalUnica(u)) {
    return getCotaFixaDinamica(
      u.nome,
      ciclo,
      fixosReaisPorCiclo as Record<number, Record<string, number>>,
    );
  }

  const inicio = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const fim = ciclo * SEMANAS_POR_CICLO_OPERACIONAL;
  let total = 0;
  for (let i = inicio; i <= fim; i++) {
    const civil = civilPorIndiceOperacional(i, empenhoMeses);
    if (!civil) continue;
    total += cotaSemanaEsperadaCiclo(
      u,
      ciclo,
      civil.mes,
      civil.semana,
      fixosReaisPorCiclo,
    );
  }
  return total;
}

function enviadoCicloEquipamento(
  payload: ServicesPayload,
  ciclo: number,
  empenhoMeses: string[],
): Map<string, number> {
  const mon = payload.emergencial.monitoramento;
  const inicio = (ciclo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1;
  const fim = ciclo * SEMANAS_POR_CICLO_OPERACIONAL;
  const out = new Map<string, number>();

  for (const u of consumptionUnits(payload.services)) {
    let t = 0;
    for (let i = inicio; i <= fim; i++) {
      const civil = civilPorIndiceOperacional(i, empenhoMeses);
      if (!civil) continue;
      t += getWeeklyQty(mon, civil.mes, civil.semana, u.id);
    }
    out.set(u.id, t);
  }
  return out;
}

export function classificarGrupoConsumo(
  nome: string,
  cotaMensalUnica: boolean,
): GrupoCotaId {
  if (cotaMensalUnica) return 'fixos';
  const n = normNome(nome);
  if (/^CRAS\s+\d/.test(n)) return 'cras';
  if (/^CREAS\s+[IVX\d]/.test(n)) return 'creas';
  return 'pse';
}

export interface SemanaConsumoChip {
  label: string;
  periodo: string;
  quantidade: number;
  acimaCota: boolean;
}

export interface ConsumoEquipamentoPublico {
  servicoId: string;
  servicoNome: string;
  cotaMensalUnica: boolean;
  cotaCiclo: number;
  usadoCiclo: number;
  pctRestanteCiclo: number;
  acumuladoControle: number;
  cotaSemanalRef: number;
  semanas: SemanaConsumoChip[];
  semanasAcimaCota: number;
}

export interface GrupoConsumoPublico {
  id: GrupoCotaId;
  titulo: string;
  equipamentos: ConsumoEquipamentoPublico[];
  subtotalUsadoCiclo: number;
  subtotalCotaCiclo: number;
  subtotalPctRestante: number;
}

export interface VisaoConsumoPublico {
  cicloAtual: number;
  cicloLabel: string;
  semanaNoCiclo: number;
  totalSemanasRegistradas: number;
  totalAcumuladoControle: number;
  usadoCicloAtual: number;
  tetoCicloAtual: number;
  pctRestanteCicloAtual: number;
  ultimaSemanaLabel: string;
  ultimaSemanaPeriodo: string;
  ultimaSemanaTotal: number;
  deltaUltimaSemana: number | null;
  tendenciaUltima: TendenciaSemana;
  grupos: GrupoConsumoPublico[];
  temDados: boolean;
  periodoLabel: string;
}

function pctRestanteCiclo(usado: number, cota: number): number {
  if (cota <= 0) return 100;
  return Math.max(0, ((cota - usado) / cota) * 100);
}

function sortConsumoGrupo(
  id: GrupoCotaId,
  a: ConsumoEquipamentoPublico,
  b: ConsumoEquipamentoPublico,
): number {
  const asCota = {
    servicoId: a.servicoId,
    servicoNome: a.servicoNome,
    familiaCodigo: undefined,
    cotaSemana: 0,
    cotaMensalCiclo: 0,
    enviadoCiclo: 0,
    tipo: a.cotaMensalUnica ? ('fixo_mensal' as const) : ('rateio' as const),
    observacao: null,
  };
  const bsCota = { ...asCota, servicoId: b.servicoId, servicoNome: b.servicoNome };
  return sortGrupo(id, asCota, bsCota);
}

export function buildVisaoConsumoPublico(
  payload: ServicesPayload,
): VisaoConsumoPublico | null {
  const consumo = buildConsumoSemanalEmergencial(payload);
  if (!consumo.temDados) return null;

  const cfg = payload.emergencial;
  const empenhoMeses =
    cfg.empenhoMeses?.length
      ? cfg.empenhoMeses
      : suggestEmpenhoMeses(cfg.duracaoMeses ?? 4);

  const ultimo = ultimoLancamentoSemanal(cfg.monitoramento);
  if (!ultimo) return null;

  const idxUltimo = indiceOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  if (idxUltimo == null) return null;

  const cicloFechado = cicloOperacionalDeIndice(idxUltimo);
  const prox = proximaSemanaOperacional(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  const cicloAtual = prox
    ? cicloOperacionalDeIndice(prox.indice)
    : cicloFechado;
  const semanaNoCiclo =
    ((idxUltimo - 1) % SEMANAS_POR_CICLO_OPERACIONAL) + 1;
  const novoCiclo = prox != null && cicloAtual > cicloFechado;

  const fixos = cfg.monitoramento.fixosReaisPorCiclo;
  const units = consumptionUnits(payload.services);
  const byId = new Map(units.map((u) => [u.id, u]));
  const enviadoMap = enviadoCicloEquipamento(
    payload,
    novoCiclo ? cicloAtual : cicloFechado,
    empenhoMeses,
  );

  if (novoCiclo) {
    for (const id of enviadoMap.keys()) enviadoMap.set(id, 0);
  }

  const equipamentos: ConsumoEquipamentoPublico[] = consumo.equipamentos.map(
    (row) => {
      const u = byId.get(row.servicoId);
      const cicloRef = novoCiclo ? cicloAtual : cicloFechado;
      const cotaCiclo =
        u != null
          ? cotaPrevistaCicloEquipamento(u, cicloRef, empenhoMeses, fixos)
          : row.cotaMensalUnica
            ? row.cotaMensal
            : row.cotaSemanal * SEMANAS_POR_CICLO_OPERACIONAL;
      const usadoCiclo = enviadoMap.get(row.servicoId) ?? 0;

      return {
        servicoId: row.servicoId,
        servicoNome: row.servicoNome,
        cotaMensalUnica: row.cotaMensalUnica,
        cotaCiclo,
        usadoCiclo,
        pctRestanteCiclo: pctRestanteCiclo(usadoCiclo, cotaCiclo),
        acumuladoControle: row.acumulado,
        cotaSemanalRef: row.cotaSemanal,
        semanas: consumo.colunas.map((col, i) => ({
          label: col.label,
          periodo: col.periodo,
          quantidade: row.celulas[i]?.quantidade ?? 0,
          acimaCota: row.celulas[i]?.acimaCota ?? false,
        })),
        semanasAcimaCota: row.semanasAcimaCota,
      };
    },
  );

  const ordem: GrupoCotaId[] = ['cras', 'creas', 'pse', 'fixos'];
  const buckets = new Map<GrupoCotaId, ConsumoEquipamentoPublico[]>();
  for (const e of equipamentos) {
    const g = classificarGrupoConsumo(e.servicoNome, e.cotaMensalUnica);
    const list = buckets.get(g) ?? [];
    list.push(e);
    buckets.set(g, list);
  }

  const grupos: GrupoConsumoPublico[] = ordem
    .map((id) => {
      const items = (buckets.get(id) ?? []).sort((a, b) =>
        sortConsumoGrupo(id, a, b),
      );
      if (!items.length) return null;
      const subtotalUsadoCiclo = items.reduce((s, e) => s + e.usadoCiclo, 0);
      const subtotalCotaCiclo = items.reduce((s, e) => s + e.cotaCiclo, 0);
      return {
        id,
        titulo: GRUPO_TITULOS[id],
        equipamentos: items,
        subtotalUsadoCiclo,
        subtotalCotaCiclo,
        subtotalPctRestante: pctRestanteCiclo(
          subtotalUsadoCiclo,
          subtotalCotaCiclo,
        ),
      };
    })
    .filter((g): g is GrupoConsumoPublico => g != null);

  const usadoCicloAtual = [...enviadoMap.values()].reduce((s, v) => s + v, 0);
  const tetoCicloAtual = tetoMaximoCicloOperacional(cicloAtual);
  const totalAcumuladoControle = consumo.totaisSemana.reduce((a, b) => a + b, 0);
  const ultimaIdx = consumo.totaisSemana.length - 1;
  const ultimaSemanaTotal = consumo.totaisSemana[ultimaIdx] ?? 0;
  const penultima = ultimaIdx > 0 ? consumo.totaisSemana[ultimaIdx - 1]! : null;
  const deltaUltimaSemana =
    penultima != null ? ultimaSemanaTotal - penultima : null;

  return {
    cicloAtual,
    cicloLabel: labelCicloOperacional(cicloAtual),
    semanaNoCiclo: novoCiclo ? 1 : semanaNoCiclo,
    totalSemanasRegistradas: consumo.colunas.length,
    totalAcumuladoControle,
    usadoCicloAtual,
    tetoCicloAtual,
    pctRestanteCicloAtual: pctRestanteCiclo(usadoCicloAtual, tetoCicloAtual),
    ultimaSemanaLabel: consumo.colunas[ultimaIdx]?.label ?? '—',
    ultimaSemanaPeriodo: consumo.colunas[ultimaIdx]?.periodo ?? '—',
    ultimaSemanaTotal,
    deltaUltimaSemana,
    tendenciaUltima: tendenciaDeDelta(deltaUltimaSemana),
    grupos,
    temDados: true,
    periodoLabel: consumo.periodoLabel,
  };
}

export function buildTopExcessoUltimoCiclo(
  payload: ServicesPayload,
  limit = 3,
): TopExcessoUltimoCiclo {
  const cfg = payload.emergencial;
  const empenhoMeses =
    cfg.empenhoMeses?.length
      ? cfg.empenhoMeses
      : suggestEmpenhoMeses(cfg.duracaoMeses ?? 4);

  const ultimo = ultimoLancamentoSemanal(cfg.monitoramento);
  if (!ultimo) {
    return { ciclo: 1, cicloLabel: 'Ciclo 1', items: [], temDados: false };
  }

  const idxUltimo = indiceOperacionalCivil(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  if (idxUltimo == null) {
    return { ciclo: 1, cicloLabel: 'Ciclo 1', items: [], temDados: false };
  }

  const cicloFechado = cicloOperacionalDeIndice(idxUltimo);
  const prox = proximaSemanaOperacional(
    ultimo.mes,
    ultimo.semana,
    empenhoMeses,
  );
  const cicloPedidos = prox
    ? cicloOperacionalDeIndice(prox.indice)
    : cicloFechado;

  const semanaNoCiclo =
    ((idxUltimo - 1) % SEMANAS_POR_CICLO_OPERACIONAL) + 1;

  let cicloAlvo: number;
  if (cicloPedidos > cicloFechado) {
    cicloAlvo = cicloFechado;
  } else if (semanaNoCiclo >= SEMANAS_POR_CICLO_OPERACIONAL) {
    cicloAlvo = cicloFechado;
  } else if (cicloFechado > 1) {
    cicloAlvo = cicloFechado - 1;
  } else {
    cicloAlvo = cicloFechado;
  }

  const enviadoMap = enviadoCicloEquipamento(payload, cicloAlvo, empenhoMeses);
  const fixos = cfg.monitoramento.fixosReaisPorCiclo;

  const candidatos: ExcessoCicloItem[] = consumptionUnits(payload.services)
    .map((u) => {
      const cotaPrevista = cotaPrevistaCicloEquipamento(
        u,
        cicloAlvo,
        empenhoMeses,
        fixos,
      );
      const enviado = enviadoMap.get(u.id) ?? 0;
      const excesso = Math.max(0, enviado - cotaPrevista);
      const pctAcima =
        cotaPrevista > 0 ? ((enviado - cotaPrevista) / cotaPrevista) * 100 : 0;
      return {
        servicoId: u.id,
        servicoNome: u.nome,
        cotaPrevista,
        enviado,
        excesso,
        pctAcima,
      };
    })
    .filter((e) => e.excesso > 0 && e.cotaPrevista > 0)
    .sort((a, b) => b.pctAcima - a.pctAcima || b.excesso - a.excesso);

  const refIni = refSemanaOperacional(
    (cicloAlvo - 1) * SEMANAS_POR_CICLO_OPERACIONAL + 1,
    empenhoMeses,
  );
  const refFim = refSemanaOperacional(
    cicloAlvo * SEMANAS_POR_CICLO_OPERACIONAL,
    empenhoMeses,
  );
  const cicloLabel =
    refIni && refFim
      ? `Ciclo ${cicloAlvo} (${refIni.periodo} – ${refFim.periodo})`
      : `Ciclo ${cicloAlvo}`;

  return {
    ciclo: cicloAlvo,
    cicloLabel,
    items: candidatos.slice(0, limit),
    temDados: [...enviadoMap.values()].some((v) => v > 0),
  };
}
