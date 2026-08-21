/**
 * Performance & Risk — Fase 9/11 UI
 *
 * Pagina con KPI (CAGR), grafico rendimenti mensili, heatmap,
 * statistiche, metriche di rischio e analisi drawdown.
 */

import { useEffect, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import type { PerformanceAnalytics } from '../lib/performanceApi';
import { fetchPerformanceAnalytics } from '../lib/performanceApi';
import MonthlyReturnsChart from '../components/performance/MonthlyReturnsChart';
import MonthlyReturnsHeatmap from '../components/performance/MonthlyReturnsHeatmap';
import PeriodStatistics from '../components/performance/PeriodStatistics';
import RiskMetrics from '../components/performance/RiskMetrics';
import DrawdownAnalysis from '../components/performance/DrawdownAnalysis';
import DrawdownChart from '../components/performance/DrawdownChart';

// ──────────────────────────────────────────────
// Formatting helpers
// ──────────────────────────────────────────────

/** Format a decimal return as percentage string: +74,2%, -9,1% */
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

// ──────────────────────────────────────────────
// Main Performance page
//
// NOTA: le metriche sono calcolate SEMPRE sull'intero periodo di investimento.
// Il filtro per periodi (1M/3M/6M/1Y/YTD) è stato rimosso su richiesta:
// la serie canonica non viene più limitata da un cutoff iniziale.
// ──────────────────────────────────────────────

export default function Performance() {
  const [analytics, setAnalytics] = useState<PerformanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Il tasso risk-free è aggiornato SOLO dall'input utente in RiskMetrics
  // (mai risincronizzato dal server: evita loop di refetch per floating point).
  const [riskFreeRate, setRiskFreeRate] = useState(0.025); // Default 2,50%

  // Callback stabile passata a RiskMetrics
  const handleRiskFreeRateChange = useCallback((rate: number) => {
    setRiskFreeRate(rate);
  }, []);

  // Fetch analytics sull'INTERO periodo di investimento ('all' = nessun cutoff)
  // e con il risk-free rate corrente.
  // NOTA: non sincronizziamo riskFreeRate dalla risposta del backend:
  // lo stato locale è l'unica fonte di verità e scriverlo dal server
  // poteva innescare un loop di refetch in caso di differenze di floating point.
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPerformanceAnalytics('all', riskFreeRate);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to fetch performance analytics:', err);
      setError('Errore nel caricamento dei dati di performance');
    } finally {
      setLoading(false);
    }
  }, [riskFreeRate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      {/* Top bar: last update date */}
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
          <p className="text-slate-500 text-lg">Nessun dato disponibile</p>
        </div>
      ) : (
        <>
          {/* KPI Row: CAGR */}
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

          {/* Monthly Returns Heatmap */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Heatmap Rendimenti Mensili
            </h3>
            <MonthlyReturnsHeatmap monthlyReturns={analytics.monthlyReturns} />
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

          {/* Risk Metrics */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Rischio
            </h3>
            <RiskMetrics
              annualizedVolatility={analytics.risk.annualizedVolatility}
              sharpeRatio={analytics.risk.sharpeRatio}
              riskFreeRate={riskFreeRate}
              onRiskFreeRateChange={handleRiskFreeRateChange}
            />
          </div>

          {/* Drawdown Analysis */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Analisi Drawdown
            </h3>
            <DrawdownAnalysis
              maximum={analytics.drawdown.maximum}
              peakDate={analytics.drawdown.peakDate}
              troughDate={analytics.drawdown.troughDate}
              recoveryDate={analytics.drawdown.recoveryDate}
              durationDays={analytics.drawdown.durationDays}
              recoveryDays={analytics.drawdown.recoveryDays}
              isRecovered={analytics.drawdown.isRecovered}
            />
          </div>

          {/* Drawdown Chart */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Andamento Drawdown
            </h3>
            <DrawdownChart cumulativeSeries={analytics.cumulativeSeries} />
          </div>
        </>
      )}
    </div>
  );
}