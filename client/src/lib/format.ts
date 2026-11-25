/**
 * Helper di formattazione condivisi tra le pagine.
 * Estratti da Dashboard/Portfolio/AssetDetail/Allocation per eliminare duplicazione.
 */

/**
 * Formatta un numero come prezzo con 2-4 decimali significativi.
 * Per valori > 10 usa 2 decimali, per valori <= 10 usa 4 decimali.
 */
export const formatPrice = (price: number | null | undefined) => {
  if (price === null || price === undefined) return '—';
  return price >= 10
    ? price.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

/**
 * Formatta un importo numerico (senza simbolo di valuta).
 */
export const formatAmount = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Formatta un importo in euro con simbolo € prima, separatore migliaia punto,
 * decimali virgola. Arrotonda all'intero di default; solo i valori unitari
 * (prezzo corrente, prezzo medio carico) usano 2+ decimali con formatPrice.
 *
 * @param decimals  numero di cifre decimali (default 0).
 */
export const formatEUR = (value: number | null | undefined, decimals = 0): string => {
  if (value === null || value === undefined) return '—';
  return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

/**
 * Formatta un importo nella valuta specificata (valore × quantità aggregato,
 * non un prezzo unitario). Usa il simbolo della valuta prima dell'importo,
 * separatore migliaia punto, decimali virgola, nessuna cifra decimale.
 *
 * Supporta EUR, USD (€, $). Per altre valute usa il codice ISO come simbolo.
 *
 * @param decimals  numero di cifre decimali (default 0).
 */
export const formatCurrency = (
  value: number | null | undefined,
  currency: string,
  decimals = 0,
): string => {
  if (value === null || value === undefined) return '—';
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  return `${symbol} ${value.toLocaleString('it-IT', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

/**
 * Formatta una percentuale con segno (+5,25%).
 * Usa il separatore decimale italiano (virgola).
 */
export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

/**
 * Formatta una percentuale senza segno (5,25%).
 * Usa il separatore decimale italiano (virgola).
 */
export const formatPercentNoSign = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

/**
 * Formatta una data ISO in formato italiano (DD/MM/YYYY).
 */
export const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/**
 * Restituisce la classe CSS per il colore in base al segno del valore.
 */
export const gainColorClass = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'text-muted';
  if (value > 0) return 'text-bull';
  if (value < 0) return 'text-bear';
  return 'text-muted';
};

// Colori per gli asset type, coerenti con la pie chart in Allocation.tsx
const TYPE_COLORS: Record<string, string> = {
  STOCK: 'hsl(0, 70%, 50%)',        // rosso
  BOND: 'hsl(145, 60%, 50%)',       // verde
  COMMODITY: 'hsl(45, 85%, 50%)',   // giallo
  FUND: 'hsl(28, 75%, 50%)',        // arancione
  CASH: 'hsl(220, 65%, 50%)',       // blu
};

/**
 * Restituisce lo stile della label per un asset type.
 * Condiviso da Portfolio.tsx e Allocation.tsx (era duplicato).
 */
export const getAssetTypeStyle = (type: string) => {
  const color = TYPE_COLORS[type] || 'hsl(0, 0%, 50%)';
  const match = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (!match) return { bg: '#1e293b40', border: color, text: color };
  const [, h, s, l] = match;
  const sat = parseInt(s);
  const lum = parseInt(l);
  // Background: subtle tint at 25% lightness, 15% opacity
  const bgLum = Math.min(lum - 5, 28);
  const bg = `hsl(${h}, ${sat}%, ${bgLum}%, 0.18)`;
  // Border: slightly muted via saturation
  const borderLum = Math.max(lum - 5, 25);
  const borderColor = `hsl(${h}, ${sat}%, ${borderLum}%)`;
  // Text: stessa tonalità del bordo (come richiesto)
  const textColor = `hsl(${h}, ${sat}%, ${borderLum}%)`;
  return { bg, border: borderColor, text: textColor };
};