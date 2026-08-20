/**
 * Performance & Risk — Phase 9 API Helper
 *
 * Types and fetch function for the /api/analytics/performance endpoint.
 */

import { apiFetch } from './api';

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

// ──────────────────────────────────────────────
// Time range filter (same logic as Dashboard.tsx)
// ──────────────────────────────────────────────

export type TimeRange = '1m' | '3m' | '6m' | '1y' | 'ytd' | 'all';

export const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
];

export function getCutoffDate(range: TimeRange): string | null {
  const now = new Date();
  const fmt = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  switch (range) {
    case '1m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return fmt(d);
    }
    case '3m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return fmt(d);
    }
    case '6m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 180);
      return fmt(d);
    }
    case '1y': {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      return fmt(d);
    }
    case 'ytd':
      return `${now.getFullYear()}-01-01`;
    case 'all':
      return null;
  }
}

// ──────────────────────────────────────────────
// Fetch performance analytics
// ──────────────────────────────────────────────

/**
 * Fetch all performance & risk metrics for a given time range.
 * The backend filters the canonical return series by `from`/`to` query params.
 */
export async function fetchPerformanceAnalytics(
  timeRange: TimeRange
): Promise<PerformanceAnalytics> {
  const cutoff = getCutoffDate(timeRange);
  const params = new URLSearchParams();

  if (cutoff) {
    params.set('from', cutoff);
  }

  // Default "to" to today
  const today = new Date().toISOString().split('T')[0];
  params.set('to', today);

  const response = await apiFetch(`/api/analytics/performance?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch performance analytics');
  }

  return response.json() as Promise<PerformanceAnalytics>;
}