/**
 * Performance & Risk — Fase 11: RiskMetrics
 *
 * Sezione metriche di rischio con volatilità annualizzata, Sharpe ratio
 * e input interattivo per il tasso risk-free (default 2,20%).
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
  // Local state for RF input (percentage value, e.g. 2.20)
  const [rfInput, setRfInput] = useState(
    riskFreeRate !== null ? (riskFreeRate * 100).toFixed(2) : '2.20'
  );
  const [error, setError] = useState<string | null>(null);

  // Handle RF change: aggiorna SOLO lo stato locale e la validazione.
  // Il valore NON viene propagato al parent qui: il ricalcolo dello Sharpe
  // avviene esclusivamente alla pressione del bottone "Ricalcola Sharpe".
  const handleRfChange = useCallback((value: string) => {
    setRfInput(value);
    validateRate(value);
  }, []);

  // Valida il tasso inserito (-100 < rate < 100) e restituisce il valore in decimale,
  // oppure null se invalido (impostando anche il messaggio d'errore).
  const validateRate = useCallback((value: string): number | null => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= -100 || num >= 100) {
      setError('Il tasso deve essere tra -100% e +100%');
      return null;
    }
    setError(null);
    return num / 100;
  }, []);

  // Al click sul bottone: valida e propaga al parent, che ricalcola lo Sharpe.
  const handleRecalculate = useCallback(() => {
    const rate = validateRate(rfInput);
    if (rate !== null) {
      onRiskFreeRateChange?.(rate);
    }
  }, [rfInput, validateRate, onRiskFreeRateChange]);

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
              {/* Input compatto: il ricalcolo avviene solo col bottone */}
              <input
                type="number"
                step="0.01"
                min="-100"
                max="100"
                value={rfInput}
                onChange={(e) => handleRfChange(e.target.value)}
                className="w-32 [color-scheme:dark] bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-lg font-bold text-center focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="2,20"
              />
              <span className="text-slate-400 text-sm font-medium">%</span>
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={error !== null}
                className="ml-auto bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white rounded px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Ricalcola Sharpe
              </button>
            </div>
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>
          <p className="text-slate-500 mt-1 text-xs">Tasso annuale privo di rischio</p>
        </div>
      </div>
    </div>
  );
}