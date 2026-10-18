/**
 * Mappa statica ISIN → simbolo EODHD per gli strumenti del portafoglio.
 *
 * Il simbolo EODHD è nel formato `TICKER.EXCHANGE` (es. "SXRS.XETRA") e identifica
 * la quotazione specifica detenuta. Fonte: mapping fornito dall'utente.
 *
 * Suffissi exchange su EODHD (verificati via /api/eod e /api/search):
 * - XETRA (Germania) → `.XETRA`  (NB: NON `.DE` — risponde 404)
 * - Euronext Parigi  → `.PA`
 * - London SE        → `.LSE`
 * - NYSE/Nasdaq      → `.US`
 *
 * Usata da:
 * - `database.js` (backfill di `assets.exchange` all'avvio del server + migrazione
 *   dei suffissi legacy `.DE`)
 * - `models/dailyPriceModel.js` (resolver dei simboli per l'import e l'aggiornamento)
 *
 * Solo lato server: mai esposta al frontend.
 */
export const EODHD_SYMBOLS_BY_ISIN = Object.freeze({
  IE00BQN1K901: 'IEVL.LSE', // LSE (EUR): coerente con lo storico CSV importato (ievl_uk); XETRA = CEMS
  US81642T2096: 'SLS.US',
  IE00BLDGHT92: 'UIQ4.XETRA',
  IE00BFMXXD54: 'VUAA.XETRA',
  LU0290358497: 'XEON.XETRA',
  IE0006WW1TQ4: 'EXUS.XETRA',
  LU2951555403: 'DBMFE.PA',
  IE00BDFL4P12: 'SXRS.XETRA',
});

/** Mappa inversa simbolo EODHD → ISIN (i simboli sono univoci nella mappa). */
export const EODHD_ISIN_BY_SYMBOL = Object.freeze(
  Object.fromEntries(
    Object.entries(EODHD_SYMBOLS_BY_ISIN).map(([isin, symbol]) => [symbol, isin])
  )
);
