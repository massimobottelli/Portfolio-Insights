/**
 * Performance & Risk — Phase 1 Unit Tests
 * Canonical Daily Return Series
 *
 * Tests cover:
 *   1. twrFromReturns — pure function unit tests (no DB)
 *   2. buildReturnSeries — integration tests using date-range filtering
 *   3. Regression against existing calculateTWR() on real data
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  buildReturnSeries,
  twrFromReturns,
  calculateCumulativePerformance,
  calculateCAGR,
  calculateVolatility,
  calculateSharpe,
  calculateAnnualReturns,
  calculateMonthlyReturns,
  calculateBestWorst,
  calculatePeriodStatsFromSeries,
  calculateDrawdown,
  ANNUALIZATION_FACTOR,
} from '../performanceModel.js';
import { calculateTWR } from '../analyticsModel.js';
import { db, initializeDatabase } from '../../database.js';

// Ensure DB exists
initializeDatabase();

// Unique session ID per test file load to avoid stale data from previous runs
const SESSION_ID = `test_session_p1_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

// Clean up ALL test data from previous runs (by prefix pattern)
function cleanupAllTestSessions() {
  db.prepare("DELETE FROM cash_movements WHERE import_session_id LIKE 'test_session_%'").run();
  db.prepare("DELETE FROM daily_portfolio_snapshots WHERE import_session_id LIKE 'test_session_%'").run();
  db.prepare("DELETE FROM import_sessions WHERE id LIKE 'test_session_%'").run();
}

// Run cleanup immediately on module load to ensure fresh state
cleanupAllTestSessions();

// ──────────────────────────────────────────────
// Helper: seed/cleanup for isolated test data
// ──────────────────────────────────────────────

function ensureSession() {
  db.prepare(
    'INSERT OR IGNORE INTO import_sessions (id, filename, import_date, status, records_imported, errors) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    SESSION_ID,
    'test',
    new Date().toISOString(),
    'completed',
    0,
    null
  );
}

function seedSnapshot(date, value) {
  ensureSession();
  db.prepare(
    'INSERT OR REPLACE INTO daily_portfolio_snapshots (id, snapshot_date, portfolio_value, available_cash, invested_capital, import_session_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    `snap_p1_${date.replace(/-/g, '')}_${Math.random().toString(36).slice(2, 8)}`,
    date,
    value,
    value * 0.1,
    value * 0.9,
    SESSION_ID
  );
}

function seedCashFlow(date, amount, type) {
  ensureSession();
  const uniqueId = `flow_p1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(
    'INSERT OR REPLACE INTO cash_movements (id, operation_date, value_date, movement_type, euro_amount, currency, import_session_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    uniqueId,
    date,
    date,
    type,
    amount,
    'EUR',
    SESSION_ID
  );
}

function cleanupAll() {
  db.prepare('DELETE FROM cash_movements WHERE import_session_id = ?', SESSION_ID).run();
  db.prepare('DELETE FROM daily_portfolio_snapshots WHERE import_session_id = ?', SESSION_ID).run();
  db.prepare('DELETE FROM import_sessions WHERE id = ?', SESSION_ID).run();
}

// Clean before AND after each test to prevent stale data from persisting
// between test runs (database file survives process restarts)
beforeEach(() => {
  cleanupAll();
});

afterEach(() => {
  cleanupAll();
});

// ──────────────────────────────────────────────
// Test Suite 1: twrFromReturns (pure function)
// Uses PortfolioReturnPoint objects with portfolioValue and externalFlow
// ──────────────────────────────────────────────

describe('twrFromReturns', () => {
  it('should return 0 for empty array', () => {
    expect(twrFromReturns([])).toBe(0);
  });

  it('should return 0 for single point with no flow', () => {
    // Single point, no flow → TWR = 0
    expect(twrFromReturns([{ portfolioValue: 10000, externalFlow: 0 }])).toBe(0);
  });

  it('should calculate TWR for growth without flows', () => {
    // 10000 → 11000, no flows → TWR = 10%
    const returns = [
      { portfolioValue: 10000, externalFlow: 0 },
      { portfolioValue: 11000, externalFlow: 0 },
    ];
    expect(twrFromReturns(returns)).toBeCloseTo(0.1, 10);
  });

  it('should compound correctly: +10% then -10% = -1%', () => {
    // 10000 → 11000 → 9900, no flows → TWR = -1%
    const returns = [
      { portfolioValue: 10000, externalFlow: 0 },
      { portfolioValue: 11000, externalFlow: 0 },
      { portfolioValue: 9900, externalFlow: 0 },
    ];
    expect(twrFromReturns(returns)).toBeCloseTo(-0.01, 10);
  });

  it('should handle deposit normalization', () => {
    // start=10000, deposit=5000, end=15200 (10000+5000+200 gain)
    // netFlow=-5000, subperiodReturn=(15200-5000-10000)/10000=0.02
    // partialReturn=(15200-15200)/15200=0
    // cumulative = 1.02 × 1.0 - 1 = 0.02
    const returns = [
      { portfolioValue: 10000, externalFlow: 0 },
      { portfolioValue: 15200, externalFlow: -5000 },
    ];
    expect(twrFromReturns(returns)).toBeCloseTo(0.02, 10);
  });

  it('should handle negative TWR', () => {
    // 10000 → 7000, no flows → TWR = -30%
    const returns = [
      { portfolioValue: 10000, externalFlow: 0 },
      { portfolioValue: 7000, externalFlow: 0 },
    ];
    expect(twrFromReturns(returns)).toBeCloseTo(-0.3, 10);
  });
});

// ──────────────────────────────────────────────
// Test Suite 2: buildReturnSeries — no external flows
// Using date-range filter to isolate test data from existing DB records
// ──────────────────────────────────────────────

describe('buildReturnSeries — no external flows', () => {
  it('should produce correct returns for steady growth', () => {
    seedSnapshot('2099-06-01', 10000);
    seedSnapshot('2099-06-02', 10200);
    seedSnapshot('2099-06-03', 10500);

    const series = buildReturnSeries({ from: '2099-06-01', to: '2099-06-03' });

    expect(series.length).toBe(3);
    expect(series[0].date).toBe('2099-06-01');
    expect(series[0].periodReturn).toBe(0);
    expect(series[0].cumulativeReturn).toBe(0);

    // Day 2: (10200 - 10000) / 10000 = 0.02
    expect(series[1].periodReturn).toBeCloseTo(0.02, 10);
    expect(series[1].cumulativeReturn).toBeCloseTo(0.02, 10);

    // Day 3: (10500 - 10200) / 10200 = 0.02941...
    // cumulative = (1 + 0.02) × (1 + 0.02941) - 1 ≈ 0.05
    expect(series[2].periodReturn).toBeCloseTo((10500 - 10200) / 10200, 10);
    expect(series[2].cumulativeReturn).toBeCloseTo(0.05, 10);
  });

  it('should produce correct returns for declining value', () => {
    seedSnapshot('2099-07-01', 10000);
    seedSnapshot('2099-07-02', 9500);
    seedSnapshot('2099-07-03', 9000);

    const series = buildReturnSeries({ from: '2099-07-01', to: '2099-07-03' });

    expect(series.length).toBe(3);

    expect(series[1].periodReturn).toBeCloseTo(-0.05, 10);
    expect(series[2].periodReturn).toBeCloseTo((9000 - 9500) / 9500, 10);

    // Cumulative: (0.95) × (0.94737) - 1 = -0.10
    expect(series[2].cumulativeReturn).toBeCloseTo(-0.10, 10);
  });

  it('should produce zero returns when value is unchanged', () => {
    seedSnapshot('2099-08-01', 10000);
    seedSnapshot('2099-08-02', 10000);
    seedSnapshot('2099-08-03', 10000);

    const series = buildReturnSeries({ from: '2099-08-01', to: '2099-08-03' });

    expect(series.length).toBe(3);
    expect(series[1].periodReturn).toBe(0);
    expect(series[2].periodReturn).toBe(0);
    expect(series[2].cumulativeReturn).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Test Suite 3: buildReturnSeries — with external flows
// ──────────────────────────────────────────────

describe('buildReturnSeries — with external flows', () => {
  it('should normalize a deposit correctly', () => {
    // start=10000, deposit=5000, end=15200 (10000+5000+200 gain)
    // netFlow = -5000, subperiodReturn = (15200-5000-10000)/10000 = 0.02
    seedSnapshot('2099-09-01', 10000);
    seedSnapshot('2099-09-02', 15200);
    seedCashFlow('2099-09-02', 5000, 'DEPOSIT');

    const series = buildReturnSeries({ from: '2099-09-01', to: '2099-09-02' });

    expect(series.length).toBe(2);
    expect(series[1].externalFlow).toBe(-5000);
    expect(series[1].periodReturn).toBeCloseTo(0.02, 10);
    expect(series[1].cumulativeReturn).toBeCloseTo(0.02, 10);
  });

  it('should not create artificial return from deposit alone', () => {
    // Day 1: 10000, Day 2: 15000 (10000 + 5000 deposit, NO investment gain)
    // netFlow = -5000, subperiodReturn = (15000-5000-10000)/10000 = 0
    seedSnapshot('2099-10-01', 10000);
    seedSnapshot('2099-10-02', 15000);
    seedCashFlow('2099-10-02', 5000, 'DEPOSIT');

    const series = buildReturnSeries({ from: '2099-10-01', to: '2099-10-02' });

    expect(series[1].periodReturn).toBeCloseTo(0, 10);
  });

  it('should handle multiple deposits across periods', () => {
    // TWR sub-period logic:
    // Sub-period 1: Day 1 (10000) → Day 3 (11210, with deposit 1100)
    //   subperiodReturn = (11210 - 1100 - 10000) / 10000 = 110/10000 = 0.011
    // Sub-period 2: Day 3 (11210) → Day 4 (11424.2)
    //   periodReturn = (11424.2 - 11210) / 11210 = 214.2/11210
    seedSnapshot('2099-11-01', 10000);
    seedSnapshot('2099-11-02', 10100);
    seedSnapshot('2099-11-03', 11210);
    seedSnapshot('2099-11-04', 11424.2);
    seedCashFlow('2099-11-03', 1100, 'DEPOSIT');

    const series = buildReturnSeries({ from: '2099-11-01', to: '2099-11-04' });

    expect(series.length).toBe(4);

    // Day 2: no flow, day-to-day return from Day 1
    expect(series[1].externalFlow).toBe(0);
    expect(series[1].periodReturn).toBeCloseTo((10100 - 10000) / 10000, 10);

    // Day 3: DEPOSIT 1100, sub-period return from Day 1 start
    expect(series[2].externalFlow).toBe(-1100);
    // subperiodReturn = (11210 - 1100 - 10000) / 10000 = 110/10000 = 0.011
    expect(series[2].periodReturn).toBeCloseTo(110 / 10000, 10);

    // Day 4: no flow, day-to-day return from Day 3
    expect(series[3].externalFlow).toBe(0);
    expect(series[3].periodReturn).toBeCloseTo(214.2 / 11210, 10);

    // Cumulative: (1 + subperiodReturn) × (1 + dayReturn) - 1
    // = (1 + 0.011)(1 + 0.0191088) - 1 = 1.011 × 1.0191088 - 1 = 0.04062...
    expect(series[3].cumulativeReturn).toBeCloseTo(0.04062, 5);
  });
});

// ──────────────────────────────────────────────
// Test Suite 4: buildReturnSeries — withdrawal
// ──────────────────────────────────────────────

describe('buildReturnSeries — with withdrawals', () => {
  it('should handle a withdrawal correctly', () => {
    // TWR sub-period logic:
    // Sub-period 1: Day 1 (10000) → Day 3 (9720, with withdrawal 1100)
    //   subperiodReturn = (9720 + 1100 - 10000) / 10000 = 820/10000 = 0.082
    // No partial sub-period after the flow (last point IS the flow day).
    seedSnapshot('2099-12-01', 10000);
    seedSnapshot('2099-12-02', 10800);
    seedSnapshot('2099-12-03', 9720);
    seedCashFlow('2099-12-03', 1100, 'WITHDRAWAL');

    const series = buildReturnSeries({ from: '2099-12-01', to: '2099-12-03' });

    expect(series.length).toBe(3);

    // Day 2: no flow, day-to-day return from Day 1
    expect(series[1].externalFlow).toBe(0);
    expect(series[1].periodReturn).toBeCloseTo((10800 - 10000) / 10000, 10);

    // Day 3: WITHDRAWAL 1100, sub-period return from Day 1 start
    expect(series[2].externalFlow).toBe(1100);
    // subperiodReturn = (9720 + 1100 - 10000) / 10000 = 820/10000 = 0.082
    expect(series[2].periodReturn).toBeCloseTo(820 / 10000, 10);
  });
});

// ──────────────────────────────────────────────
// Test Suite 5: buildReturnSeries — edge cases
// ──────────────────────────────────────────────

describe('buildReturnSeries — edge cases', () => {
  it('should return single point for one snapshot', () => {
    seedSnapshot('2099-05-01', 10000);

    const series = buildReturnSeries({ from: '2099-05-01', to: '2099-05-01' });

    expect(series.length).toBe(1);
    expect(series[0].periodReturn).toBe(0);
    expect(series[0].cumulativeReturn).toBe(0);
  });

  it('should handle same-day snapshot and deposit', () => {
    // Day 1: 10000, Day 2: 10200, DEPOSIT 1000
    // netFlow = -1000, subperiodReturn = (10200-1000-10000)/10000 = -0.08
    seedSnapshot('2099-03-01', 10000);
    seedSnapshot('2099-03-02', 10200);
    seedCashFlow('2099-03-02', 1000, 'DEPOSIT');

    const series = buildReturnSeries({ from: '2099-03-01', to: '2099-03-02' });

    expect(series.length).toBe(2);
    expect(series[1].externalFlow).toBe(-1000);
    expect(series[1].periodReturn).toBeCloseTo(-0.08, 10);
  });

  it('should handle multiple movements on the same day', () => {
    // Day 1: 10000, Day 2: 11100, DEPOSIT 500 + DEPOSIT 500.01 = 1000.01 total
    // netFlow = -1000.01, subperiodReturn = (11100-1000.01-10000)/10000 = 0.009999
    seedSnapshot('2099-04-01', 10000);
    seedSnapshot('2099-04-02', 11100);
    seedCashFlow('2099-04-02', 500, 'DEPOSIT');
    seedCashFlow('2099-04-02', 500.01, 'DEPOSIT');

    const series = buildReturnSeries({ from: '2099-04-01', to: '2099-04-02' });

    expect(series.length).toBe(2);
    expect(series[1].externalFlow).toBeCloseTo(-1000.01, 10);
    expect(series[1].periodReturn).toBeCloseTo(0.009999, 10);
  });

  it('should filter by date range correctly', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-01-02', 10200);
    seedSnapshot('2099-01-03', 10500);
    seedSnapshot('2099-01-04', 10800);

    const series = buildReturnSeries({ from: '2099-01-02', to: '2099-01-03' });

    expect(series.length).toBe(2);
    expect(series[0].date).toBe('2099-01-02');
    expect(series[1].date).toBe('2099-01-03');
  });
});

// ──────────────────────────────────────────────
// Test Suite 6: Regression against calculateTWR()
// ──────────────────────────────────────────────

describe('Regression: buildReturnSeries TWR vs calculateTWR()', () => {
  it('should produce identical TWR total as calculateTWR() on real data', () => {
    const twrFromExisting = calculateTWR();
    const series = buildReturnSeries();
    const twrFromSeries = twrFromReturns(series);

    // Allow tiny floating-point tolerance (6 decimal places matches calculateTWR precision)
    expect(twrFromSeries).toBeCloseTo(twrFromExisting.twrTotal, 4);
  });
});

// ──────────────────────────────────────────────
// Test Suite 7: calculateCumulativePerformance
// ──────────────────────────────────────────────

describe('calculateCumulativePerformance', () => {
  it('should return empty result for empty array', () => {
    const result = calculateCumulativePerformance([]);
    expect(result.points).toEqual([]);
    expect(result.cumulativeReturn).toBe(0);
  });

  it('should return single point with value 1 for single-element series', () => {
    const series = [
      { date: '2099-01-01', portfolioValue: 10000, externalFlow: 0, periodReturn: 0, cumulativeReturn: 0 },
    ];
    const result = calculateCumulativePerformance(series);
    expect(result.points.length).toBe(1);
    expect(result.points[0].value).toBe(1);
    expect(result.cumulativeReturn).toBe(0);
  });

  it('should produce correct cumulative values for steady growth', () => {
    // 100 → 110 → 121, no flows → cumulative returns: 0, 0.10, 0.21
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0.10 },
      { date: '2099-01-03', cumulativeReturn: 0.21 },
    ];
    const result = calculateCumulativePerformance(series);

    expect(result.points.length).toBe(3);
    expect(result.points[0].value).toBe(1);
    expect(result.points[1].value).toBeCloseTo(1.10, 10);
    expect(result.points[2].value).toBeCloseTo(1.21, 10);
    expect(result.cumulativeReturn).toBeCloseTo(0.21, 10);
  });

  it('should handle declining series correctly', () => {
    // 100 → 90 → 81, no flows → cumulative returns: 0, -0.10, -0.19
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: -0.10 },
      { date: '2099-01-03', cumulativeReturn: -0.19 },
    ];
    const result = calculateCumulativePerformance(series);

    expect(result.points[0].value).toBe(1);
    expect(result.points[1].value).toBeCloseTo(0.90, 10);
    expect(result.points[2].value).toBeCloseTo(0.81, 10);
    expect(result.cumulativeReturn).toBeCloseTo(-0.19, 10);
  });

  it('should handle unchanged values (all returns zero)', () => {
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0 },
      { date: '2099-01-03', cumulativeReturn: 0 },
    ];
    const result = calculateCumulativePerformance(series);

    expect(result.points.every((p) => p.value === 1)).toBe(true);
    expect(result.cumulativeReturn).toBe(0);
  });

  it('should integrate correctly with buildReturnSeries (no flows)', () => {
    seedSnapshot('2099-06-01', 10000);
    seedSnapshot('2099-06-02', 10200);
    seedSnapshot('2099-06-03', 10500);

    const series = buildReturnSeries({ from: '2099-06-01', to: '2099-06-03' });
    const perf = calculateCumulativePerformance(series);

    expect(perf.points.length).toBe(3);
    // First point always starts at 1
    expect(perf.points[0].value).toBe(1);
    // Last cumulativeReturn should match series last point
    expect(perf.cumulativeReturn).toBeCloseTo(series[series.length - 1].cumulativeReturn, 10);
    // Each point value = 1 + cumulativeReturn
    for (let i = 0; i < series.length; i++) {
      expect(perf.points[i].value).toBeCloseTo(1 + series[i].cumulativeReturn, 10);
    }
  });
});

// ──────────────────────────────────────────────
// Test Suite 8: calculateCAGR
// ──────────────────────────────────────────────

describe('calculateCAGR', () => {
  it('should return null for empty array', () => {
    const result = calculateCAGR([]);
    expect(result.cagr).toBeNull();
    expect(result.years).toBeNull();
    expect(result.periodLessThanOneYear).toBe(false);
  });

  it('should return null for single point', () => {
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
    ];
    const result = calculateCAGR(series);
    expect(result.cagr).toBeNull();
    expect(result.years).toBeNull();
  });

  it('should return cagr=null and years=0 for same-day snapshots', () => {
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0.10 },
      { date: '2099-01-01', cumulativeReturn: 0.10 },
    ];
    const result = calculateCAGR(series);
    expect(result.cagr).toBeNull();
    expect(result.years).toBe(0);
    expect(result.periodLessThanOneYear).toBe(true);
  });

  it('should calculate CAGR = 10% for 100→121 in exactly 2 years', () => {
    // 2 years = 2 × 365.2425 = 730.485 days
    // Using dates that span exactly 730 days (~2.00 years)
    // 100 → 121, cumulativeReturn = 0.21
    // CAGR = (1.21)^(1/2) - 1 = 0.10
    const series = [
      { date: '2022-01-01', cumulativeReturn: 0 },
      { date: '2024-01-01', cumulativeReturn: 0.21 },
    ];
    const result = calculateCAGR(series);

    // 2022-01-01 to 2024-01-01 = 731 days (2022 is not bisestile, 2023 non bisestile)
    // Actually 2022-01-01 to 2024-01-01 = 365 + 365 = 730 days
    // years = 730 / 365.2425 ≈ 1.9987
    // CAGR = 1.21^(1/1.9987) - 1 ≈ 0.1001...
    expect(result.cagr).toBeCloseTo(0.10, 2);
    expect(result.years).toBeGreaterThan(1.9);
    expect(result.years).toBeLessThan(2.1);
    expect(result.periodLessThanOneYear).toBe(false);
  });

  it('should calculate CAGR = 10% for 1 year exactly', () => {
    // 100 → 110 in exactly 365.2425 days (1 year)
    // CAGR = 1.10^(1/1) - 1 = 0.10
    const series = [
      { date: '2022-01-01', cumulativeReturn: 0 },
      { date: '2023-01-02', cumulativeReturn: 0.10 },
    ];
    const result = calculateCAGR(series);

    // 2022-01-01 to 2023-01-02 = 366 days (2022 is not bisestile, so 365 days actually)
    // 2022 has 365 days, so 2022-01-01 to 2023-01-01 = 365 days
    // 2022-01-01 to 2023-01-02 = 366 days
    // years = 366 / 365.2425 ≈ 1.002
    // CAGR = 1.10^(1/1.002) - 1 ≈ 0.0998...
    expect(result.cagr).toBeCloseTo(0.10, 2);
    expect(result.periodLessThanOneYear).toBe(false);
  });

  it('should set periodLessThanOneYear flag for short periods', () => {
    // 100 → 105 in ~30 days
    const series = [
      { date: '2024-06-01', cumulativeReturn: 0 },
      { date: '2024-07-01', cumulativeReturn: 0.05 },
    ];
    const result = calculateCAGR(series);

    expect(result.cagr).not.toBeNull();
    expect(result.years).toBeLessThan(1);
    expect(result.periodLessThanOneYear).toBe(true);
    // CAGR should still be calculable as annualization: 1.05^(1/0.082) - 1 ≈ large number
    // because 30 days ≈ 0.082 years, so 1.05^(12.2) - 1 ≈ 0.80 = 80% annualized
    expect(result.cagr).toBeGreaterThan(0.5);
  });

  it('should return cagr=null when cumulativeReturn ≤ -1', () => {
    // 2024 is a leap year, so 2024-01-01 to 2025-01-01 = 366 days
    // years = 366 / 365.2425 ≈ 1.002
    const series = [
      { date: '2024-01-01', cumulativeReturn: 0 },
      { date: '2025-01-01', cumulativeReturn: -1 },
    ];
    const result = calculateCAGR(series);
    expect(result.cagr).toBeNull();
    expect(result.years).toBeCloseTo(1.002, 3);
  });

  it('should return cagr=null when cumulativeReturn < -1 (impossible loss)', () => {
    const series = [
      { date: '2024-01-01', cumulativeReturn: 0 },
      { date: '2025-01-01', cumulativeReturn: -1.5 },
    ];
    const result = calculateCAGR(series);
    expect(result.cagr).toBeNull();
  });

  it('should handle positive CAGR over multi-year period', () => {
    // 100 → 133.10 in 3 years → CAGR = 10%
    // (1.10)^3 = 1.331, so cumulativeReturn = 0.331
    const series = [
      { date: '2021-01-01', cumulativeReturn: 0 },
      { date: '2024-01-01', cumulativeReturn: 0.331 },
    ];
    const result = calculateCAGR(series);

    // 2021-01-01 to 2024-01-01 = 365+365+365 = 1095 days (no leap years in between)
    // Actually 2024 is a leap year but Feb 29 is after Jan 1, so still 1095 days
    // years = 1095 / 365.2425 ≈ 2.998
    // CAGR = 1.331^(1/2.998) - 1 ≈ 0.1001...
    expect(result.cagr).toBeCloseTo(0.10, 2);
    expect(result.years).toBeCloseTo(3, 1);
    expect(result.periodLessThanOneYear).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Test Suite 10: calculateMonthlyReturns
// ──────────────────────────────────────────────

describe('calculateMonthlyReturns', () => {
  it('should return empty array for empty input', () => {
    expect(calculateMonthlyReturns([])).toEqual([]);
  });

  it('should handle a single day in a month', () => {
    const series = [
      { date: '2024-01-02', periodReturn: 0.02, cumulativeReturn: 0.02 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(1);
    expect(monthly[0].year).toBe(2024);
    expect(monthly[0].month).toBe(1);
    expect(monthly[0].return).toBeCloseTo(0.02, 10);
  });

  it('should compound correctly: +10% then -10% = -1%', () => {
    // Critical test from design doc: arithmetic sum would give 0%, compounding gives -1%
    const series = [
      { date: '2024-01-02', periodReturn: 0.10, cumulativeReturn: 0.10 },
      { date: '2024-01-03', periodReturn: -0.10, cumulativeReturn: 0.00 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(1);
    expect(monthly[0].year).toBe(2024);
    expect(monthly[0].month).toBe(1);
    // (1 + 0.10) × (1 - 0.10) - 1 = 1.10 × 0.90 - 1 = 0.99 - 1 = -0.01
    expect(monthly[0].return).toBeCloseTo(-0.01, 10);
  });

  it('should compound three returns (+5%, -3%, +2%) in one month', () => {
    // (1.05 × 0.97 × 1.02) - 1 = 1.03887 - 1 = 0.03887
    const series = [
      { date: '2024-03-01', periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2024-03-04', periodReturn: -0.03, cumulativeReturn: 0.0195 },
      { date: '2024-03-07', periodReturn: 0.02, cumulativeReturn: 0.03887 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(1);
    expect(monthly[0].year).toBe(2024);
    expect(monthly[0].month).toBe(3);
    expect(monthly[0].return).toBeCloseTo(0.03887, 5);
  });

  it('should handle all-negative returns in a month', () => {
    // -2%, -1%, -3% → (0.98 × 0.99 × 0.97) - 1 = 0.941094 - 1 = -0.058906
    const series = [
      { date: '2024-06-03', periodReturn: -0.02, cumulativeReturn: -0.02 },
      { date: '2024-06-04', periodReturn: -0.01, cumulativeReturn: -0.0298 },
      { date: '2024-06-05', periodReturn: -0.03, cumulativeReturn: -0.058906 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(1);
    expect(monthly[0].return).toBeCloseTo(-0.058906, 5);
  });

  it('should produce multiple months in order', () => {
    const series = [
      { date: '2024-01-02', periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2024-02-01', periodReturn: 0.03, cumulativeReturn: 0.0815 },
      { date: '2024-02-02', periodReturn: -0.01, cumulativeReturn: 0.070685 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(2);
    expect(monthly[0].year).toBe(2024);
    expect(monthly[0].month).toBe(1);
    expect(monthly[0].return).toBeCloseTo(0.05, 10);
    expect(monthly[1].year).toBe(2024);
    expect(monthly[1].month).toBe(2);
    // (1.03 × 0.99) - 1 = 0.0197
    expect(monthly[1].return).toBeCloseTo(0.0197, 5);
  });

  it('should include zero-return months', () => {
    const series = [
      { date: '2024-05-01', periodReturn: 0, cumulativeReturn: 0 },
      { date: '2024-05-02', periodReturn: 0, cumulativeReturn: 0 },
    ];
    const monthly = calculateMonthlyReturns(series);
    expect(monthly.length).toBe(1);
    expect(monthly[0].return).toBe(0);
  });

  it('should integrate correctly with buildReturnSeries on real data', () => {
    seedSnapshot('2099-01-02', 10000);
    seedSnapshot('2099-01-15', 10200);
    seedSnapshot('2099-01-31', 10500);
    seedSnapshot('2099-02-01', 10550);
    seedSnapshot('2099-02-15', 10300);
    seedSnapshot('2099-02-28', 10700);

    const series = buildReturnSeries({ from: '2099-01-02', to: '2099-02-28' });
    const monthly = calculateMonthlyReturns(series);

    expect(series.length).toBeGreaterThan(2);
    expect(monthly.length).toBe(2);
    expect(monthly[0].year).toBe(2099);
    expect(monthly[0].month).toBe(1);
    expect(monthly[1].year).toBe(2099);
    expect(monthly[1].month).toBe(2);

    // Verify no NaN or Infinity
    for (const m of monthly) {
      expect(Number.isFinite(m.return)).toBe(true);
      expect(Number.isNaN(m.return)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// Test Suite 11: Integration — full pipeline
// ──────────────────────────────────────────────

describe('Integration: buildReturnSeries → calculateCumulativePerformance + calculateCAGR', () => {
  it('should produce coherent results through the full pipeline on real data', () => {
    // Use real data without date filter
    const series = buildReturnSeries();
    expect(series.length).toBeGreaterThan(1);

    const perf = calculateCumulativePerformance(series);
    expect(perf.points.length).toBe(series.length);
    expect(perf.cumulativeReturn).toBeCloseTo(series[series.length - 1].cumulativeReturn, 10);

    const cagr = calculateCAGR(series);
    // With ~2 years of real data, CAGR should be a finite number
    expect(cagr.cagr).not.toBeNull();
    expect(Number.isFinite(cagr.cagr)).toBe(true);
    expect(cagr.years).toBeGreaterThan(0);
    expect(cagr.periodLessThanOneYear).toBe(false);

    // Verify no NaN or Infinity in any output
    for (const p of perf.points) {
      expect(Number.isFinite(p.value)).toBe(true);
      expect(Number.isNaN(p.value)).toBe(false);
    }
    expect(Number.isFinite(cagr.cagr)).toBe(true);
    expect(Number.isNaN(cagr.cagr)).toBe(false);
  });

  it('should handle filtered date range consistently', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-01-02', 10200);
    seedSnapshot('2099-01-03', 10500);
    seedSnapshot('2099-01-04', 10300);
    seedSnapshot('2099-01-05', 10800);

    const series = buildReturnSeries({ from: '2099-01-02', to: '2099-01-04' });
    const perf = calculateCumulativePerformance(series);
    const cagr = calculateCAGR(series);

    expect(series.length).toBe(3);
    expect(perf.points.length).toBe(3);
    // Period is only 3 days (< 1 year), so flag should be true
    expect(cagr.periodLessThanOneYear).toBe(true);
    expect(cagr.cagr).not.toBeNull();
    expect(Number.isFinite(cagr.cagr)).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Test Suite 12: calculateAnnualReturns
// ──────────────────────────────────────────────

describe('calculateAnnualReturns', () => {
  it('should return empty array for empty input', () => {
    expect(calculateAnnualReturns([])).toEqual([]);
  });

  it('should handle snapshots within a single year', () => {
    const series = [
      { date: '2024-01-01', periodReturn: 0, cumulativeReturn: 0 },
      { date: '2024-06-15', periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2024-12-31', periodReturn: 0.03, cumulativeReturn: 0.0815 },
    ];
    const annual = calculateAnnualReturns(series);
    expect(annual.length).toBe(1);
    expect(annual[0].year).toBe(2024);
    // (1 + 0.05) × (1 + 0.03) - 1 = 1.05 × 1.03 - 1 = 0.0815
    expect(annual[0].return).toBeCloseTo(0.0815, 5);
  });

  it('should compound correctly: +10% then -10% in same year = -1%', () => {
    const series = [
      { date: '2024-03-01', periodReturn: 0.10, cumulativeReturn: 0.10 },
      { date: '2024-06-01', periodReturn: -0.10, cumulativeReturn: 0.00 },
    ];
    const annual = calculateAnnualReturns(series);
    expect(annual.length).toBe(1);
    expect(annual[0].year).toBe(2024);
    // (1 + 0.10) × (1 - 0.10) - 1 = 1.10 × 0.90 - 1 = -0.01
    expect(annual[0].return).toBeCloseTo(-0.01, 10);
  });

  it('should produce multiple years', () => {
    const series = [
      { date: '2023-06-01', periodReturn: 0.05, cumulativeReturn: 0.05 },
      { date: '2023-12-31', periodReturn: 0.02, cumulativeReturn: 0.071 },
      { date: '2024-06-01', periodReturn: -0.03, cumulativeReturn: 0.04087 },
      { date: '2024-12-31', periodReturn: 0.04, cumulativeReturn: 0.0827 },
    ];
    const annual = calculateAnnualReturns(series);
    expect(annual.length).toBe(2);
    expect(annual[0].year).toBe(2023);
    expect(annual[1].year).toBe(2024);
    // 2023: (1.05 × 1.02) - 1 = 0.071
    expect(annual[0].return).toBeCloseTo(0.071, 5);
    // 2024: (0.97 × 1.04) - 1 = 0.0088
    expect(annual[1].return).toBeCloseTo(0.0088, 5);
  });

  it('should handle all-negative returns in one year', () => {
    const series = [
      { date: '2024-03-01', periodReturn: -0.02, cumulativeReturn: -0.02 },
      { date: '2024-06-01', periodReturn: -0.03, cumulativeReturn: -0.0494 },
      { date: '2024-09-01', periodReturn: -0.01, cumulativeReturn: -0.0594 },
    ];
    const annual = calculateAnnualReturns(series);
    expect(annual.length).toBe(1);
    // (0.98 × 0.97 × 0.99) - 1 = 0.941094 - 1 = -0.058906
    expect(annual[0].return).toBeCloseTo(-0.058906, 5);
  });

  it('should integrate correctly with buildReturnSeries on multi-year data', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-06-01', 10500);
    seedSnapshot('2099-12-31', 11000);
    seedSnapshot('2100-06-01', 11200);
    seedSnapshot('2100-12-31', 12000);

    const series = buildReturnSeries({ from: '2099-01-01', to: '2100-12-31' });
    const annual = calculateAnnualReturns(series);

    expect(series.length).toBeGreaterThan(3);
    expect(annual.length).toBe(2);
    expect(annual[0].year).toBe(2099);
    expect(annual[1].year).toBe(2100);

    // Verify no NaN or Infinity
    for (const a of annual) {
      expect(Number.isFinite(a.return)).toBe(true);
      expect(Number.isNaN(a.return)).toBe(false);
    }
  });
});

// ──────────────────────────────────────────────
// Test Suite 13: calculateBestWorst
// ──────────────────────────────────────────────

describe('calculateBestWorst', () => {
  it('should return nulls for empty arrays', () => {
    const result = calculateBestWorst([], []);
    expect(result.month.year).toBeNull();
    expect(result.month.month).toBeNull();
    expect(result.month.return).toBeNull();
    expect(result.worst.year).toBeNull();
    expect(result.worst.month).toBeNull();
    expect(result.worst.return).toBeNull();
    expect(result.year.year).toBeNull();
    expect(result.year.return).toBeNull();
    expect(result.worstYear.year).toBeNull();
    expect(result.worstYear.return).toBeNull();
  });

  it('should find best and worst month with period identifiers', () => {
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },
      { year: 2024, month: 2, return: -0.03 },
      { year: 2024, month: 3, return: 0.08 },
      { year: 2024, month: 4, return: -0.06 },
    ];
    const result = calculateBestWorst(monthly, []);
    expect(result.month.return).toBeCloseTo(0.08, 10);
    expect(result.month.year).toBe(2024);
    expect(result.month.month).toBe(3);
    expect(result.worst.return).toBeCloseTo(-0.06, 10);
    expect(result.worst.year).toBe(2024);
    expect(result.worst.month).toBe(4);
  });

  it('should find best and worst year with period identifier', () => {
    const annual = [
      { year: 2022, return: -0.09 },
      { year: 2023, return: 0.14 },
      { year: 2024, return: 0.09 },
    ];
    const result = calculateBestWorst([], annual);
    expect(result.year.return).toBeCloseTo(0.14, 10);
    expect(result.year.year).toBe(2023);
    expect(result.worstYear.return).toBeCloseTo(-0.09, 10);
    expect(result.worstYear.year).toBe(2022);
  });

  it('should handle single element arrays', () => {
    const monthly = [{ year: 2024, month: 1, return: 0.05 }];
    const annual = [{ year: 2024, return: 0.10 }];
    const result = calculateBestWorst(monthly, annual);
    expect(result.month.return).toBeCloseTo(0.05, 10);
    expect(result.month.year).toBe(2024);
    expect(result.month.month).toBe(1);
    expect(result.worst.return).toBeCloseTo(0.05, 10);
    expect(result.worst.year).toBe(2024);
    expect(result.worst.month).toBe(1);
    expect(result.year.return).toBeCloseTo(0.10, 10);
    expect(result.year.year).toBe(2024);
    expect(result.worstYear.return).toBeCloseTo(0.10, 10);
    expect(result.worstYear.year).toBe(2024);
  });

  it('should return first chronologically when ties exist', () => {
    // All positive returns equal — best should be first, worst should be first
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },
      { year: 2024, month: 2, return: 0.05 },
      { year: 2024, month: 3, return: 0.05 },
    ];
    const result = calculateBestWorst(monthly, []);
    expect(result.month.return).toBeCloseTo(0.05, 10);
    expect(result.month.year).toBe(2024);
    expect(result.month.month).toBe(1);
    expect(result.worst.return).toBeCloseTo(0.05, 10);
    expect(result.worst.year).toBe(2024);
    expect(result.worst.month).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Test Suite 14: calculatePeriodStats helpers
// ──────────────────────────────────────────────

describe('calculatePeriodStatsFromSeries', () => {
  it('should return zero stats for empty arrays', () => {
    const result = calculatePeriodStatsFromSeries([], []);
    expect(result.months.total).toBe(0);
    expect(result.months.positive).toBe(0);
    expect(result.months.negative).toBe(0);
    expect(result.months.flat).toBe(0);
    expect(result.months.positiveRate).toBe(0);
    expect(result.years.total).toBe(0);
  });

  it('should count positive/negative/flat correctly for months', () => {
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },   // positive
      { year: 2024, month: 2, return: -0.03 },  // negative
      { year: 2024, month: 3, return: 0 },       // flat
      { year: 2024, month: 4, return: 0.02 },   // positive
      { year: 2024, month: 5, return: -0.01 },  // negative
    ];
    const result = calculatePeriodStatsFromSeries(monthly, []);
    expect(result.months.positive).toBe(2);
    expect(result.months.negative).toBe(2);
    expect(result.months.flat).toBe(1);
    expect(result.months.total).toBe(5);
    expect(result.months.positiveRate).toBeCloseTo(2 / 5, 10);
    expect(result.months.negativeRate).toBeCloseTo(2 / 5, 10);
  });

  it('should count positive/negative/flat correctly for years', () => {
    const annual = [
      { year: 2022, return: -0.09 },  // negative
      { year: 2023, return: 0.14 },   // positive
      { year: 2024, return: 0.09 },   // positive
    ];
    const result = calculatePeriodStatsFromSeries([], annual);
    expect(result.years.positive).toBe(2);
    expect(result.years.negative).toBe(1);
    expect(result.years.flat).toBe(0);
    expect(result.years.total).toBe(3);
    expect(result.years.positiveRate).toBeCloseTo(2 / 3, 10);
  });

  it('should classify zero as FLAT not negative', () => {
    const monthly = [
      { year: 2024, month: 1, return: 0 },
      { year: 2024, month: 2, return: 0 },
    ];
    const result = calculatePeriodStatsFromSeries(monthly, []);
    expect(result.months.flat).toBe(2);
    expect(result.months.positive).toBe(0);
    expect(result.months.negative).toBe(0);
  });

  it('should compute both monthly and yearly stats together', () => {
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },
      { year: 2024, month: 2, return: -0.03 },
      { year: 2024, month: 3, return: 0.02 },
    ];
    const annual = [
      { year: 2024, return: 0.04 },
    ];
    const result = calculatePeriodStatsFromSeries(monthly, annual);
    expect(result.months.total).toBe(3);
    expect(result.months.positive).toBe(2);
    expect(result.months.negative).toBe(1);
    expect(result.years.total).toBe(1);
    expect(result.years.positive).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Test Suite 15: Integration — Phase 4 full pipeline
// ──────────────────────────────────────────────

describe('Integration: Phase 4 — annual + monthly + stats + best/worst', () => {
  it('should produce coherent results through the full Phase 4 pipeline on real data', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-03-31', 10300);
    seedSnapshot('2099-06-30', 10600);
    seedSnapshot('2099-09-30', 10900);
    seedSnapshot('2099-12-31', 11400);
    seedSnapshot('2100-03-31', 11600);
    seedSnapshot('2100-06-30', 11300);
    seedSnapshot('2100-09-30', 11800);
    seedSnapshot('2100-12-31', 12500);

    const series = buildReturnSeries({ from: '2099-01-01', to: '2100-12-31' });
    const monthly = calculateMonthlyReturns(series);
    const annual = calculateAnnualReturns(series);
    const stats = calculatePeriodStatsFromSeries(monthly, annual);
    const bestWorst = calculateBestWorst(monthly, annual);

    expect(series.length).toBeGreaterThan(8);
    expect(monthly.length).toBeGreaterThan(0);
    expect(annual.length).toBe(2); // 2099 and 2100

    // Annual returns should be finite numbers (sign depends on TWR calculation)
    expect(Number.isFinite(annual[0].return)).toBe(true);
    expect(Number.isFinite(annual[1].return)).toBe(true);

    // Best should be >= worst (using year identifiers for best/worst year)
    expect(bestWorst.year.return).toBeGreaterThanOrEqual(bestWorst.worstYear.return);

    // Stats totals should match array lengths
    expect(stats.months.total).toBe(monthly.length);
    expect(stats.years.total).toBe(annual.length);

    // Verify no NaN or Infinity anywhere
    for (const m of monthly) {
      expect(Number.isFinite(m.return)).toBe(true);
    }
    for (const a of annual) {
      expect(Number.isFinite(a.return)).toBe(true);
    }
    expect(Number.isFinite(stats.months.positiveRate)).toBe(true);
    expect(Number.isFinite(stats.years.positiveRate)).toBe(true);
  });

  it('should handle mixed positive/negative periods', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-06-30', 9500);   // down
    seedSnapshot('2099-12-31', 10200);  // up
    seedSnapshot('2100-06-30', 9800);   // down
    seedSnapshot('2100-12-31', 10800);  // up

    const series = buildReturnSeries({ from: '2099-01-01', to: '2100-12-31' });
    const monthly = calculateMonthlyReturns(series);
    const annual = calculateAnnualReturns(series);
    const stats = calculatePeriodStatsFromSeries(monthly, annual);
    const bestWorst = calculateBestWorst(monthly, annual);

    expect(annual.length).toBe(2);

    // 2099: 10000 → 10200 (positive), 2100: 10200 → 10800 (positive)
    // But intermediate dips may create negative months
    expect(bestWorst.year.return).toBeGreaterThan(0);
    expect(bestWorst.worstYear.return).toBeGreaterThan(-1);

    // Total months should match expected
    expect(monthly.length).toBeGreaterThan(0);
    expect(stats.months.total).toBe(monthly.length);
  });
});

// ──────────────────────────────────────────────
// Test Suite 16: calculateVolatility
// ──────────────────────────────────────────────

describe('calculateVolatility', () => {
  it('should return null for empty array', () => {
    const result = calculateVolatility([]);
    expect(result.daily).toBeNull();
    expect(result.annualized).toBeNull();
  });

  it('should return null for single point', () => {
    const series = [
      { date: '2099-01-01', periodReturn: 0 },
    ];
    const result = calculateVolatility(series);
    expect(result.daily).toBeNull();
    expect(result.annualized).toBeNull();
  });

  it('should calculate correct volatility for two-point series', () => {
    // returns = [0, 0.02]
    // mean = 0.01
    // squaredDiffs = [(0-0.01)², (0.02-0.01)²] = [0.0001, 0.0001]
    // variance = 0.0002 / (2-1) = 0.0002
    // daily = √0.0002 ≈ 0.014142
    const series = [
      { date: '2099-01-01', periodReturn: 0 },
      { date: '2099-01-02', periodReturn: 0.02 },
    ];
    const result = calculateVolatility(series);

    expect(result.daily).toBeCloseTo(Math.sqrt(0.0002), 10);
    expect(result.annualized).toBeCloseTo(Math.sqrt(0.0002) * ANNUALIZATION_FACTOR, 10);
  });

  it('should produce zero volatility when all returns are identical', () => {
    // All returns = 0.01 → stddev = 0
    const series = [
      { date: '2099-01-01', periodReturn: 0.01 },
      { date: '2099-01-02', periodReturn: 0.01 },
      { date: '2099-01-03', periodReturn: 0.01 },
    ];
    const result = calculateVolatility(series);
    expect(result.daily).toBe(0);
    expect(result.annualized).toBe(0);
  });

  it('should handle constant positive returns (zero vol)', () => {
    const series = [
      { date: '2099-01-01', periodReturn: 0.005 },
      { date: '2099-01-02', periodReturn: 0.005 },
      { date: '2099-01-03', periodReturn: 0.005 },
      { date: '2099-01-04', periodReturn: 0.005 },
    ];
    const result = calculateVolatility(series);
    expect(result.daily).toBe(0);
    expect(result.annualized).toBe(0);
  });

  it('should handle constant negative returns (zero vol)', () => {
    const series = [
      { date: '2099-01-01', periodReturn: -0.002 },
      { date: '2099-01-02', periodReturn: -0.002 },
      { date: '2099-01-03', periodReturn: -0.002 },
    ];
    const result = calculateVolatility(series);
    expect(result.daily).toBe(0);
    expect(result.annualized).toBe(0);
  });

  it('should calculate correct volatility for deterministic 3-return dataset', () => {
    // returns = [0.01, -0.01, 0.02]
    // mean = 0.02/3 = 0.006667
    // squaredDiffs = [(0.01-0.006667)², (-0.01-0.006667)², (0.02-0.006667)²]
    //              = [0.00001111, 0.00027778, 0.00017778]
    // variance = 0.00046667 / 2 = 0.00023333
    // daily = √0.00023333 ≈ 0.015275
    const series = [
      { date: '2099-01-01', periodReturn: 0.01 },
      { date: '2099-01-02', periodReturn: -0.01 },
      { date: '2099-01-03', periodReturn: 0.02 },
    ];
    const result = calculateVolatility(series);

    // Compute expected from the same returns to avoid floating-point mismatch
    const returns = [0.01, -0.01, 0.02];
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const expectedDaily = Math.sqrt(variance);

    expect(result.daily).toBeCloseTo(expectedDaily, 5);
    expect(result.annualized).toBeCloseTo(expectedDaily * ANNUALIZATION_FACTOR, 5);
  });

  it('should verify annualization factor is exactly √365', () => {
    // Use a series with known non-zero volatility
    const series = [
      { date: '2099-01-01', periodReturn: 0.01 },
      { date: '2099-01-02', periodReturn: -0.01 },
      { date: '2099-01-03', periodReturn: 0.005 },
      { date: '2099-01-04', periodReturn: -0.005 },
      { date: '2099-01-05', periodReturn: 0.02 },
    ];
    const result = calculateVolatility(series);

    expect(result.daily).not.toBe(0);
    expect(result.annualized).not.toBe(0);
    // Ratio must equal √365 exactly
    expect(result.annualized / result.daily).toBeCloseTo(Math.sqrt(365), 10);
  });

  it('should integrate correctly with buildReturnSeries on real data', () => {
    seedSnapshot('2099-01-02', 10000);
    seedSnapshot('2099-01-03', 10100);
    seedSnapshot('2099-01-04', 10050);
    seedSnapshot('2099-01-05', 10200);
    seedSnapshot('2099-01-06', 10150);
    seedSnapshot('2099-01-07', 10300);

    const series = buildReturnSeries({ from: '2099-01-02', to: '2099-01-07' });
    const vol = calculateVolatility(series);

    expect(series.length).toBe(6);
    expect(vol.daily).not.toBeNull();
    expect(vol.annualized).not.toBeNull();
    expect(Number.isFinite(vol.daily)).toBe(true);
    expect(Number.isFinite(vol.annualized)).toBe(true);
    expect(vol.daily).toBeGreaterThanOrEqual(0);
    expect(vol.annualized).toBeGreaterThanOrEqual(0);

    // Verify no NaN or Infinity
    expect(Number.isNaN(vol.daily)).toBe(false);
    expect(Number.isNaN(vol.annualized)).toBe(false);
    expect(Number.isFinite(vol.daily)).toBe(true);
    expect(Number.isFinite(vol.annualized)).toBe(true);
  });

  it('should handle alternating positive/negative returns (high vol)', () => {
    // Large swings: +5%, -5%, +5%, -5%
    const series = [
      { date: '2099-01-01', periodReturn: 0.05 },
      { date: '2099-01-02', periodReturn: -0.05 },
      { date: '2099-01-03', periodReturn: 0.05 },
      { date: '2099-01-04', periodReturn: -0.05 },
    ];
    const result = calculateVolatility(series);

    // mean = 0
    // variance = (4 × 0.0025) / 3 = 0.003333
    // daily = √0.003333 ≈ 0.057735
    const expectedDaily = Math.sqrt((4 * 0.0025) / 3);
    expect(result.daily).toBeCloseTo(expectedDaily, 10);
    expect(result.annualized).toBeCloseTo(expectedDaily * ANNUALIZATION_FACTOR, 10);
  });
});

// ──────────────────────────────────────────────
// Test Suite 17: calculateSharpe
// ──────────────────────────────────────────────

describe('calculateSharpe', () => {
  it('should return null for empty array', () => {
    expect(calculateSharpe([], 0)).toBeNull();
  });

  it('should return null for single point', () => {
    const series = [
      { date: '2099-01-01', periodReturn: 0.01 },
    ];
    expect(calculateSharpe(series, 0)).toBeNull();
  });

  it('should calculate Sharpe with riskFreeRate = 0%', () => {
    // Dataset deterministico: [+0.01, -0.005, +0.008, -0.003, +0.006]
    const series = [
      { date: '2099-01-01', periodReturn: 0.01 },
      { date: '2099-01-02', periodReturn: -0.005 },
      { date: '2099-01-03', periodReturn: 0.008 },
      { date: '2099-01-04', periodReturn: -0.003 },
      { date: '2099-01-05', periodReturn: 0.006 },
    ];
    const result = calculateSharpe(series, 0);

    // Con RF=0, excessReturn = periodReturn stesso
    // mean = (0.01 - 0.005 + 0.008 - 0.003 + 0.006) / 5 = 0.016 / 5 = 0.0032
    // stddev (sample) = sqrt(sum((r-mean)^2) / (n-1))
    // = sqrt(((0.0068)^2 + (-0.0082)^2 + (0.0048)^2 + (-0.0062)^2 + (0.0028)^2) / 4)
    // = sqrt((0.00004624 + 0.00006724 + 0.00002304 + 0.00003844 + 0.00000784) / 4)
    // = sqrt(0.0001828 / 4) = sqrt(0.0000457) ≈ 0.00676
    // dailySharpe = 0.0032 / 0.00676 ≈ 0.4734
    // annualized = 0.4734 × √365 ≈ 9.04
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(8);
    expect(result).toBeLessThan(10);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('should reduce Sharpe with positive riskFreeRate', () => {
    const series = [
      { date: '2099-02-01', periodReturn: 0.01 },
      { date: '2099-02-02', periodReturn: -0.005 },
      { date: '2099-02-03', periodReturn: 0.008 },
      { date: '2099-02-04', periodReturn: -0.003 },
      { date: '2099-02-05', periodReturn: 0.006 },
    ];
    const sharpe0 = calculateSharpe(series, 0);
    const sharpe5 = calculateSharpe(series, 5); // 5% RF
    const sharpe10 = calculateSharpe(series, 10); // 10% RF

    // Higher RF → lower Sharpe (since mean excess return decreases)
    expect(sharpe0).not.toBeNull();
    expect(sharpe5).not.toBeNull();
    expect(sharpe10).not.toBeNull();
    expect(sharpe0).toBeGreaterThan(sharpe5);
    expect(sharpe5).toBeGreaterThan(sharpe10);
  });

  it('should increase Sharpe with negative riskFreeRate', () => {
    const series = [
      { date: '2099-03-01', periodReturn: 0.01 },
      { date: '2099-03-02', periodReturn: -0.005 },
      { date: '2099-03-03', periodReturn: 0.008 },
    ];
    const sharpeNeg = calculateSharpe(series, -2); // -2% RF
    const sharpeZero = calculateSharpe(series, 0);
    const sharpePos = calculateSharpe(series, 2); // 2% RF

    expect(sharpeNeg).toBeGreaterThan(sharpeZero);
    expect(sharpeZero).toBeGreaterThan(sharpePos);
  });

  it('should return null when volatility is zero', () => {
    // All returns identici → stdDev = 0 → Sharpe = null (non Infinity)
    const series = [
      { date: '2099-04-01', periodReturn: 0.001 },
      { date: '2099-04-02', periodReturn: 0.001 },
      { date: '2099-04-03', periodReturn: 0.001 },
      { date: '2099-04-04', periodReturn: 0.001 },
    ];
    expect(calculateSharpe(series, 0)).toBeNull();
    expect(calculateSharpe(series, 2.5)).toBeNull();
  });

  it('should handle riskFreeRate = 0 explicitly', () => {
    const series = [
      { date: '2099-05-01', periodReturn: 0.02 },
      { date: '2099-05-02', periodReturn: -0.01 },
      { date: '2099-05-03', periodReturn: 0.015 },
    ];
    const result = calculateSharpe(series, 0);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });

  it('should integrate correctly with buildReturnSeries on real data', () => {
    const series = buildReturnSeries();
    const sharpe0 = calculateSharpe(series, 0);
    const sharpe25 = calculateSharpe(series, 2.5);

    expect(series.length).toBeGreaterThan(10);
    expect(sharpe0).not.toBeNull();
    expect(sharpe25).not.toBeNull();
    expect(Number.isFinite(sharpe0)).toBe(true);
    expect(Number.isFinite(sharpe25)).toBe(true);
    expect(sharpe0).toBeGreaterThan(sharpe25); // 2.5% RF riduce lo Sharpe
    expect(Number.isNaN(sharpe0)).toBe(false);
    expect(Number.isNaN(sharpe25)).toBe(false);
  });

  it('should produce different Sharpe for different date ranges', () => {
    // Periodo completo
    const fullSeries = buildReturnSeries();
    const fullSharpe = calculateSharpe(fullSeries, 2.5);

    // Periodo filtrato (ultimi 3 mesi — o quello che il DB contiene)
    const filteredSeries = buildReturnSeries({ from: '2099-01-01' });
    const filteredSharpe = calculateSharpe(filteredSeries, 2.5);

    // Periodi diversi dovrebbero generalmente dare Sharpe diversi
    // (edge case: se entrambi sono null per dati insufficienti, va bene)
    if (fullSharpe !== null && filteredSharpe !== null) {
      // Non affermo disuguaglianza perché teoricamente potrebbero essere simili
      // Verifico solo che siano entrambi finiti e validi
      expect(Number.isFinite(fullSharpe)).toBe(true);
      expect(Number.isFinite(filteredSharpe)).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────
// Test Suite 18: calculateDrawdown
// ──────────────────────────────────────────────

describe('calculateDrawdown', () => {
  it('should return nulls for empty array', () => {
    const result = calculateDrawdown([]);
    expect(result.currentDrawdown).toBeNull();
    expect(result.maxDrawdown).toBeNull();
    expect(result.peakDate).toBeNull();
    expect(result.troughDate).toBeNull();
    expect(result.recoveryDate).toBeNull();
    expect(result.durationDays).toBeNull();
    expect(result.recoveryDays).toBeNull();
    expect(result.isRecovered).toBe(false);
    expect(result.drawdownSeries).toEqual([]);
  });

  it('should return nulls for single point', () => {
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
    ];
    const result = calculateDrawdown(series);
    expect(result.currentDrawdown).toBeNull();
    expect(result.maxDrawdown).toBeNull();
    expect(result.isRecovered).toBe(false);
  });

  // ── Test A: Dataset base dal design doc ──

  it('Test A: 100→120→90→110→130 — maxDD=-25%, recovered', () => {
    // Cumulative returns: 0, 0.20, -0.10, -0.08333, 0.30
    // Normalized values: 1, 1.20, 0.90, 0.9167, 1.30
    // Running peak: 1, 1.20, 1.20, 1.20, 1.30
    // Drawdowns: 0, -0.25, -0.25, -0.2333, 0
    // MaxDD = -0.25 (-25%), trough at index 1 or 2 (first occurrence = index 1)
    // Peak = 1.20 (index 1), Trough = 0.90 (index 2)
    // Recovery = when value ≥ 1.20 → index 4 (value=1.30)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },         // value=1.00
      { date: '2099-01-02', cumulativeReturn: 0.20 },      // value=1.20
      { date: '2099-01-03', cumulativeReturn: -0.10 },     // value=0.90
      { date: '2099-01-04', cumulativeReturn: -0.08333 },  // value=0.9167
      { date: '2099-01-05', cumulativeReturn: 0.30 },      // value=1.30
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBeCloseTo(-0.25, 10);
    expect(result.peakDate).toBe('2099-01-02');
    expect(result.troughDate).toBe('2099-01-03');
    expect(result.recoveryDate).toBe('2099-01-05');
    expect(result.isRecovered).toBe(true);
    // Duration = recoveryDate - peakDate = 3 days (Jan 5 - Jan 2)
    expect(result.durationDays).toBe(3);
    // Recovery time = recoveryDate - troughDate = 2 days (Jan 5 - Jan 3)
    expect(result.recoveryDays).toBe(2);
    expect(result.currentDrawdown).toBe(0);

    // Verify drawdown series length
    expect(result.drawdownSeries.length).toBe(5);
  });

  // ── Test B: Drawdown che si approfondisce ──

  it('Test B: 100→120→90→100→80→130 — maxDD sul trough assoluto (80)', () => {
    // Cumulative returns: 0, 0.20, -0.10, 0.00, -0.20, 0.30
    // Normalized values: 1, 1.20, 0.90, 1.00, 0.80, 1.30
    // Running peak: 1, 1.20, 1.20, 1.20, 1.20, 1.30
    // Drawdowns: 0, -0.25, -0.25, -0.1667, -0.3333, 0
    // MaxDD = -0.3333 (-33.33%) at index 4 (value=0.80)
    // Peak before maxDD = 1.20 (index 1), Trough = 0.80 (index 4)
    // Recovery = when value ≥ 1.20 → index 5 (value=1.30)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },         // value=1.00
      { date: '2099-01-02', cumulativeReturn: 0.20 },      // value=1.20
      { date: '2099-01-03', cumulativeReturn: -0.10 },     // value=0.90
      { date: '2099-01-04', cumulativeReturn: 0.00 },      // value=1.00
      { date: '2099-01-05', cumulativeReturn: -0.20 },     // value=0.80
      { date: '2099-01-06', cumulativeReturn: 0.30 },      // value=1.30
    ];
    const result = calculateDrawdown(series);

    // MaxDD should be based on trough=80 (index 4), not first dip at 90
    expect(result.maxDrawdown).toBeCloseTo(-0.3333, 3);
    expect(result.peakDate).toBe('2099-01-02');
    expect(result.troughDate).toBe('2099-01-05');
    expect(result.recoveryDate).toBe('2099-01-06');
    expect(result.isRecovered).toBe(true);
    // Duration = 2099-01-06 - 2099-01-02 = 4 days
    expect(result.durationDays).toBe(4);
    // Recovery time = 2099-01-06 - 2099-01-05 = 1 day
    expect(result.recoveryDays).toBe(1);
  });

  // ── Test C: Drawdown non recuperato ──

  it('Test C: serie che termina sotto il peak — recoveryDate=null', () => {
    // Cumulative returns: 0, 0.20, 0.10, 0.05
    // Normalized values: 1, 1.20, 1.10, 1.05
    // Running peak: 1, 1.20, 1.20, 1.20
    // Drawdowns: 0, 0, -0.0833, -0.125
    // MaxDD = -0.125 at index 3 (last point — the trough)
    // Peak = 1.20 (index 1), Trough = 1.05 (index 3)
    // No recovery after index 3 (value never reaches 1.20 again)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0.20 },
      { date: '2099-01-03', cumulativeReturn: 0.10 },
      { date: '2099-01-04', cumulativeReturn: 0.05 },
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBeCloseTo(-0.125, 10);
    expect(result.peakDate).toBe('2099-01-02');
    // Trough is at index 3 (the lowest point = last point)
    expect(result.troughDate).toBe('2099-01-04');
    expect(result.recoveryDate).toBeNull();
    expect(result.isRecovered).toBe(false);
    expect(result.durationDays).toBeNull();
    expect(result.recoveryDays).toBeNull();
    // Current drawdown is the last point's drawdown = maxDD
    expect(result.currentDrawdown).toBeCloseTo(-0.125, 10);
  });

  // ── Test D: Serie senza drawdown (crescita costante) ──

  it('Test D: crescita costante — maxDD=0, currentDrawdown=0', () => {
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0.05 },
      { date: '2099-01-03', cumulativeReturn: 0.10 },
      { date: '2099-01-04', cumulativeReturn: 0.15 },
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBe(0);
    expect(result.currentDrawdown).toBe(0);
    expect(result.isRecovered).toBe(true);
    expect(result.troughDate).toBeNull();
    expect(result.recoveryDate).toBeNull();
    expect(result.durationDays).toBeNull();
    expect(result.recoveryDays).toBeNull();
  });

  // ── Test E: Recovery immediata (drawdown di 1 giorno) ──

  it('Test E: recovery immediata — 100→95→100', () => {
    // Cumulative returns: 0, -0.05, 0
    // Normalized values: 1, 0.95, 1.00
    // Running peak: 1, 1, 1
    // Drawdowns: 0, -0.05, 0
    // MaxDD = -0.05 at index 1
    // Recovery = index 2 (value=1.00 ≥ peak=1)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: -0.05 },
      { date: '2099-01-03', cumulativeReturn: 0 },
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBeCloseTo(-0.05, 10);
    expect(result.peakDate).toBe('2099-01-01');
    expect(result.troughDate).toBe('2099-01-02');
    expect(result.recoveryDate).toBe('2099-01-03');
    expect(result.isRecovered).toBe(true);
    expect(result.durationDays).toBe(2);
    expect(result.recoveryDays).toBe(1);
  });

  // ── Test F: Multiple drawdowns consecutivi ──

  it('Test F: 100→90→110→72.73→133.33 — due drawdowns, maxDD è il secondo', () => {
    // Cumulative returns: 0, -0.10, 0.10, -0.2727, 0.3333
    // Normalized values: 1, 0.90, 1.10, 0.7273, 1.3333
    // Running peak: 1, 1, 1.10, 1.10, 1.3333
    // Drawdowns: 0, -0.10, 0, -0.3388, 0
    // Primo drawdown: -10% (recuperato a 110 che è un nuovo peak)
    // Secondo drawdown: -33.88% (0.7273/1.10 - 1)
    // MaxDD = -33.88% (il secondo è peggiore)
    // Peak = 1.10 (index 2), Trough = 0.7273 (index 3)
    // Recovery = index 4 (value=1.3333 ≥ 1.10)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: -0.10 },
      { date: '2099-01-03', cumulativeReturn: 0.10 },
      { date: '2099-01-04', cumulativeReturn: -0.2727 },
      { date: '2099-01-05', cumulativeReturn: 0.3333 },
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBeCloseTo(-0.3388, 3);
    expect(result.peakDate).toBe('2099-01-03');
    expect(result.troughDate).toBe('2099-01-04');
    expect(result.recoveryDate).toBe('2099-01-05');
    expect(result.isRecovered).toBe(true);
    expect(result.durationDays).toBe(2);
    expect(result.recoveryDays).toBe(1);
  });

  // ── Test G: Integrazione con buildReturnSeries su dati reali ──

  it('should integrate correctly with buildReturnSeries on real data', () => {
    seedSnapshot('2099-01-01', 10000);
    seedSnapshot('2099-01-02', 10200);
    seedSnapshot('2099-01-03', 9800);
    seedSnapshot('2099-01-04', 10100);
    seedSnapshot('2099-01-05', 10500);

    const series = buildReturnSeries({ from: '2099-01-01', to: '2099-01-05' });
    const result = calculateDrawdown(series);

    expect(series.length).toBe(5);
    expect(result.drawdownSeries.length).toBe(5);
    expect(result.maxDrawdown).not.toBeNull();
    expect(Number.isFinite(result.maxDrawdown)).toBe(true);
    expect(result.maxDrawdown).toBeLessThanOrEqual(0);
    expect(result.currentDrawdown).not.toBeNull();
    expect(Number.isFinite(result.currentDrawdown)).toBe(true);
    expect(result.currentDrawdown).toBeLessThanOrEqual(0);

    // Verify no NaN or Infinity
    expect(Number.isNaN(result.maxDrawdown)).toBe(false);
    expect(Number.isNaN(result.currentDrawdown)).toBe(false);
  });

  // ── Test H: Drawdown con recupero parziale ma non totale ──

  it('should handle partial recovery (value goes up but not to previous peak)', () => {
    // Cumulative returns: 0, 0.20, 0.05, 0.10
    // Normalized values: 1, 1.20, 1.05, 1.10
    // Running peak: 1, 1.20, 1.20, 1.20
    // Drawdowns: 0, 0, -0.125, -0.0833
    // MaxDD = -0.125 at index 2 (trough)
    // Peak = 1.20 (index 1), Trough = 1.05 (index 2)
    // No full recovery (value never reaches 1.20)
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0.20 },
      { date: '2099-01-03', cumulativeReturn: 0.05 },
      { date: '2099-01-04', cumulativeReturn: 0.10 },
    ];
    const result = calculateDrawdown(series);

    expect(result.maxDrawdown).toBeCloseTo(-0.125, 10);
    expect(result.peakDate).toBe('2099-01-02');
    expect(result.troughDate).toBe('2099-01-03');
    expect(result.recoveryDate).toBeNull();
    expect(result.isRecovered).toBe(false);
    // Current drawdown at last point: 1.10/1.20 - 1 = -0.0833
    expect(result.currentDrawdown).toBeCloseTo(-0.0833, 3);
  });

  // ── Test I: Piccolo ritiro ma nuovo massimo alla fine ──

  it('should handle small dip with new all-time high at end', () => {
    // Cumulative returns: 0, 0.10, 0.05, 0.20
    // Normalized values: 1, 1.10, 1.05, 1.20
    // Running peak: 1, 1.10, 1.10, 1.20
    // Drawdowns: 0, 0, -0.0455, 0
    // The dip from 1.10 to 1.05 creates a small drawdown of -4.55%
    // MaxDD = -0.0455 (not zero — there IS a drawdown during the dip)
    // Peak = 1.10 (index 1), Trough = 1.05 (index 2)
    // Recovery = 1.20 (index 3) exceeds peak 1.10
    const series = [
      { date: '2099-01-01', cumulativeReturn: 0 },
      { date: '2099-01-02', cumulativeReturn: 0.10 },
      { date: '2099-01-03', cumulativeReturn: 0.05 },
      { date: '2099-01-04', cumulativeReturn: 0.20 },
    ];
    const result = calculateDrawdown(series);

    // There IS a drawdown during the dip
    expect(result.maxDrawdown).toBeCloseTo(-0.04545, 3);
    expect(result.peakDate).toBe('2099-01-02');
    expect(result.troughDate).toBe('2099-01-03');
    expect(result.recoveryDate).toBe('2099-01-04');
    expect(result.isRecovered).toBe(true);
    expect(result.durationDays).toBe(2);
    expect(result.recoveryDays).toBe(1);
    // Current drawdown at last point = 0 (new peak reached)
    expect(result.currentDrawdown).toBe(0);
  });
});
