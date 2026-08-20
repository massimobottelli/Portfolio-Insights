/**
 * Performance & Risk — Phase 9 UI
 *
 * Page with KPIs (Cumulative Return, CAGR, Best Month, Worst Month)
 * and a cumulative performance chart with period filter.
 */

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { PerformanceAnalytics } from '../lib/performanceApi';
import {
  fetchPerformanceAnalytics,
  TIME_RANGE_OPTIONS,
  type TimeRange,
} from '../lib/performanceApi';

// ──────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────

/** Format a decimal return as percentage string: +74.2%, -9.1% */
function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) return 'N/D';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/** Format month-year for display: "Mar 2025", "Oct 2024" */
function formatMonthYear(year: number | null, month: number | null): string {
  if (year === null || month === null) return 'N/D';
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  return `${months[month - 1]} ${year}`;
}

// ──────────────────────────────────────────────
// KpiCard component (reused pattern from Dashboard.tsx)
// ──────────────────────────────────────────────

function KpiCard({
  title,
  value,
  sub,
  color,
}: {
  title: string;
  value: string;
  sub?: string | React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3 lg:p-5 flex flex-col justify-between min-h-[120px]">
      <div>
        <p className="uppercase text-slate-400 text-xs lg:text-sm font-semibold tracking-wider mb-2">{title}</p>
        <p className={`font-bold text-xl lg:text-3xl ${color}`}>{value}</p>
        {sub && <p className="text-slate-400 mt-1 text-sm lg:text-base font-medium">{sub}</p>}
      </div>
    </div>
  );
}

// Main Performance page
// ──────────────────────────────────────────────

export default function Performance() {
  const [analytics, setAnalytics] = useState<PerformanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchPerformanceAnalytics(timeRange)
      .then((data) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch performance analytics:', err);
        setError('Errore nel caricamento dei dati di performance');
        setLoading(false);
      });
  }, [timeRange]);

  // Base date from latest snapshot
  const baseDate = analytics?.period.to ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-lg">{error}</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Dati non disponibili</div>
      </div>
    );
  }

  const { performance, bestWorst, metadata } = analytics;
  const hasData = analytics.metadata.dataPoints > 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Top bar: period filter + last update */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Period filter buttons */}
        <div className="flex items-center gap-1">
          {TIME_RANGE_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTimeRange(key)}
              className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer select-none ${
                timeRange === key
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Last update date */}
        {baseDate && (
          <p className="text-slate-400 text-xs lg:text-sm flex items-center gap-1">
            <Calendar size={14} className="text-slate-400" />
            {new Date(baseDate).toLocaleDateString('it-IT')}
          </p>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-slate-500 text-lg">Nessun dato disponibile per il periodo selezionato</p>
        </div>
      ) : (
        <>
          {/* KPI Row: CAGR, Mese Migliore, Mese Peggiore */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* CAGR — Compound Annual Growth Rate */}
            <KpiCard
              title="CAGR"
              value={formatPercent(performance.cagr)}
              sub={
                <span>
                  Rendimento annuo composto
                  {metadata.periodLessThanOneYear && <><br /><span className="font-normal">(Periodo inferiore a 1 anno, CAGR stimato)</span></>}
                </span>
              }
              color={performance.cagr !== null && performance.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />

            {/* Mese Migliore */}
            <KpiCard
              title="Mese Migliore"
              value={formatPercent(bestWorst.month.return)}
              sub={bestWorst.month.year !== null && bestWorst.month.month !== null
                ? formatMonthYear(bestWorst.month.year, bestWorst.month.month)
                : undefined}
              color={bestWorst.month.return !== null && bestWorst.month.return >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />

            {/* Mese Peggiore */}
            <KpiCard
              title="Mese Peggiore"
              value={formatPercent(bestWorst.worst.return)}
              sub={bestWorst.worst.year !== null && bestWorst.worst.month !== null
                ? formatMonthYear(bestWorst.worst.year, bestWorst.worst.month)
                : undefined}
              color={bestWorst.worst.return !== null && bestWorst.worst.return >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
          </div>
        </>
      )}
    </div>
  );
}