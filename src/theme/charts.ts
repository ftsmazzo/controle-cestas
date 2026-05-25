/** Paleta unificada para Recharts — alinhada aos tokens CSS. */
export const CHART = {
  observado: '#6366f1',
  observadoGradient: ['#818cf8', '#4f46e5'] as const,
  tendencia: '#10b981',
  referencia: '#8b5cf6',
  volumeMenor: '#94a3b8',
  volumeMaior: '#64748b',
  planejamentoMedio: '#f59e0b',
  contrato: '#0d9488',
  mediaMovel: '#eab308',
  grid: '#e2e8f0',
  axis: '#64748b',
  tooltipBg: '#0f172a',
  tooltipBorder: '#334155',
} as const;

export const chartAxisProps = {
  tick: { fill: CHART.axis, fontSize: 11, fontFamily: 'inherit' },
  axisLine: { stroke: CHART.grid },
  tickLine: { stroke: CHART.grid },
};

export const chartGridProps = {
  strokeDasharray: '4 4',
  stroke: CHART.grid,
  vertical: false,
};
