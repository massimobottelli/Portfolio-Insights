/**
 * External portfolio valuation imported from Directa for a specific date.
 * Represents reality at a given point in time — never calculated by the app.
 */
export interface DailyPortfolioSnapshot {
  readonly date: Date;
  readonly totalValue: number;
}