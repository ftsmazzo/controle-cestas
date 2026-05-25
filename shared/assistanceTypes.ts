/** Fase 4 — volume de atendimentos SEMAS (preparado, import futuro) */
export interface AssistanceMonthRecord {
  mes: string;
  unitId: string;
  familias: number | null;
  atendimentos: number | null;
}

export interface AssistancePayload {
  records: AssistanceMonthRecord[];
  updatedAt: string;
  sourceFile?: string;
}
