import type { CashMovement } from '@portfolio/domain';
import type { Position } from './positions';

export interface PortfolioValue {
  readonly investedCapital: number;
  readonly availableCash: number;
}

/**
 * Calculates invested capital from positions.
 * In MVP1, invested capital is derived from BUY order totals.
 * Cash balance is derived from CashMovements (dividends - commissions - taxes).
 */
export function calculatePortfolioValue(
  buyOrdersTotal: number,
  cashMovements: readonly CashMovement[],
): PortfolioValue {
  const availableCash = cashMovements.reduce((sum, m) => sum + m.euroAmount, 0);

  return {
    investedCapital: buyOrdersTotal,
    availableCash,
  };
}