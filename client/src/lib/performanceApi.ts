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
 * @param riskFreeRate - Tasso risk-free annuo in decimale (es. 0.025 = 2,5%).
 *   Se omesso, il parametro NON viene inviato e il backend applica il default
 *   configurato (RISK_FREE_RATE in .env / ultima scelta utente persistita).
 */
export async function fetchPerformanceAnalytics(
  timeRange: TimeRange,
  riskFreeRate?: number
): Promise<PerformanceAnalytics> {
  const cutoff = getCutoffDate(timeRange);
  const params = new URLSearchParams();

  if (cutoff) {
    params.set('from', cutoff);
  }

  // Default "to" to today
  const today = new Date().toISOString().split('T')[0];
  params.set('to', today);
  // Il backend si aspetta la percentuale (2.5), lo stato React tiene il decimale (0.025).
  // Param omesso → il backend usa il suo default configurato.
  if (riskFreeRate !== undefined) {
    params.set('riskFreeRate', String(riskFreeRate * 100));
  }

  const response = await apiFetch(`/api/analytics/performance?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Failed to fetch performance analytics');
  }

  return response.json() as Promise<PerformanceAnalytics>;
}

// ──────────────────────────────────────────────
// Fetch & save per il tasso risk-free configurato
// ──────────────────────────────────────────────

/**
 * Recupera il tasso risk-free effettivo (GET /api/analytics/risk-free-rate).
 * Ritorna il valore in decimale (es. 0.025 = 2,5%): ultima scelta utente
 * persistita, altrimenti il default da RISK_FREE_RATE (.env).
 */
export async function fetchRiskFreeRateDefault(): Promise<number> {
  const response = await apiFetch('/api/analytics/risk-free-rate');
  if (!response.ok) {
    throw new Error('Failed to fetch risk-free rate default');
  }
  const data = (await response.json()) as { riskFreeRate: number };
  return data.riskFreeRate;
}

/**
 * Persiste la scelta utente del tasso risk-free (PUT /api/analytics/risk-free-rate).
 * Il backend si aspetta la percentuale (2.5), lo stato React tiene il decimale (0.025).
 */
export async function saveRiskFreeRate(riskFreeRate: number): Promise<void> {
  const response = await apiFetch('/api/analytics/risk-free-rate', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ riskFreeRate: riskFreeRate * 100 }),
  });
  if (!response.ok) {
    throw new Error('Failed to save risk-free rate');
  }
}

// ──────────────────────────────────────────────
// Types & fetch for Asset Type IRR
// ──────────────────────────────────────────────

/** Risposta per singolo asset type dall'endpoint /api/analytics/asset-type/irr */
export interface AssetTypeIRRResponse {
  irr: number | null;
  years: number | null;
  assetCount: number;
  totalInvested: number;
  totalCurrent: number;
}

/**
 * Fetch IRR aggregated by asset type(s).
 * Returns a map keyed by asset type (e.g. { STOCK: {...}, BOND: {...} }).
 * Each value is null when there is insufficient data for that type.
 */
export async function fetchAssetTypeIRRs(
  assetType?: string
): Promise<Record<string, AssetTypeIRRResponse | null>> {
  const params = assetType ? `?assetType=${encodeURIComponent(assetType)}` : '';
  const url = `/api/analytics/asset-type/irr${params}`;
  const response = await apiFetch(url);

  if (!response.ok) {
    throw new Error('Failed to fetch asset type IRRs');
  }

  return response.json() as Promise<Record<string, AssetTypeIRRResponse | null>>;
}
