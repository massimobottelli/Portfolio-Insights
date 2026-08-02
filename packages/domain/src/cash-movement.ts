/**
 * A financial movement affecting account liquidity.
 * Does NOT change asset ownership quantity.
 * Examples: dividends, commissions, tax withholdings.
 */
export type MovementType = 'DIVIDEND' | 'COMMISSION' | 'TAX' | 'COUPON' | 'FEE' | 'OTHER';

export interface CashMovement {
  readonly operationDate: Date;
  readonly valueDate: Date;
  readonly movementType: MovementType;
  readonly assetIsin?: string;
  readonly euroAmount: number;
  readonly currency: string;
  readonly currencyAmount?: number;
  readonly orderReference?: string;
}