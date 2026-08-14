/**
 * Elenco centralizzato dei tipi di asset supportati.
 * Allineato alla tabella DB `asset_types`.
 */
export declare const ASSET_TYPES: readonly [
  'BOND', 'STOCK', 'CASH', 'FUND', 'COMMODITY', 'UNKNOWN'
];

/**
 * Tipi target-abili (escludono UNKNOWN).
 */
export declare const TARGETABLE_ASSET_TYPES: readonly [
  'BOND', 'STOCK', 'CASH', 'FUND', 'COMMODITY'
];