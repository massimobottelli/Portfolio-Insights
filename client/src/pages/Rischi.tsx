/**
 * Rischi — metriche di rischio e analisi drawdown
 *
 * Sezioni spostate dalla pagina Performance: RiskMetrics (con risk-free rate
 * configurabile dall'utente), DrawdownAnalysis e DrawdownChart.
 */

import { useCallback, useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { PerformanceAnalytics } from '../lib/performanceApi';
import { fetchPerformanceAnalytics } from '../lib/performanceApi';
import RiskMetrics from '../components/performance/RiskMetrics';
import DrawdownAnalysis from '../components/performance/DrawdownAnalysis';
import DrawdownChart from '../components/performance/DrawdownChart';

export default function Rischi() {
  const [analytics, setAnalytics] = useState<PerformanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Il tasso risk-free è aggiornato SOLO dall'input utente in RiskMetrics
  // (mai risincronizzato dal server: evita loop di refetch per floating point).
  const [riskFreeRate, setRiskFreeRate] = useState(0.022); // Default 2,20%

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
      setError('Errore nel caricamento dei dati di rischio');
    } finally {
      setLoading(false);
    }
  }, [riskFreeRate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Base date from latest snapshot
  const baseDate = analytics?.period.to ?? null;

  // Schermata di caricamento SOLO al primo load: durante i refetch (es. ricalcolo
  // Sharpe) manteniamo i dati visibili per non far saltare la posizione di scroll.
  if (loading && !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  if (error && !analytics) {
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

  const hasData = analytics.metadata.dataPoints > 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Titolo pagina */}
      <h1 className="text-2xl font-bold text-white">Rischi</h1>

      {/* Top bar: last update date */}
      <div className="flex justify-end">
        {baseDate && (
          <p className="text-slate-400 text-xs lg:text-sm flex items-center gap-1">
            <Calendar size={14} className="text-slate-400" />
            Ultimo aggiornamento: {new Date(baseDate).toLocaleDateString('it-IT')}
          </p>
        )}
      </div>

      {/* Errore durante un refetch con dati già visibili: banner inline,
          la pagina non viene sostituita (preserva posizione di scroll). */}
      {error && hasData && (
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {!hasData ? (
        <div className="flex items-center justify-center h-32">
          <p className="text-slate-400">Nessun dato disponibile per il calcolo delle metriche di rischio</p>
        </div>
      ) : (
        <>
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
              Drawdown
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
