/**
 * A market operation that changes the quantity owned of an Asset.
 * Immutable after import. BUY increases position quantity, SELL decreases it.
 * Fees and taxes are NOT MarketOrders — they are CashMovements.
 */
export type OrderType = 'BUY' | 'SELL';

export interface MarketOrder {
  readonly operationDate: Date;
  readonly valueDate: Date;
  readonly assetIsin: string;
  readonly type: OrderType;
  readonly quantity: number;
  readonly euroAmount: number;
  readonly currency: string;
  readonly currencyAmount?: number;
  readonly orderReference?: string;
}