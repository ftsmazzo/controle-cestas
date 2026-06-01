/** Pontuação 0–100: quanto melhor estiver dentro do limite (estouro penaliza forte). */
export function scoreDentroDoLimite(pctUso: number): number {
  if (pctUso <= 0) return 100;
  if (pctUso <= 85) return 100;
  if (pctUso <= 100) return Math.round(100 - (pctUso - 85) * 2);
  return Math.max(0, Math.round(70 - (pctUso - 100) * 4));
}

export function estouroAcimaLimite(enviado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.max(0, enviado - limite);
}

export function margemAteLimite(enviado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.max(0, limite - enviado);
}

export function pctUsoLimite(enviado: number, limite: number): number {
  if (limite <= 0) return 0;
  return (enviado / limite) * 100;
}

export type NivelLimite = 'ok' | 'atencao' | 'critico';

export function nivelPorUsoLimite(pctUso: number): NivelLimite {
  if (pctUso > 100) return 'critico';
  if (pctUso > 90) return 'atencao';
  return 'ok';
}

/** Projeção: mantém ritmo médio semanal até o fim do mês civil */
export function projecaoFimMes(
  enviadoAteAgora: number,
  ritmoMedioSemanal: number,
  semanasRestantes: number,
): number {
  if (semanasRestantes <= 0) return Math.round(enviadoAteAgora);
  return Math.round(enviadoAteAgora + ritmoMedioSemanal * semanasRestantes);
}

/** Semanas até atingir o limite (null se ritmo ≤ 0 ou já estourou) */
export function semanasAteLimite(
  margem: number,
  ritmoSemanal: number,
): number | null {
  if (margem <= 0 || ritmoSemanal <= 0) return null;
  return margem / ritmoSemanal;
}
