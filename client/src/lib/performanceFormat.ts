/**
 * Helper di formattazione condivisi dai componenti della pagina Performance.
 * Estratti da MonthlyReturnsChart/MonthlyReturnsHeatmap/PeriodStatistics
 * per eliminare la duplicazione (MONTH_ABBR era copiato in 3 file,
 * formatReturn in 4).
 */

/** Abbreviazioni italiane dei mesi (index 0 = Gennaio) */
export const MONTH_ABBR = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
] as const;

/**
 * Formatta un rendimento decimale come percentuale con segno: 0.0981 → "+9.81%"
 */
export function formatReturn(value: number, decimals = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/**
 * Formatta un rendimento decimale nullable: null → "N/D"
 */
export function formatReturnOrNull(value: number | null, decimals = 2): string {
  if (value === null) return 'N/D';
  return formatReturn(value, decimals);
}