/**
 * Performance & Risk — Phase 9 API Helper
 *
 * Types and fetch function for the /api/analytics/performance endpoint.
 */

import { apiFetch } from './api';
import { getCutoffDate, type TimeRange } from './timeRange';

// ──────────────────────────────────────────────
// Types matching the backend response
// ──────────────────────────────────────────────

export interface PerformanceAnalytics {
  period: { from: string; to: string; days: number };
  riskFreeRate: number;
  metadata: {
    dataPoints: number;
    hasGaps: boolean;
    periodLessThanOneYear: boolean;
  };
  performance: {
    cumulativeReturn: number | null;
    cagr: number | null;
  };
  risk: {
    dailyVolatility: number | null;
    annualizedVolatility: number | null;
    sharpeRatio: number | null;
  };
  periodStats: {
    months: PeriodStatistics;
    years: PeriodStatistics;
  };
  bestWorst: {
    month: BestWorstMonthItem;
    worst: BestWorstMonthItem;
    year: { year: number | null; return: number | null };
    worstYear: { year: number | null; return: number | null };
  };
  drawdown: {
    current: number | null;
    maximum: number | null;
    peakDate: string | null;
    troughDate: string | null;
    recoveryDate: string | null;
    durationDays: number | null;
    recoveryDays: number | null;
    isRecovered: boolean;
  };
  annualReturns: Array<{ year: number; return: number }>;
  monthlyReturns: Array<{ year: number; month: number; return: number }>;
  cumulativeSeries: Array<{ date: string; value: number }>;
}

interface PeriodStatistics {
  positive: number;
  negative: number;
  flat: number;
  total: number;
  positiveRate: number;
  negativeRate: number;
}

interface BestWorstMonthItem {
  year: number | null;
  month: number | null;
  return: number | null;
}

// TimeRange, TIME_RANGE_OPTIONS e getCutoffDate sono importati da ./timeRange
// (condivisi con Dashboard.tsx — erano duplicati qui).

// ──────────────────────────────────────────────
// Fetch performance analytics
// ──────────────────────────────────────────────

/**
 * Fetch all performance & risk metrics for a given time range.
 * The backend filters the canonical return series by `from`/`to` query params.
 *
 * @param timeRange - Periodo da analizzare
 * @param riskFreeRate - Tasso risk-free annuo in decimale (es. 0.025 = 2,5%)
 */
export async function fetchPerformanceAnalytics(
  timeRange: TimeRange,
  riskFreeRate = 0
): Promise<PerformanceAnalytics> {
  const cutoff = getCutoffDate(timeRange);
  const params = new URLSearchParams();

  if (cutoff) {
    params.set('from', cutoff);
  }

  // Default "to" to today
  const today = new Date().toISOString().split('T')[0];
  params.set('to', today);
  // Il backend si aspetta la percentuale (2.5), lo stato React tiene il decimale (0.025)
  params.set('riskFreeRate', String(riskFreeRate * 100));

  const response = await apiFetch(`/api/analytics/performance?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch performance analytics');
  }

  return response.json() as Promise<PerformanceAnalytics>;
}
