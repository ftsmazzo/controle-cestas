import type { MonthStatus } from './types.js';
import { getYearMonth } from './monthUtils.js';

/** Contexto operacional documentado — não confundir com queda de demanda */
export const NOTA_METODOLOGICA_RESUMO =
  'Jan–Mar/2022 refletem o encerramento das ações de Combate ao COVID (consumo inflado). O ano de 2023 foi de racionamento agressivo por falta de cestas. Abr/2026 registrou ruptura de estoque (parada no fornecimento) e Mai/2026 está parcial, com retorno gradual. Esses períodos permanecem visíveis no histórico, mas são excluídos da média, tendência e previsão para não distorcer a análise da demanda representativa.';

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
