/**
 * Elenco centralizzato dei tipi di asset supportati.
 * Questo file è la SINGOLA FONTE DELLA VERITÀ per tutti i tipi di asset.
 * Backend e frontend devono importare da qui.
 *
 * @type {readonly string[]}
 */
export const ASSET_TYPES = Object.freeze([
  'ETF',
  'ETC',
  'ETN',
  'STOCK',
  'BOND',
  'FUND',
  'COMMODITY',
  'CASH',
  'UNKNOWN',
]);