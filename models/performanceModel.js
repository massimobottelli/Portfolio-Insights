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

// ──────────────────────────────────────────────
// calculateAnnualReturns
// ──────────────────────────────────────────────

/**
 * Aggregate daily returns into annual returns via compounding.
 *
 * Groups daily periodReturns by YYYY and compounds them:
 *   annualReturn = Π(1 + dailyReturn) - 1
 *
 * Reuses the same pattern as calculateMonthlyReturns(), just
 * grouping by year instead of year-month.
 *
 * @param {PortfolioReturnPoint[]} returnSeries - output of buildReturnSeries()
 * @returns {AnnualReturn[]} [{ year, return }] sorted ascending
 */
export function calculateAnnualReturns(returnSeries) {
  if (!returnSeries || returnSeries.length === 0) {
    return [];
  }

  // 1. Group by YYYY preserving chronological order
  /** @type {Map<string, number[]>} */
  const yearGroups = new Map();

  for (const r of returnSeries) {
    const yr = r.date.substring(0, 4); // "YYYY"
    if (!yearGroups.has(yr)) {
      yearGroups.set(yr, []);
    }
    yearGroups.get(yr).push(r.periodReturn);
  }

  // 2. Compound returns within each year
  /** @type {AnnualReturn[]} */
  const annual = [];

  // Keys are already in YYYY order from chronological input
  for (const [yr, returns] of yearGroups) {
    let compounded = 1;
    for (const pr of returns) {
      compounded *= 1 + pr;
    }
    annual.push({
      year: parseInt(yr, 10),
      return: compounded - 1,
    });
  }

  return annual;
}

/**
 * @typedef {Object} AnnualReturn
 * @property {number} year   - e.g. 2024
 * @property {number} return - compounded annual return (e.g. 0.0981 = +9.81%)
 */

// ──────────────────────────────────────────────
// calculatePeriodStats — pure helper
// ──────────────────────────────────────────────

/**
 * Calculate positive/negative/flat counts and rates for an array of returns.
 *
 * Zero is classified as FLAT, not negative (per design doc section 13).
 *
 * @param {number[]} returns - array of return values
 * @returns {{ positive: number, negative: number, flat: number, total: number, positiveRate: number, negativeRate: number }}
 */
function calculatePeriodStats(returns) {
  let positive = 0, negative = 0, flat = 0;

  for (const r of returns) {
    if (r > 0) positive++;
    else if (r < 0) negative++;
    else flat++;
  }

  const total = positive + negative + flat;

  return {
    positive,
    negative,
    flat,
    total,
    positiveRate: total > 0 ? positive / total : 0,
    negativeRate: total > 0 ? negative / total : 0,
  };
}

// ──────────────────────────────────────────────
// calculateBestWorst
// ──────────────────────────────────────────────

/**
 * Find best (max) and worst (min) periods from monthly and annual return series.
 *
 * If multiple periods share the same best/worst return, return the first chronologically.
 * Returns null values when arrays are empty.
 *
 * @param {MonthlyReturn[]} monthlyReturns
 * @param {AnnualReturn[]} annualReturns
 * @returns {{ month: { best: number|null, worst: number|null }, year: { best: number|null, worst: number|null } }}
 */
export function calculateBestWorst(monthlyReturns, annualReturns) {
  let bestMonth = null;
  let worstMonth = null;
  let bestYear = null;
  let worstYear = null;

  for (const m of monthlyReturns) {
    if (bestMonth === null || m.return > bestMonth) bestMonth = m.return;
    if (worstMonth === null || m.return < worstMonth) worstMonth = m.return;
  }

  for (const a of annualReturns) {
    if (bestYear === null || a.return > bestYear) bestYear = a.return;
    if (worstYear === null || a.return < worstYear) worstYear = a.return;
  }

  return {
    month: { best: bestMonth, worst: worstMonth },
    year: { best: bestYear, worst: worstYear },
  };
}

// ──────────────────────────────────────────────
// calculatePeriodStatsFromSeries
// ──────────────────────────────────────────────

/**
 * Calculate positive/negative/flat statistics for both monthly and annual returns.
 *
 * Extracts raw return values from the structured monthly/annual arrays and
 * delegates to calculatePeriodStats().
 *
 * @param {MonthlyReturn[]} monthlyReturns
 * @param {AnnualReturn[]} annualReturns
 * @returns {{ months: PeriodStats, years: PeriodStats }}
 */
export function calculatePeriodStatsFromSeries(monthlyReturns, annualReturns) {
  const monthlyRaw = monthlyReturns.map((m) => m.return);
  const annualRaw = annualReturns.map((a) => a.return);

  return {
    months: calculatePeriodStats(monthlyRaw),
    years: calculatePeriodStats(annualRaw),
  };
}

// ──────────────────────────────────────────────
// calculateMonthlyReturns
// ──────────────────────────────────────────────

/**
 * Aggregate daily returns into monthly returns via compounding.
 *
 * Groups daily periodReturns by YYYY-MM and compounds them:
 *   monthlyReturn = Π(1 + dailyReturn) - 1
 *
 * This is the foundational aggregation function reused by Phase 4
 * (annual returns + statistics). Zero return months are included
 * (not filtered out) because they matter for positive/negative counts.
 *
 * @param {PortfolioReturnPoint[]} returnSeries - output of buildReturnSeries()
 * @returns {MonthlyReturn[]} [{ year, month, return }] sorted ascending
 */
export function calculateMonthlyReturns(returnSeries) {
  if (!returnSeries || returnSeries.length === 0) {
    return [];
  }

  // 1. Group by YYYY-MM preserving chronological order
  /** @type {Map<string, number[]>} */
  const monthGroups = new Map();

  for (const r of returnSeries) {
    const ym = r.date.substring(0, 7); // "YYYY-MM"
    if (!monthGroups.has(ym)) {
      monthGroups.set(ym, []);
    }
    monthGroups.get(ym).push(r.periodReturn);
  }

  // 2. Compound returns within each month
  /** @type {MonthlyReturn[]} */
  const monthly = [];

  // Keys are already in YYYY-MM order from chronological input
  for (const [ym, returns] of monthGroups) {
    const [yearStr, monthStr] = ym.split('-');
    let compounded = 1;
    for (const pr of returns) {
      compounded *= 1 + pr;
    }
    monthly.push({
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
      return: compounded - 1,
    });
  }

  return monthly;
}

/**
 * @typedef {Object} MonthlyReturn
 * @property {number} year   - e.g. 2024
 * @property {number} month  - 1-12
 * @property {number} return - compounded monthly return (e.g. 0.021 = +2.1%)
 */

export default {
  buildReturnSeries,
  twrFromReturns,
  calculateCumulativePerformance,
  calculateCAGR,
  calculateAnnualReturns,
  calculateMonthlyReturns,
  calculateBestWorst,
  calculatePeriodStatsFromSeries,
  ANNUALIZATION_FACTOR,
};
