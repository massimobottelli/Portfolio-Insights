/**
 * Performance & Risk — Fase 9/11 UI
 *
 * Pagina con KPI (CAGR), grafico rendimenti mensili, heatmap,
 * statistiche, metriche di rischio e analisi drawdown.
 */

import { useEffect, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { PerformanceAnalytics } from '../lib/performanceApi';
import { fetchPerformanceAnalytics } from '../lib/performanceApi';
import { fetchAssetTypeIRRs, type AssetTypeIRRResponse } from '../lib/performanceApi';
import type { PositionItem } from '../types';
import MonthlyReturnsChart from '../components/performance/MonthlyReturnsChart';
import MonthlyReturnsHeatmap from '../components/performance/MonthlyReturnsHeatmap';
import PeriodStatistics from '../components/performance/PeriodStatistics';
import RiskMetrics from '../components/performance/RiskMetrics';
import DrawdownAnalysis from '../components/performance/DrawdownAnalysis';
import DrawdownChart from '../components/performance/DrawdownChart';
import AssetTypeIRRTable from '../components/performance/AssetTypeIRRTable';

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
  const [riskFreeRate, setRiskFreeRate] = useState(0.022); // Default 2,20%

  // Callback stabile passata a RiskMetrics
  const handleRiskFreeRateChange = useCallback((rate: number) => {
    setRiskFreeRate(rate);
  }, []);

  // Fetch IRR per tipo asset + posizioni portfolio + singoli asset IRR (parallelo, una sola volta)
  const [irrs, setIrrs] = useState<Record<string, AssetTypeIRRResponse | null>>({});
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [assetIrrs, setAssetIrrs] = useState<Record<string, { irr: number | null; years: number | null }>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAssetTypeIRRs(),
      apiFetch('/api/analytics/portfolio').then(r => r.json()),
    ]).then(([irrData, posData]) => {
      if (!cancelled) {
        setIrrs(irrData);
        const pos = posData.positions;
        setPositions(pos);
        // Per ogni asset, fetch individuale dell'IRR (usa l'endpoint /api/analytics/asset/:id
        // che è già testato e funziona correttamente anche per BPT/BOND).
        // Promise.all: tutte le chiamate partono in parallelo.
        if (pos.length > 0) {
          const ids = [...new Set(pos.map((p: PositionItem) => p.asset_id))];
          const requests = ids.map(id =>
            apiFetch(`/api/analytics/asset/${id}`).then(r => r.json())
          );
          Promise.all(requests).then(assetsData => {
            if (!cancelled) {
              const irrMap: Record<string, { irr: number | null; years: number | null }> = {};
              for (const data of assetsData) {
                irrMap[data.asset.id] = data.irr ?? null;
              }
              setAssetIrrs(irrMap);
            }
          }).catch(err => console.error('Failed to fetch individual asset IRRs:', err));
        }
      }
    }).catch(err => console.error('Failed to fetch asset-type IRRs:', err));
    return () => { cancelled = true; };
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

  const { performance, bestWorst, metadata } = analytics;
  const hasData = analytics.metadata.dataPoints > 0;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Titolo pagina */}
      <h1 className="text-2xl font-bold text-white">Performance</h1>

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
          <p className="text-slate-500 text-lg">Nessun dato disponibile</p>
        </div>
      ) : (
        <>
          {/* Box CAGR — stesso stile del box "Valore Portafoglio" della Dashboard */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            {/* CAGR — Compound Annual Growth Rate */}
            <p className="uppercase text-slate-300 text-sm lg:text-base tracking-wider mb-2">
              CAGR
            </p>
            <p className={`font-bold text-4xl lg:text-6xl ${performance.cagr !== null && performance.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercent(performance.cagr)}
            </p>
            <p className="text-slate-300 mt-2 text-base lg:text-lg font-medium">
              Rendimento annuo composto time-weighted
              {metadata.periodLessThanOneYear && <> <span className="font-normal">(Periodo inferiore a 1 anno, CAGR stimato)</span></>}
            </p>
          </div>

          {/* IRR per Tipo Asset — tabella raggruppata sotto CAGR */}
          {Object.keys(irrs).length > 0 && positions.length > 0 && (
            <AssetTypeIRRTable irrs={irrs} positions={positions} assetIrrs={assetIrrs} />
          )}

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

          {/* Performance Mesi / Anni */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
            <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
              Performance Mesi / Anni
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

          {/* Titolo sezione Rischio */}
          <h1 className="text-2xl font-bold text-white">Rischio</h1>

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