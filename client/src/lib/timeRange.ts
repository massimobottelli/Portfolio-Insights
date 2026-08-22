/**
 * Filtro temporale condiviso tra Dashboard e Performance.
 * Estratto da Dashboard.tsx e performanceApi.ts dove era duplicato
 * (due copie dello stesso codice potevano divergere).
 */

export type TimeRange = '1m' | '3m' | '6m' | '1y' | 'ytd' | 'all';

export const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
];

/**
 * Calcola la data di cutoff in base al filtro selezionato.
 * Restituisce una stringa ISO (YYYY-MM-DD) da confrontare con snapshot_date,
 * o null per il range "all" (nessun filtro).
 */
export function getCutoffDate(range: TimeRange): string | null {
  const now = new Date();
  const fmt = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  switch (range) {
    case '1m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return fmt(d);
    }
    case '3m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return fmt(d);
    }
    case '6m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 180);
      return fmt(d);
    }
    case '1y': {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      return fmt(d);
    }
    case 'ytd':
      return `${now.getFullYear()}-01-01`;
    case 'all':
      return null;
  }
}