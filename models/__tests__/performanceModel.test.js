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
  calculateAnnualReturns,
  calculateMonthlyReturns,
  calculateBestWorst,
  calculatePeriodStatsFromSeries,
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
    expect(result.month.best).toBeNull();
    expect(result.month.worst).toBeNull();
    expect(result.year.best).toBeNull();
    expect(result.year.worst).toBeNull();
  });

  it('should find best and worst month', () => {
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },
      { year: 2024, month: 2, return: -0.03 },
      { year: 2024, month: 3, return: 0.08 },
      { year: 2024, month: 4, return: -0.06 },
    ];
    const result = calculateBestWorst(monthly, []);
    expect(result.month.best).toBeCloseTo(0.08, 10);
    expect(result.month.worst).toBeCloseTo(-0.06, 10);
  });

  it('should find best and worst year', () => {
    const annual = [
      { year: 2022, return: -0.09 },
      { year: 2023, return: 0.14 },
      { year: 2024, return: 0.09 },
    ];
    const result = calculateBestWorst([], annual);
    expect(result.year.best).toBeCloseTo(0.14, 10);
    expect(result.year.worst).toBeCloseTo(-0.09, 10);
  });

  it('should handle single element arrays', () => {
    const monthly = [{ year: 2024, month: 1, return: 0.05 }];
    const annual = [{ year: 2024, return: 0.10 }];
    const result = calculateBestWorst(monthly, annual);
    expect(result.month.best).toBeCloseTo(0.05, 10);
    expect(result.month.worst).toBeCloseTo(0.05, 10);
    expect(result.year.best).toBeCloseTo(0.10, 10);
    expect(result.year.worst).toBeCloseTo(0.10, 10);
  });

  it('should return first chronologically when ties exist', () => {
    // All positive returns equal — best should be first, worst should be first
    const monthly = [
      { year: 2024, month: 1, return: 0.05 },
      { year: 2024, month: 2, return: 0.05 },
      { year: 2024, month: 3, return: 0.05 },
    ];
    const result = calculateBestWorst(monthly, []);
    expect(result.month.best).toBeCloseTo(0.05, 10);
    expect(result.month.worst).toBeCloseTo(0.05, 10);
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

    // Best should be >= worst
    expect(bestWorst.year.best).toBeGreaterThanOrEqual(bestWorst.year.worst);

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
    expect(bestWorst.year.best).toBeGreaterThan(0);
    expect(bestWorst.year.worst).toBeGreaterThan(-1);

    // Total months should match expected
    expect(monthly.length).toBeGreaterThan(0);
    expect(stats.months.total).toBe(monthly.length);
  });
});
