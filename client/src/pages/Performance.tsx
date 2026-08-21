/**
 * Performance & Risk — Phase 9 UI
 *
 * Page with KPIs (Cumulative Return, CAGR, Best Month, Worst Month)
 * and a cumulative performance chart with period filter.
 */

import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { PerformanceAnalytics } from '../lib/performanceApi';
import { fetchPerformanceAnalytics } from '../lib/performanceApi';
import MonthlyReturnsChart from '../components/performance/MonthlyReturnsChart';
import PeriodStatistics from '../components/performance/PeriodStatistics';

// ──────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────

/** Format a decimal return as percentage string: +74.2%, -9.1% */
function formatPercent(value: number | null, decimals = 1): string {
  if (value === null) return 'N/D';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetchPerformanceAnalytics('all')
      .then((data) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch performance analytics:', err);
        setError('Errore nel caricamento dei dati di performance');
        setLoading(false);
      });
  }, []);

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
      {/* Top bar: last update date only */}
      <div className="flex justify-end">
        {baseDate && (
          <p className="text-slate-400 text-xs lg:text-sm flex items-center gap-1">
            <Calendar size={14} className="text-slate-400" />
            Ultimo aggiornamento: {new Date(baseDate).toLocaleDateString('it-IT')}
          </p>
        )}
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-slate-500 text-lg">Nessun dato disponibile per il periodo selezionato</p>
        </div>
      ) : (
        <>
          {/* KPI Row: solo CAGR */}
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
          </div>

          {/* Monthly Returns Bar Chart */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-4">
              Rendimenti Mensili
            </h3>
            <MonthlyReturnsChart monthlyReturns={analytics.monthlyReturns} />
          </div>

          {/* Statistics */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Statistiche
            </h3>
            <PeriodStatistics
              months={analytics.periodStats.months}
              years={analytics.periodStats.years}
              bestWorst={{
                month: bestWorst.month,
                worst: bestWorst.worst,
                year: bestWorst.year,
                worstYear: bestWorst.worstYear,
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}