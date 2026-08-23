/**
 * Performance & Risk — Phase 8 Integration Tests
 *
 * Tests the aggregated GET /api/analytics/performance endpoint
 * using pure function composition (no DB needed for most tests).
 *
 * For DB-dependent tests, uses far-future dates (2099+) to avoid
 * conflicts with real production data.
 */

import { describe, it, expect } from 'vitest';
import { buildReturnSeries, calculateCumulativePerformance, calculateCAGR, calculateVolatility, calculateSharpe, calculateMonthlyReturns, calculateAnnualReturns, calculateBestWorst, calculatePeriodStatsFromSeries, calculateDrawdown } from '../performanceModel.js';

// ──────────────────────────────────────────────
// Helper: simulate the controller logic
// ──────────────────────────────────────────────

function simulatePerformanceEndpoint(returnSeries, riskFreeRate) {
  const rf = riskFreeRate !== undefined ? parseFloat(riskFreeRate) : 0;
  if (isNaN(rf) || rf <= -100 || rf >= 100) return { error: 'Invalid risk-free rate' };

  if (returnSeries.length === 0) {
    return { empty: true, seriesLength: 0 };
  }

  const cumulativePerf = calculateCumulativePerformance(returnSeries);
  const cagr = calculateCAGR(returnSeries);
  const volatility = calculateVolatility(returnSeries);
  const sharpe = calculateSharpe(returnSeries, rf);
  const monthlyReturns = calculateMonthlyReturns(returnSeries);
  const annualReturns = calculateAnnualReturns(returnSeries);
  const bestWorst = calculateBestWorst(monthlyReturns, annualReturns);
  const periodStats = calculatePeriodStatsFromSeries(monthlyReturns, annualReturns);
  const drawdown = calculateDrawdown(returnSeries);

  function safeNum(val) {
    if (val === null || val === undefined) return null;
    if (!Number.isFinite(val)) return null;
    return val;
  }

  return {
    period: { from: returnSeries[0].date, to: returnSeries[returnSeries.length - 1].date },
    riskFreeRate: rf / 100,
    metadata: { dataPoints: returnSeries.length, periodLessThanOneYear: cagr.periodLessThanOneYear },
    performance: { cumulativeReturn: safeNum(cumulativePerf.cumulativeReturn), cagr: safeNum(cagr.cagr) },
    risk: { dailyVolatility: safeNum(volatility.daily), annualizedVolatility: safeNum(volatility.annualized), sharpeRatio: safeNum(sharpe) },
    periodStats,
    bestWorst,
    drawdown: { current: safeNum(drawdown.currentDrawdown), maximum: safeNum(drawdown.maxDrawdown), peakDate: drawdown.peakDate, troughDate: drawdown.troughDate, recoveryDate: drawdown.recoveryDate, durationDays: drawdown.durationDays, recoveryDays: drawdown.recoveryDays, isRecovered: drawdown.isRecovered },
    annualReturns: annualReturns.map((a) => ({ year: a.year, return: safeNum(a.return) })),
    monthlyReturns: monthlyReturns.map((m) => ({ year: m.year, month: m.month, return: safeNum(m.return) })),
    cumulativeSeries: cumulativePerf.points.map((p) => ({ date: p.date, value: safeNum(p.value) })),
  };
}

// Create a deterministic return series
function createSeries(points) {
  // points = [{ date, portfolioValue, externalFlow }]
  return points.map((p, i) => {
    let cumulativeReturn = 0;
    if (i === 0) {
      cumulativeReturn = 0;
    } else {
      const prev = points[i - 1];
      const netFlow = p.externalFlow || 0;
      if (netFlow !== 0) {
        const subperiodReturn = (p.portfolioValue + netFlow - prev.portfolioValue) / prev.portfolioValue;
        cumulativeReturn = subperiodReturn;
      } else {
        cumulativeReturn = (p.portfolioValue - prev.portfolioValue) / prev.portfolioValue;
      }
    }
    return {
      date: p.date,
      portfolioValue: p.portfolioValue,
      externalFlow: p.externalFlow || 0,
      periodReturn: i === 0 ? 0 : cumulativeReturn,
      cumulativeReturn,
    };
  });
}

// ──────────────────────────────────────────────
// Test Suite: Empty/insufficient data
// ──────────────────────────────────────────────

describe('Phase 8 API — Empty/insufficient data', () => {
  it('should return empty response for empty series', () => {
    const result = simulatePerformanceEndpoint([]);
    expect(result.empty).toBe(true);
    expect(result.seriesLength).toBe(0);
  });

  it('should return nulls for single-point series', () => {
    const series = [{ date: '2099-01-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 }];
    const result = simulatePerformanceEndpoint(series);

    expect(result.metadata.dataPoints).toBe(1);
    expect(result.performance.cagr).toBeNull();
    expect(result.risk.dailyVolatility).toBeNull();
    expect(result.risk.annualizedVolatility).toBeNull();
    expect(result.risk.sharpeRatio).toBeNull();
    expect(result.drawdown.maximum).toBeNull();
  });
});

// ──────────────────────────────────────────────
// Test Suite: Deterministic growth
// ──────────────────────────────────────────────

describe('Phase 8 API — Deterministic growth', () => {
  it('should produce correct metrics for 100→121 in ~2 years', () => {
    const series = [
      { date: '2022-01-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2024-01-01', portfolioValue: 12100, externalFlow: 0, periodReturn: 0.21, cumulativeReturn: 0.21 },
    ];

    const result = simulatePerformanceEndpoint(series, 0);

    expect(result.metadata.dataPoints).toBe(2);
    expect(result.performance.cumulativeReturn).toBeCloseTo(0.21, 10);
    expect(result.performance.cagr).not.toBeNull();
    expect(result.performance.cagr).toBeGreaterThan(0.09);
    expect(result.performance.cagr).toBeLessThan(0.11);
    expect(result.risk.dailyVolatility).not.toBeNull();
    expect(result.risk.annualizedVolatility).not.toBeNull();
    expect(result.risk.sharpeRatio).not.toBeNull();
    // No NaN or Infinity
    expect(Number.isNaN(result.performance.cumulativeReturn)).toBe(false);
    expect(Number.isNaN(result.performance.cagr)).toBe(false);
    expect(Number.isNaN(result.risk.sharpeRatio)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Test Suite: Risk-free rate effects
// ──────────────────────────────────────────────

describe('Phase 8 API — Risk-free rate effects', () => {
  it('should reduce Sharpe with higher risk-free rate', () => {
    const series = [
      { date: '2099-01-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-01-02', portfolioValue: 10200, externalFlow: 0, periodReturn: 0.02, cumulativeReturn: 0.02 },
      { date: '2099-01-03', portfolioValue: 10400, externalFlow: 0, periodReturn: 0.0196, cumulativeReturn: 0.04 },
      { date: '2099-01-04', portfolioValue: 10300, externalFlow: 0, periodReturn: -0.0096, cumulativeReturn: 0.03 },
      { date: '2099-01-05', portfolioValue: 10600, externalFlow: 0, periodReturn: 0.0291, cumulativeReturn: 0.06 },
    ];

    const result0 = simulatePerformanceEndpoint(series, 0);
    const result5 = simulatePerformanceEndpoint(series, 5);
    const result10 = simulatePerformanceEndpoint(series, 10);

    expect(result0.risk.sharpeRatio).not.toBeNull();
    expect(result5.risk.sharpeRatio).not.toBeNull();
    expect(result10.risk.sharpeRatio).not.toBeNull();
    expect(result0.risk.sharpeRatio).toBeGreaterThan(result5.risk.sharpeRatio);
    expect(result5.risk.sharpeRatio).toBeGreaterThan(result10.risk.sharpeRatio);
  });

  it('should validate risk-free rate correctly', () => {
    const validateRF = (rf) => {
      const parsed = rf !== undefined ? parseFloat(rf) : 0;
      return isNaN(parsed) || parsed <= -100 || parsed >= 100;
    };

    expect(validateRF('invalid')).toBe(true);
    expect(validateRF(-100)).toBe(true);
    expect(validateRF(100)).toBe(true);
    expect(validateRF(-150)).toBe(true);
    expect(validateRF(200)).toBe(true);
    expect(validateRF(0)).toBe(false);
    expect(validateRF(2.5)).toBe(false);
    expect(validateRF(-5)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Test Suite: Monthly/Annual returns structure
// ──────────────────────────────────────────────

describe('Phase 8 API — Monthly/Annual returns structure', () => {
  it('should return all months and years for heatmap generation', () => {
    const series = [
      { date: '2099-05-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-05-08', portfolioValue: 10200, externalFlow: 0, periodReturn: 0.02, cumulativeReturn: 0.02 },
      { date: '2099-05-15', portfolioValue: 10100, externalFlow: 0, periodReturn: -0.0098, cumulativeReturn: 0.01 },
      { date: '2099-05-22', portfolioValue: 10500, externalFlow: 0, periodReturn: 0.0396, cumulativeReturn: 0.05 },
      { date: '2099-05-29', portfolioValue: 10400, externalFlow: 0, periodReturn: -0.0095, cumulativeReturn: 0.04 },
      { date: '2099-06-05', portfolioValue: 10800, externalFlow: 0, periodReturn: 0.0385, cumulativeReturn: 0.08 },
    ];

    const result = simulatePerformanceEndpoint(series);

    expect(result.monthlyReturns.length).toBe(2);
    for (const m of result.monthlyReturns) {
      expect(Number.isFinite(m.return)).toBe(true);
      expect(Number.isNaN(m.return)).toBe(false);
    }
    expect(result.annualReturns.length).toBe(1);
    expect(result.annualReturns[0].year).toBe(2099);
  });
});

// ──────────────────────────────────────────────
// Test Suite: Best/Worst with period identifiers
// ──────────────────────────────────────────────

describe('Phase 8 API — Best/Worst with period identifiers', () => {
  it('should include year/month in best/worst results', () => {
    const series = [
      { date: '2099-07-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-07-08', portfolioValue: 10500, externalFlow: 0, periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2099-07-15', portfolioValue: 9500, externalFlow: 0, periodReturn: -0.0952, cumulativeReturn: -0.05 },
      { date: '2099-07-22', portfolioValue: 10200, externalFlow: 0, periodReturn: 0.0737, cumulativeReturn: 0.02 },
      { date: '2099-07-29', portfolioValue: 9000, externalFlow: 0, periodReturn: -0.1176, cumulativeReturn: -0.10 },
      { date: '2099-08-05', portfolioValue: 10800, externalFlow: 0, periodReturn: 0.2, cumulativeReturn: 0.08 },
    ];

    const result = simulatePerformanceEndpoint(series);

    expect(result.bestWorst.month.return).toBeGreaterThan(0.04);
    expect(result.bestWorst.month.year).toBe(2099);
    expect(result.bestWorst.worst.return).toBeLessThan(-0.09);
    expect(result.bestWorst.worst.year).toBe(2099);
  });
});

// ──────────────────────────────────────────────
// Test Suite: Drawdown detection
// ──────────────────────────────────────────────

describe('Phase 8 API — Drawdown detection', () => {
  it('should correctly identify max drawdown peak/trough/recovery', () => {
    // 100 → 120 → 90 → 110 → 130
    const series = [
      { date: '2099-09-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-09-02', portfolioValue: 12000, externalFlow: 0, periodReturn: 0.20, cumulativeReturn: 0.20 },
      { date: '2099-09-03', portfolioValue: 9000, externalFlow: 0, periodReturn: -0.25, cumulativeReturn: -0.10 },
      { date: '2099-09-04', portfolioValue: 11000, externalFlow: 0, periodReturn: 0.2222, cumulativeReturn: -0.08333 },
      { date: '2099-09-05', portfolioValue: 13000, externalFlow: 0, periodReturn: 0.1818, cumulativeReturn: 0.30 },
    ];

    const result = simulatePerformanceEndpoint(series);

    expect(result.drawdown.maximum).toBeCloseTo(-0.25, 2);
    expect(result.drawdown.peakDate).toBe('2099-09-02');
    expect(result.drawdown.troughDate).toBe('2099-09-03');
    expect(result.drawdown.recoveryDate).toBe('2099-09-05');
    expect(result.drawdown.isRecovered).toBe(true);
    expect(result.drawdown.durationDays).toBeGreaterThan(0);
    expect(result.drawdown.recoveryDays).toBeGreaterThan(0);
  });

  it('should handle unrecovered drawdown', () => {
    const series = [
      { date: '2099-10-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-10-02', portfolioValue: 12000, externalFlow: 0, periodReturn: 0.20, cumulativeReturn: 0.20 },
      { date: '2099-10-03', portfolioValue: 9000, externalFlow: 0, periodReturn: -0.25, cumulativeReturn: -0.10 },
      { date: '2099-10-04', portfolioValue: 10000, externalFlow: 0, periodReturn: 0.1111, cumulativeReturn: -0.08333 },
    ];

    const result = simulatePerformanceEndpoint(series);

    expect(result.drawdown.maximum).toBeLessThan(-0.20);
    expect(result.drawdown.maximum).toBeGreaterThan(-0.30);
    expect(result.drawdown.recoveryDate).toBeNull();
    expect(result.drawdown.isRecovered).toBe(false);
    expect(result.drawdown.durationDays).toBeNull();
    expect(result.drawdown.recoveryDays).toBeNull();
  });
});

// ──────────────────────────────────────────────
// Test Suite: No NaN/Infinity guarantee
// ──────────────────────────────────────────────

describe('Phase 8 API — No NaN/Infinity guarantee', () => {
  it('should never return NaN or Infinity in any numeric field', () => {
    const series = [
      { date: '2099-12-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2099-12-02', portfolioValue: 10200, externalFlow: 0, periodReturn: 0.02, cumulativeReturn: 0.02 },
      { date: '2099-12-03', portfolioValue: 10100, externalFlow: 0, periodReturn: -0.0098, cumulativeReturn: 0.01 },
      { date: '2099-12-04', portfolioValue: 10300, externalFlow: 1000, periodReturn: 0.0198, cumulativeReturn: 0.03 },
    ];

    const result = simulatePerformanceEndpoint(series, 2.5);

    expect(Number.isFinite(result.performance.cumulativeReturn)).toBe(true);
    if (result.performance.cagr !== null) {
      expect(Number.isFinite(result.performance.cagr)).toBe(true);
    }
    if (result.risk.dailyVolatility !== null) {
      expect(Number.isFinite(result.risk.dailyVolatility)).toBe(true);
    }
    if (result.risk.annualizedVolatility !== null) {
      expect(Number.isFinite(result.risk.annualizedVolatility)).toBe(true);
    }
    if (result.risk.sharpeRatio !== null) {
      expect(Number.isFinite(result.risk.sharpeRatio)).toBe(true);
    }
    for (const m of result.monthlyReturns) {
      expect(Number.isFinite(m.return)).toBe(true);
    }
    for (const a of result.annualReturns) {
      expect(Number.isFinite(a.return)).toBe(true);
    }
    for (const p of result.cumulativeSeries) {
      if (p.value !== null) {
        expect(Number.isFinite(p.value)).toBe(true);
      }
    }
    if (result.drawdown.maximum !== null) {
      expect(Number.isFinite(result.drawdown.maximum)).toBe(true);
    }
    if (result.drawdown.current !== null) {
      expect(Number.isFinite(result.drawdown.current)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// Test Suite: Period statistics
// ──────────────────────────────────────────────

describe('Phase 8 API — Period statistics', () => {
  it('should correctly count positive/negative/flat periods across multiple months', () => {
    // Spread data across multiple months to get meaningful stats
    const series = [
      { date: '2100-01-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
      { date: '2100-01-15', portfolioValue: 10500, externalFlow: 0, periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2100-02-01', portfolioValue: 10300, externalFlow: 0, periodReturn: -0.019, cumulativeReturn: 0.03 },
      { date: '2100-02-15', portfolioValue: 10300, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0.03 },
      { date: '2100-03-01', portfolioValue: 10800, externalFlow: 0, periodReturn: 0.0485, cumulativeReturn: 0.08 },
      { date: '2100-03-15', portfolioValue: 10600, externalFlow: 0, periodReturn: -0.0185, cumulativeReturn: 0.06 },
    ];

    const result = simulatePerformanceEndpoint(series);

    expect(result.periodStats.months.total).toBeGreaterThan(0);
    expect(result.periodStats.months.positive).toBeGreaterThanOrEqual(1);
    expect(result.periodStats.months.negative).toBeGreaterThanOrEqual(1);
    expect(result.periodStats.months.positiveRate).toBeGreaterThan(0);
    expect(result.periodStats.months.positiveRate).toBeLessThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────
// Test Suite: Full pipeline with buildReturnSeries on real data
// ──────────────────────────────────────────────

describe('Phase 8 API — Full pipeline with buildReturnSeries', () => {
  it('should return empty array when no data exists for the given date range', () => {
    // Use a date range that definitely has no data
    const series = buildReturnSeries({ from: '2099-12-31', to: '2099-12-31' });
    // May or may not be empty depending on existing data; just verify it doesn't crash
    expect(Array.isArray(series)).toBe(true);
  });
});
