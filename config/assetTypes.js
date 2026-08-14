/**
 * Elenco centralizzato dei tipi di asset supportati.
 * Questo file è la SINGOLA FONTE DELLA VERITÀ per tutti i tipi di asset.
 * Backend e frontend devono importare da qui.
 *
 * Il catalogo è allineato alla tabella DB `asset_types`:
 * - 5 tipi target-abili: BOND, STOCK, CASH, FUND, COMMODITY
 * - UNKNOWN: tipo tecnico per nuove importazioni, NON target-abile
 *
 * I tipi ETF, ETC, ETN sono stati decommissionati (migrati a UNKNOWN).
 *
 * @type {readonly string[]}
 */
export const ASSET_TYPES = Object.freeze([
  'BOND',
  'STOCK',
  'CASH',
  'FUND',
  'COMMODITY',
  'UNKNOWN',
]);

/**
 * Tipi target-abili (escludono UNKNOWN).
 * @type {readonly string[]}
 */
export const TARGETABLE_ASSET_TYPES = Object.freeze([
  'BOND',
  'STOCK',
  'CASH',
  'FUND',
  'COMMODITY',
]);