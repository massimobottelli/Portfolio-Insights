/**
 * Performance & Risk — Fase 11: RiskMetrics
 *
 * Sezione metriche di rischio con volatilità annualizzata, Sharpe ratio
 * e input interattivo per il tasso risk-free (default 2,50%).
 */

import { useState, useCallback } from 'react';

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface RiskMetricsProps {
  annualizedVolatility: number | null;
  sharpeRatio: number | null;
  riskFreeRate: number; // decimal from API (0.025 = 2.5%)
  /** Chiamato quando l'utente inserisce un tasso risk-free valido (in decimale) */
  onRiskFreeRateChange?: (rate: number) => void;
}

// ──────────────────────────────────────────────
// Formatting helpers (Italian locale)
// ──────────────────────────────────────────────

const percentFmt = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimalFmt = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function RiskMetrics({
  annualizedVolatility,
  sharpeRatio,
  riskFreeRate,
  onRiskFreeRateChange,
}: RiskMetricsProps) {
  // Local state for RF input (percentage value, e.g. 2.50)
  const [rfInput, setRfInput] = useState(
    riskFreeRate !== null ? (riskFreeRate * 100).toFixed(2) : '2.50'
  );
  const [error, setError] = useState<string | null>(null);

  // Handle RF change: valida e propaga al parent, che ricalcola lo Sharpe.
  // Il valore NON viene mai risincronizzato dal prop (evita loop di refetch):
  // la fonte di verità è l'input dell'utente.
  const handleRfChange = useCallback((value: string) => {
    setRfInput(value);

    const num = parseFloat(value);
    // Validate: must be numeric, -100 < rate < 100
    if (isNaN(num) || num <= -100 || num >= 100) {
      setError('Il tasso deve essere tra -100% e +100%');
      return;
    }

    setError(null);
    onRiskFreeRateChange?.(num / 100);
  }, [onRiskFreeRateChange]);

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Volatilità Annualizzata */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Volatilità Annua
          </p>
          <p className={`font-bold text-2xl ${annualizedVolatility !== null && annualizedVolatility > 0 ? 'text-amber-400' : 'text-slate-300'}`}>
            {annualizedVolatility !== null ? percentFmt.format(annualizedVolatility) : 'N/D'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">Deviazione standard annualizzata</p>
        </div>

        {/* Rapporto Sharpe */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Rapporto Sharpe
          </p>
          <p className={`font-bold text-2xl ${sharpeRatio !== null ? (sharpeRatio >= 1 ? 'text-emerald-400' : sharpeRatio >= 0 ? 'text-amber-400' : 'text-red-400') : 'text-slate-300'}`}>
            {sharpeRatio !== null ? decimalFmt.format(sharpeRatio) : 'N/D'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">Excess return / volatilità</p>
        </div>

        {/* Tasso Risk-Free */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Tasso Risk-Free
          </p>
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="-100"
                max="100"
                value={rfInput}
                onChange={(e) => handleRfChange(e.target.value)}
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-xl font-bold text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="2,50"
              />
              <span className="text-slate-400 text-sm font-medium">%</span>
            </div>
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
          <p className="text-slate-500 mt-1 text-xs">Tasso annuale privo di rischio</p>
        </div>
      </div>
    </div>
  );
}