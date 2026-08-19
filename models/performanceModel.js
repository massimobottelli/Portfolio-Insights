/**
 * Performance & Risk Analytics — Canonical Return Series Engine
 *
 * This module builds a single, authoritative daily return series from
 * `daily_portfolio_snapshots` + `cash_movements`. All downstream metrics
 * (CAGR, volatility, Sharpe, drawdown) derive exclusively from this series.
 *
 * Cash flow semantics (matching existing TWR in analyticsModel.js):
 *   - DEPOSIT  → negative sign (money deposited by owner, leaves bank account)
 *   - WITHDRAWAL → positive sign (withdrawals, enter bank account)
 *   - OTHER    → positive/negative (various transfers, refunds)
 *   - DIVIDEND / INTEREST / COMMISSION / TAX / STAMP_DUTY → EXCLUDED
 *     because they are already reflected in portfolio_value.
 */

import { db } from '../database.js';

// ──────────────────────────────────────────────
// Types (JSDoc for IDE support)
// ──────────────────────────────────────────────

/**
 * @typedef {Object} PortfolioReturnPoint
 * @property {string} date            - YYYY-MM-DD
 * @property {number} portfolioValue  - snapshot portfolio value on this date
 * @property {number} externalFlow    - net external cash flow on this date (normalized)
 * @property {number} periodReturn    - day-to-day return for this snapshot
 * @property {number} cumulativeReturn- TWR cumulative return up to this point
 */

// ──────────────────────────────────────────────
// buildReturnSeries
// ──────────────────────────────────────────────

/**
 * Build a canonical daily return series from portfolio snapshots + cash flows.
 *
 * The algorithm mirrors the existing TWR logic in analyticsModel.js:
 *   1. Load snapshots (optionally filtered by from/to).
 *   2. Load external cash flows (DEPOSIT / WITHDRAWAL / OTHER only).
 *   3. Iterate chronologically; at each snapshot with an external flow,
 *      close the current sub-period and start a new one.
 *   4. For each snapshot compute:
 *      - periodReturn: day-to-day incremental return
 *      - cumulativeReturn: TWR cumulative (multiplicative sub-period compounding)
 *
 * @param {{ from?: string, to?: string }} options - optional date range filter
 * @returns {PortfolioReturnPoint[]}
 */
export function buildReturnSeries({ from, to } = {}) {
  // 1. Load snapshots
  let query =
    'SELECT snapshot_date, portfolio_value FROM daily_portfolio_snapshots';
  const params = {};

  if (from || to) {
    query += ' WHERE 1=1';
    if (from) {
      query += ' AND snapshot_date >= :from';
      params.from = from;
    }
    if (to) {
      query += ' AND snapshot_date <= :to';
      params.to = to;
    }
  }
  query += ' ORDER BY snapshot_date ASC';

  const snapshots = db.prepare(query).all(params);

  if (snapshots.length < 1) {
    return [];
  }

  // 2. Load external cash flows (same logic as calculateTWR in analyticsModel.js)
  let flowQuery =
    "SELECT operation_date, euro_amount, movement_type FROM cash_movements " +
    "WHERE movement_type IN ('DEPOSIT', 'WITHDRAWAL', 'OTHER')";

  const flowParams = {};
  if (from || to) {
    flowQuery += ' AND 1=1';
    if (from) {
      flowQuery += ' AND operation_date >= :from';
      flowParams.from = from;
    }
    if (to) {
      flowQuery += ' AND operation_date <= :to';
      flowParams.to = to;
    }
  }
  flowQuery += ' ORDER BY operation_date ASC';

  const cashFlows = db.prepare(flowQuery).all(flowParams).map((cf) => ({
    date: cf.operation_date,
    // Normalize: DEPOSIT → negative, WITHDRAWAL → positive, OTHER → as-is
    amount:
      cf.movement_type === 'DEPOSIT'
        ? -cf.euro_amount
        : cf.euro_amount,
    type: cf.movement_type,
  }));

  // 3. Build flow map: date → net flow (sum if multiple on same day)
  const flowMap = {};
  for (const f of cashFlows) {
    flowMap[f.date] = (flowMap[f.date] || 0) + f.amount;
  }

  // 4. Build return series using TWR methodology
  /** @type {PortfolioReturnPoint[]} */
  const series = [];

  let subperiodStartValue = snapshots[0].portfolio_value;
  let cumulativeFactor = 1; // multiplicative TWR factor
  let prevValue = snapshots[0].portfolio_value;

  // First point: return = 0, cumulative = 0
  series.push({
    date: snapshots[0].snapshot_date,
    portfolioValue: snapshots[0].portfolio_value,
    externalFlow: flowMap[snapshots[0].snapshot_date] || 0,
    periodReturn: 0,
    cumulativeReturn: 0,
  });

  for (let i = 1; i < snapshots.length; i++) {
    const current = snapshots[i];
    const currentDate = current.snapshot_date;
    const currentValue = current.portfolio_value;
    const netFlow = flowMap[currentDate] || 0;

    let periodReturn;

    if (netFlow !== 0) {
      // External flow: close current sub-period and start a new one.
      // The sub-period return normalizes the flow impact.
      const subperiodReturn =
        (currentValue + netFlow - subperiodStartValue) / subperiodStartValue;

      // Compound the sub-period return into cumulative TWR.
      cumulativeFactor *= (1 + subperiodReturn);

      // New sub-period starts at the post-flow portfolio value.
      subperiodStartValue = currentValue;

      // Day-to-day periodReturn for the flow day:
      // We need the incremental return that, when compounded with previous
      // day-to-day returns, reproduces the TWR sub-period result.
      // Since cumulativeFactor already accounts for the full sub-period,
      // and prev day-to-day returns are already in cumulativeFactor,
      // we compute periodReturn as the TWR-style incremental.
      //
      // The key insight: on flow days, periodReturn represents the
      // sub-period's final incremental contribution.
      periodReturn = subperiodReturn;
    } else {
      // No flow: day-to-day incremental return within the current sub-period.
      periodReturn =
        prevValue > 0
          ? (currentValue - prevValue) / prevValue
          : 0;

      // Compound day-to-day return into cumulative TWR.
      cumulativeFactor *= (1 + periodReturn);
    }

    const cumulativeReturn = cumulativeFactor - 1;

    // Update prevValue for next day-to-day calculation.
    prevValue = currentValue;

    series.push({
      date: currentDate,
      portfolioValue: currentValue,
      externalFlow: netFlow,
      periodReturn,
      cumulativeReturn,
    });
  }

  return series;
}

// ──────────────────────────────────────────────
// twrFromReturns — TWR derivation from return series
// ──────────────────────────────────────────────

/**
 * Calculate total TWR from a return series.
 * Re-implements the TWR algorithm using the series data (externalFlow, portfolioValue).
 * Used for regression testing against the existing calculateTWR().
 *
 * @param {PortfolioReturnPoint[]} returns
 * @returns {number} TWR total (e.g. 0.10 = 10%)
 */
export function twrFromReturns(returns) {
  if (!returns || returns.length === 0) return 0;

  let cumulativeFactor = 1;
  let subperiodStartValue = returns[0].portfolioValue;

  for (let i = 1; i < returns.length; i++) {
    const current = returns[i];
    const netFlow = current.externalFlow || 0;

    if (netFlow !== 0) {
      // Close sub-period
      const subperiodReturn =
        (current.portfolioValue + netFlow - subperiodStartValue) / subperiodStartValue;
      cumulativeFactor *= (1 + subperiodReturn);
      subperiodStartValue = current.portfolioValue;
    }
  }

  // Final partial sub-period (from last flow to end)
  const last = returns[returns.length - 1];
  const partialReturn =
    subperiodStartValue > 0
      ? (last.portfolioValue - subperiodStartValue) / subperiodStartValue
      : 0;
  cumulativeFactor *= (1 + partialReturn);

  return cumulativeFactor - 1;
}

// ──────────────────────────────────────────────
// calculateCumulativePerformance
// ──────────────────────────────────────────────

/**
 * Build a normalized cumulative performance series from the canonical return series.
 *
 * The output series starts at value 1 (base) and compounds each periodReturn
 * multiplicatively. This is the primary input for both the UI line chart
 * (Phase 9) and the drawdown calculation (Phase 7).
 *
 * Uses the already-computed cumulativeReturn from buildReturnSeries() directly:
 *   value[n] = 1 + cumulativeReturn[n]
 *
 * @param {PortfolioReturnPoint[]} returnSeries - output of buildReturnSeries()
 * @returns {{ points: PerformancePoint[], cumulativeReturn: number }}
 */
export function calculateCumulativePerformance(returnSeries) {
  if (!returnSeries || returnSeries.length === 0) {
    return { points: [], cumulativeReturn: 0 };
  }

  /** @type {PerformancePoint[]} */
  const points = [];

  for (const r of returnSeries) {
    points.push({
      date: r.date,
      // 1 + cumulativeReturn gives us the multiplicative factor starting at 1
      value: 1 + r.cumulativeReturn,
    });
  }

  // cumulativeReturn is the last point's return relative to base (1)
  const cumulativeReturn = returnSeries[returnSeries.length - 1].cumulativeReturn;

  return { points, cumulativeReturn };
}

/**
 * @typedef {Object} PerformancePoint
 * @property {string} date    - YYYY-MM-DD
 * @property {number} value   - cumulative factor (1 = starting point)
 */

// ──────────────────────────────────────────────
// calculateCAGR
// ──────────────────────────────────────────────

/**
 * Calculate Compound Annual Growth Rate from the canonical return series.
 *
 * CAGR answers: "At what constant annual rate would the portfolio have grown?"
 * It uses the TWR-based cumulativeReturn (not raw end/start ratio) to normalize
 * external cash flows, ensuring consistency with all other metrics.
 *
 * Formula:
 *   years     = elapsedDays / 365.2425
 *   CAGR      = (1 + cumulativeTWR) ^ (1 / years) - 1
 *
 * @param {PortfolioReturnPoint[]} returnSeries - output of buildReturnSeries()
 * @returns {{ cagr: number|null, years: number|null, periodLessThanOneYear: boolean }}
 */
export function calculateCAGR(returnSeries) {
  // Edge case: need at least 2 points to compute a rate over time
  if (!returnSeries || returnSeries.length < 2) {
    return { cagr: null, years: null, periodLessThanOneYear: false };
  }

  const firstDate = new Date(returnSeries[0].date);
  const lastDate = new Date(returnSeries[returnSeries.length - 1].date);
  const elapsedDays = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

  // If all snapshots are on the same day, no time elapsed → cannot annualize
  if (elapsedDays <= 0) {
    return { cagr: null, years: 0, periodLessThanOneYear: true };
  }

  const years = elapsedDays / 365.2425;
  const cumulativeReturn = returnSeries[returnSeries.length - 1].cumulativeReturn;

  // CAGR undefined if cumulativeReturn ≤ -1 (portfolio lost 100%+ — mathematically invalid)
  if (cumulativeReturn <= -1) {
    return { cagr: null, years, periodLessThanOneYear: years < 1 };
  }

  const cagr = Math.pow(1 + cumulativeReturn, 1 / years) - 1;

  return {
    cagr,
    years,
    periodLessThanOneYear: years < 1,
  };
}

// ──────────────────────────────────────────────
// Annualization constant (centralized for all phases)
// ──────────────────────────────────────────────

/**
 * √365 because Directa provides snapshots on all calendar days
 * (not only trading days).
 */
export const ANNUALIZATION_FACTOR = Math.sqrt(365);

export default {
  buildReturnSeries,
  twrFromReturns,
  calculateCumulativePerformance,
  calculateCAGR,
  ANNUALIZATION_FACTOR,
};
