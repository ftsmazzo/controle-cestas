import type { MonthStatus } from './types.js';
import { getYearMonth } from './monthUtils.js';
import {
  EMPENHO_OPERACIONAL_TOTAL,
  PERIODO_REFERENCIA_FIM,
  PERIODO_REFERENCIA_INICIO,
  TETO_CONTRATUAL_MENSAL,
  TETO_MENSAL_OPERACIONAL,
} from './processoEmergencial.js';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
} from './emergencyMonitoring.js';
import { EMPENHO_DURACAO_MESES_PADRAO } from './empenhoControle.js';
import { GORDURA_PERIODO_TOTAL, REDUCAO_SEMANA_PRESSAO_PCT } from './cenarioMitigacao.js';

/** Resumo do contexto histórico — exclusões do modelo de referência */
export const NOTA_METODOLOGICA_RESUMO =
  'O sistema opera no processo emergencial Mai–Ago/2026 com controle semanal de consumo por equipamento. ' +
  'Jan–Mar/2022 refletem o encerramento das ações de Combate ao COVID (consumo inflado). ' +
  'O ano de 2023 foi de racionamento agressivo por falta de cestas. ' +
  'Abr/2026 registrou ruptura de estoque (parada no fornecimento) e Mai/2026 está parcial, com retorno gradual. ' +
  'Esses períodos permanecem visíveis no histórico, mas são excluídos da média e das cotas de referência para não distorcer a demanda representativa.';

export const METODOLOGIA_PROCESSO_EMERGENCIAL =
  `Processo emergencial de ${EMPENHO_DURACAO_MESES_PADRAO} meses (Mai–Ago/2026) com empenho total de ${EMPENHO_OPERACIONAL_TOTAL.toLocaleString('pt-BR')} cestas. ` +
  'O objetivo é evitar nova ruptura: acompanhar envios semana a semana, comparar com cotas por equipamento e ajustar o ritmo antes de estourar o teto mensal ou o saldo do empenho.';

export const METODOLOGIA_EMPENHO_TETOS =
  `Teto operacional de planejamento: ${TETO_MENSAL_OPERACIONAL.toLocaleString('pt-BR')} cestas/mês. ` +
  `Teto contratual máximo: ${TETO_CONTRATUAL_MENSAL.toLocaleString('pt-BR')} cestas/mês. ` +
  `A diferença (${TETO_CONTRATUAL_MENSAL - TETO_MENSAL_OPERACIONAL}/mês) forma a gordura de mitigação — ${GORDURA_PERIODO_TOTAL} cestas no período completo — usada apenas quando o mês já pressionado precisa fechar acima de 1.150 sem comprometer o empenho.`;

export const METODOLOGIA_PONTO_ZERO =
  `Ponto zero do controle semanal: ${MONITOR_CONTROLE_MES_INICIO}, semana civil ${MONITOR_CONTROLE_SEMANA_INICIO} (segunda a domingo). ` +
  'Antes disso, o histórico serve só como referência de cessão; a partir daí, cada envio semanal reduz o saldo do empenho e alimenta o monitor e o painel de decisão.';

export const METODOLOGIA_REFERENCIA_CESSAO =
  `Cotas por equipamento derivam do histórico de referência ${PERIODO_REFERENCIA_INICIO}–${PERIODO_REFERENCIA_FIM}: ` +
  'média mensal válida por serviço, rateio proporcional ao total mensal e conversão em cota semanal (cota mensal ÷ semanas civis do mês). ' +
  'Equipamentos marcados como fixos ou com cota fixa informada têm prioridade no rateio.';

export const METODOLOGIA_CONTROLE_SEMANAL =
  'O consumo é acompanhado por semana civil (S1…S5), não por mês fechado. ' +
  'A aba Consumo mostra envios por equipamento e semana, com destaque quando supera a cota semanal ou a média histórica. ' +
  'O Monitor emergencial consolida saldo do empenho, envios da semana e PDFs operacionais lançados pelo Banco de Alimentos.';

export const METODOLOGIA_MITIGACAO =
  'Quando o mês corrente já gastou parte do teto de 1.150, o painel de decisão propõe um plano para as próximas semanas: ' +
  `(1) orçamento restante = saldo até 1.150 + gordura ainda disponível no período; ` +
  `(2) divisão do orçamento pelas semanas planejadas; ` +
  `(3) rateio proporcional à cota semanal de cada equipamento; ` +
  `(4) redução de ${REDUCAO_SEMANA_PRESSAO_PCT}% na semana de maior pressão; ` +
  `(5) corte adicional em quem já superou a média histórica no acumulado do mês. ` +
  'Em mês novo, a cota mensal reinicia integralmente.';

export const METODOLOGIA_EXCLUSOES =
  'Períodos excluídos do cálculo de médias e cotas: Jan–Mar/2022 (legado COVID), todo o ano de 2023 (racionamento), Abr/2026 (ruptura) e Mai/2026 enquanto parcial.';

export const NOTA_ABR_2026 =
  'Abr/2026: parada no fornecimento (ruptura). O consumo observado reflete falta de cestas, não redução da necessidade social. Excluído do modelo preditivo.';

export const NOTA_MAI_2026 =
  'Mai/2026: mês parcial, retorno gradual do abastecimento e racionamento. Dado ainda não representa demanda plena. Excluído do modelo preditivo.';

export interface MesOperacional {
  mes: string;
  status: MonthStatus;
  titulo: string;
  descricao: string;
  cor: string;
  excluirDoModelo: boolean;
}

export function getDefaultObservacao(
  mes: string,
  status: MonthStatus,
  existing?: string,
): string {
  if (existing?.trim()) return existing.trim();
  const ym = getYearMonth(mes);
  if (ym?.year === 2026 && ym.month === 4) return NOTA_ABR_2026;
  if (ym?.year === 2026 && ym.month === 5) return NOTA_MAI_2026;
  if (status === 'Ruptura de estoque') return 'Ruptura de estoque — exclusão do modelo.';
  if (status === 'Parcial') return 'Mês parcial/incompleto — exclusão do modelo.';
  return '';
}

export function getMesOperacional(mes: string, status: MonthStatus): MesOperacional {
  const ym = getYearMonth(mes);
  if (ym?.year === 2026 && ym.month === 4) {
    return {
      mes,
      status,
      titulo: 'Ruptura — parada no fornecimento',
      descricao: NOTA_ABR_2026,
      cor: '#fecaca',
      excluirDoModelo: true,
    };
  }
  if (ym?.year === 2026 && ym.month === 5) {
    return {
      mes,
      status,
      titulo: 'Parcial — retorno gradual + racionamento',
      descricao: NOTA_MAI_2026,
      cor: '#fef08a',
      excluirDoModelo: true,
    };
  }
  if (status === 'Ruptura de estoque') {
    return {
      mes,
      status,
      titulo: 'Ruptura de estoque',
      descricao: 'Excluído do modelo preditivo.',
      cor: '#fecaca',
      excluirDoModelo: true,
    };
  }
  if (status === 'Parcial') {
    return {
      mes,
      status,
      titulo: 'Mês parcial',
      descricao: 'Excluído do modelo preditivo.',
      cor: '#fef08a',
      excluirDoModelo: true,
    };
  }
  return {
    mes,
    status,
    titulo: 'Mês completo',
    descricao: 'Entra na média, tendência e forecast.',
    cor: '#dcfce7',
    excluirDoModelo: false,
  };
}

export function listMesesOperacionais(
  rows: { mes: string; status: MonthStatus }[],
): MesOperacional[] {
  return rows.map((r) => getMesOperacional(r.mes, r.status));
}
