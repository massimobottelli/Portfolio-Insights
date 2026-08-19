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
// Annualization constant (centralized for all phases)
// ──────────────────────────────────────────────

/**
 * √365 because Directa provides snapshots on all calendar days
 * (not only trading days).
 */
export const ANNUALIZATION_FACTOR = Math.sqrt(365);

export default { buildReturnSeries, twrFromReturns, ANNUALIZATION_FACTOR };