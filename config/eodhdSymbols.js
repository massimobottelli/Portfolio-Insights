/**
 * Mappa statica ISIN → simbolo EODHD per gli strumenti del portafoglio.
 *
 * Il simbolo EODHD è nel formato `TICKER.EXCHANGE` (es. "SXRS.DE") e identifica
 * la quotazione specifica detenuta. Fonte: mapping fornito dall'utente.
 *
 * Usata da:
 * - `database.js` (backfill di `assets.exchange` all'avvio del server)
 * - `models/dailyPriceModel.js` (resolver dei simboli per l'import e l'aggiornamento)
 *
 * Solo lato server: mai esposta al frontend.
 */
export const EODHD_SYMBOLS_BY_ISIN = Object.freeze({
  IE00BQN1K901: 'IEVL.DE',
  US81642T2096: 'SLS.US',
  IE00BLDGHT92: 'UIQ4.DE',
  IE00BFMXXD54: 'VUAA.DE',
  LU0290358497: 'XEON.DE',
  IE0006WW1TQ4: 'EXUS.DE',
  LU2951555403: 'DBMFE.PA',
  IE00BDFL4P12: 'SXRS.DE',
});

/** Mappa inversa simbolo EODHD → ISIN (i simboli sono univoci nella mappa). */
export const EODHD_ISIN_BY_SYMBOL = Object.freeze(
  Object.fromEntries(
    Object.entries(EODHD_SYMBOLS_BY_ISIN).map(([isin, symbol]) => [symbol, isin])
  )
);
