import type { MarketOrder } from '@portfolio/domain';

/**
 * Current holding of an Asset — derived, never persisted.
 */
export interface Position {
  readonly isin: string;
  readonly quantity: number;
}

/**
 * Calculates current positions from MarketOrders.
 * BUY adds quantity, SELL subtracts. Zero-quantity positions are excluded.
 */
export function calculatePositions(orders: readonly MarketOrder[]): Position[] {
  const quantityMap = new Map<string, number>();

  for (const order of orders) {
    const current = quantityMap.get(order.assetIsin) ?? 0;
    const delta = order.type === 'BUY' ? order.quantity : -order.quantity;
    quantityMap.set(order.assetIsin, current + delta);
  }

  const positions: Position[] = [];
  for (const [isin, quantity] of quantityMap) {
    if (quantity !== 0) {
      positions.push({ isin, quantity });
    }
  }

  return positions;
}