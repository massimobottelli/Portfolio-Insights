/**
 * Key Performance Indicators — all derived, never persisted.
 */
export interface KPIs {
  readonly totalPortfolioValue: number;
  readonly investedCapital: number;
  readonly availableCash: number;
  readonly totalProfitLoss: number;
  readonly totalProfitLossPercent: number;
}

/**
 * Calculates MVP1 KPIs from portfolio data.
 * totalProfitLoss = totalPortfolioValue - investedCapital
 */
export function calculateKPIs(
  totalPortfolioValue: number,
  investedCapital: number,
  availableCash: number,
): KPIs {
  const totalProfitLoss = totalPortfolioValue - investedCapital;
  const totalProfitLossPercent =
    investedCapital !== 0 ? (totalProfitLoss / investedCapital) * 100 : 0;

  return {
    totalPortfolioValue,
    investedCapital,
    availableCash,
    totalProfitLoss,
    totalProfitLossPercent,
  };
}