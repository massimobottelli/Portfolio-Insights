/**
 * Performance & Risk — Phase 5/6/8 Controller
 *
 * Individual endpoints for volatility and Sharpe ratio (debugging during development).
 * Consolidated into a single aggregated endpoint in Phase 8.
 */

import {
  buildReturnSeries,
  calculateVolatility,
  calculateSharpe,
  calculateCumulativePerformance,
  calculateCAGR,
  calculateMonthlyReturns,
  calculateAnnualReturns,
  calculateBestWorst,
  calculatePeriodStatsFromSeries,
  calculateDrawdown,
} from '../models/performanceModel.js';

/**
 * GET /api/analytics/volatility
 * Query params: from (optional), to (optional)
 *
 * Returns daily and annualized volatility from the canonical return series.
 */
export function getVolatility(req, res) {
  try {
    const { from, to } = req.query;
    const series = buildReturnSeries({ from: from || undefined, to: to || undefined });
    const volatility = calculateVolatility(series);

    if (series.length === 0) {
      return res.json({ daily: null, annualized: null, dataPoints: 0 });
    }

    res.json({
      ...volatility,
      dataPoints: series.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo della volatilità', details: error.message });
  }
}

/**
 * GET /api/analytics/sharpe
 * Query params: from (optional), to (optional), riskFreeRate (default: 0)
 *
 * Returns the Sharpe ratio for a given annual risk-free rate.
 * The risk-free rate is validated and must be numeric within -100% to +100%.
 */
export function getSharpe(req, res) {
  try {
    const { from, to, riskFreeRate } = req.query;

    // Validate riskFreeRate: must be numeric, range -100 < rate < 100
    const rf = riskFreeRate !== undefined ? parseFloat(riskFreeRate) : 0;
    if (isNaN(rf) || rf <= -100 || rf >= 100) {
      return res.status(400).json({ error: 'Invalid risk-free rate' });
    }

    const series = buildReturnSeries({ from: from || undefined, to: to || undefined });
    const sharpe = calculateSharpe(series, rf);

    if (series.length === 0) {
      return res.json({ sharpeRatio: null, dataPoints: 0, riskFreeRate: rf });
    }

    res.json({
      sharpeRatio: sharpe,
      dataPoints: series.length,
      riskFreeRate: rf,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo dello Sharpe ratio', details: error.message });
  }
}

/**
 * GET /api/analytics/performance
 * Query params:
 *   - from (optional): start date (YYYY-MM-DD)
 *   - to (optional): end date (YYYY-MM-DD)
 *   - riskFreeRate (optional): annual risk-free rate in % (default: 0)
 *
 * Returns ALL performance & risk metrics in a single response.
 * This is the consolidated endpoint for Phase 8.
 */
export function getPerformanceAnalytics(req, res) {
  try {
    const { from, to, riskFreeRate } = req.query;

    // Validate riskFreeRate
    const rf = riskFreeRate !== undefined ? parseFloat(riskFreeRate) : 0;
    if (isNaN(rf) || rf <= -100 || rf >= 100) {
      return res.status(400).json({ error: 'Invalid risk-free rate' });
    }

    // Build canonical return series (single DB read)
    const series = buildReturnSeries({ from: from || undefined, to: to || undefined });

    // Handle empty data
    if (series.length === 0) {
      return res.json({
        period: { from: from || null, to: to || null, days: 0 },
        riskFreeRate: rf / 100,
        metadata: { dataPoints: 0, hasGaps: false, periodLessThanOneYear: false },
        performance: { cumulativeReturn: 0, cagr: null },
        risk: { dailyVolatility: null, annualizedVolatility: null, sharpeRatio: null },
        periodStats: { months: { positive: 0, negative: 0, flat: 0, total: 0, positiveRate: 0 }, years: { positive: 0, negative: 0, flat: 0, total: 0, positiveRate: 0 } },
        bestWorst: { month: { year: null, month: null, return: null }, worst: { year: null, month: null, return: null }, year: { year: null, return: null }, worstYear: { year: null, return: null } },
        drawdown: { current: null, maximum: null, peakDate: null, troughDate: null, recoveryDate: null, durationDays: null, recoveryDays: null, isRecovered: false },
        annualReturns: [],
        monthlyReturns: [],
        cumulativeSeries: [],
      });
    }

    // Compute ALL metrics from the same series (consistency guarantee)
    const cumulativePerf = calculateCumulativePerformance(series);
    const cagr = calculateCAGR(series);
    const volatility = calculateVolatility(series);
    const sharpe = calculateSharpe(series, rf);
    const monthlyReturns = calculateMonthlyReturns(series);
    const annualReturns = calculateAnnualReturns(series);
    const bestWorst = calculateBestWorst(monthlyReturns, annualReturns);
    const periodStats = calculatePeriodStatsFromSeries(monthlyReturns, annualReturns);
    const drawdown = calculateDrawdown(series);

    // Calculate actual days in the period
    const firstDate = new Date(series[0].date);
    const lastDate = new Date(series[series.length - 1].date);
    const days = Math.round((lastDate - firstDate) / (1000 * 60 * 60 * 24));

    // Check for gaps in the data (missing dates between consecutive snapshots)
    let hasGaps = false;
    if (series.length > 1) {
      for (let i = 1; i < series.length && !hasGaps; i++) {
        const prev = new Date(series[i - 1].date);
        const curr = new Date(series[i].date);
        const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diffDays > 2) { // Allow 1 day (weekend/holiday), flag larger gaps
          hasGaps = true;
        }
      }
    }

    // Sanitize output: ensure no NaN or Infinity values
    function safeNum(val) {
      if (val === null || val === undefined) return null;
      if (!Number.isFinite(val)) return null;
      return val;
    }

    res.json({
      period: {
        from: series[0].date,
        to: series[series.length - 1].date,
        days,
      },
      riskFreeRate: rf / 100, // Store as decimal (2.5% → 0.025)
      metadata: {
        dataPoints: series.length,
        hasGaps,
        periodLessThanOneYear: cagr.periodLessThanOneYear,
      },
      performance: {
        cumulativeReturn: safeNum(cumulativePerf.cumulativeReturn),
        cagr: safeNum(cagr.cagr),
      },
      risk: {
        dailyVolatility: safeNum(volatility.daily),
        annualizedVolatility: safeNum(volatility.annualized),
        sharpeRatio: safeNum(sharpe),
      },
      periodStats: {
        months: {
          positive: periodStats.months.positive,
          negative: periodStats.months.negative,
          flat: periodStats.months.flat,
          total: periodStats.months.total,
          positiveRate: safeNum(periodStats.months.positiveRate),
        },
        years: {
          positive: periodStats.years.positive,
          negative: periodStats.years.negative,
          flat: periodStats.years.flat,
          total: periodStats.years.total,
          positiveRate: safeNum(periodStats.years.positiveRate),
        },
      },
      bestWorst: {
        month: {
          year: bestWorst.month.year,
          month: bestWorst.month.month,
          return: safeNum(bestWorst.month.return),
        },
        worst: {
          year: bestWorst.worst.year,
          month: bestWorst.worst.month,
          return: safeNum(bestWorst.worst.return),
        },
        year: {
          year: bestWorst.year.year,
          return: safeNum(bestWorst.year.return),
        },
        worstYear: {
          year: bestWorst.worstYear.year,
          return: safeNum(bestWorst.worstYear.return),
        },
      },
      drawdown: {
        current: safeNum(drawdown.currentDrawdown),
        maximum: safeNum(drawdown.maxDrawdown),
        peakDate: drawdown.peakDate,
        troughDate: drawdown.troughDate,
        recoveryDate: drawdown.recoveryDate,
        durationDays: drawdown.durationDays,
        recoveryDays: drawdown.recoveryDays,
        isRecovered: drawdown.isRecovered,
      },
      annualReturns: annualReturns.map((a) => ({
        year: a.year,
        return: safeNum(a.return),
      })),
      monthlyReturns: monthlyReturns.map((m) => ({
        year: m.year,
        month: m.month,
        return: safeNum(m.return),
      })),
      cumulativeSeries: cumulativePerf.points.map((p) => ({
        date: p.date,
        value: safeNum(p.value),
      })),
    });
  } catch (error) {
    console.error('Performance analytics error:', error);
    res.status(500).json({ error: 'Errore nel calcolo delle metriche di performance', details: error.message });
  }
}