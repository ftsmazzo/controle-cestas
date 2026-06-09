/** Semanas civis (seg–dom) — sem dependência de emergencyMonitoring */

export function calendarWeekRangesInMonth(
  year: number,
  month: number,
): { start: number; end: number }[] {
  const lastDay = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  let firstMonday = 1;
  if (firstDow !== 1) {
    firstMonday = 1 + (firstDow === 0 ? 1 : 8 - firstDow);
  }
  const ranges: { start: number; end: number }[] = [];
  for (let start = firstMonday; start <= lastDay; start += 7) {
    ranges.push({ start, end: Math.min(start + 6, lastDay) });
  }
  return ranges;
}

export function weeksInCalendarMonth(year: number, month: number): number {
  return calendarWeekRangesInMonth(year, month).length || 4;
}
