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
import { buildReturnSeries, twrFromReturns } from '../performanceModel.js';
import { calculateTWR } from '../analyticsModel.js';
import { db, initializeDatabase } from '../../database.js';

// Ensure DB exists
initializeDatabase();

const SESSION_ID = 'test_session_p1';

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