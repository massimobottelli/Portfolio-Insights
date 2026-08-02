/**
 * Financial instrument identity.
 * ISIN is the natural identifier and is immutable.
 * Asset does NOT contain quantity, price, or performance data.
 */
export type AssetType = 'ETF' | 'ETC' | 'ETN' | 'STOCK' | 'BOND' | 'FUND' | 'UNKNOWN';

export interface Asset {
  readonly isin: string;
  readonly ticker: string;
  readonly name: string;
  readonly currency: string;
  readonly assetType: AssetType;
  readonly exchange?: string;
  readonly directaCode?: string;
}