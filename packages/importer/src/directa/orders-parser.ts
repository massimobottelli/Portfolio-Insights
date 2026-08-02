import type { MarketOrder, CashMovement } from '@portfolio/domain';
import { z } from 'zod';

/**
 * Zod schema for a market order row in the Directa Historical Orders CSV.
 */
const marketOrderRowSchema = z.object({
  operationDate: z.string().min(1),
  valueDate: z.string().min(1),
  isin: z.string().min(1),
  type: z.enum(['BUY', 'SELL']),
  quantity: z.number().positive(),
  euroAmount: z.number(),
  currency: z.string().min(1),
  orderReference: z.string().optional(),
});

export interface OrdersParseResult {
  readonly orders: readonly MarketOrder[];
  readonly cashMovements: readonly CashMovement[];
}

/**
 * Parses a Directa Historical Orders CSV file.
 * Classifies each row as either a MarketOrder or CashMovement based on
 * the domain rule: changes quantity → MarketOrder, otherwise → CashMovement.
 */
export function parseDirectaOrders(csvContent: string): OrdersParseResult {
  // Placeholder — full CSV parsing logic will be implemented in EPIC 4
  // For now, establishes the contract: Raw CSV → Domain Orders + CashMovements
  return {
    orders: [],
    cashMovements: [],
  };
}