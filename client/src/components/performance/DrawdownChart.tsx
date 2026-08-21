/**
 * Performance & Risk — Fase 11: DrawdownChart
 *
 * Grafico Recharts del drawdown calcolato dalla serie cumulativa di performance.
 * Stile coerente con il grafico in Dashboard.tsx.
 */

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface DrawdownChartProps {
  /** Serie cumulativa di performance dal backend [{ date, value }] */
  cumulativeSeries: Array<{ date: string; value: number }>;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Calcola la serie drawdown a partire dalla serie cumulativa */
function buildDrawdownData(
  cumulativeSeries: Array<{ date: string; value: number }>
): Array<{ date: string; drawdown: number }> {
  if (cumulativeSeries.length === 0) return [];

  const result: Array<{ date: string; drawdown: number }> = [];
  let runningPeak = -Infinity;

  for (const point of cumulativeSeries) {
    if (point.value > runningPeak) {
      runningPeak = point.value;
    }
    const drawdown = runningPeak !== 0 ? point.value / runningPeak - 1 : 0;
    result.push({ date: point.date, drawdown });
  }

  return result;
}

/** Formatta data per tick asse X (MM/YY) */
function formatTickDate(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear().toString().slice(-2);
  return `${mm}/${yy}`;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function DrawdownChart({ cumulativeSeries }: DrawdownChartProps) {
  const drawdownData = useMemo(
    () => buildDrawdownData(cumulativeSeries),
    [cumulativeSeries]
  );

  // Empty state
  if (drawdownData.length === 0) {
    return (
      <div className="mt-4">
        <div className="bg-slate-900 rounded-lg border border-slate-700 p-6 text-center">
          <p className="text-slate-500">Nessun dato disponibile per il grafico del drawdown</p>
        </div>
      </div>
    );
  }

  // Custom tooltip — mostra solo data e percentuale drawdown
  function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { date: string; drawdown: number } }> }) {
    if (!active || !payload || payload.length === 0) return null;

    const item = payload[0].payload;
    const drawdownPct = (item.drawdown * 100).toFixed(2);

    return (
      <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-lg">
        <p className="text-slate-300 text-sm">
          {new Date(item.date).toLocaleDateString('it-IT', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })}
        </p>
        <p className="font-semibold text-red-400 text-sm mt-1">
          Drawdown: {drawdownPct}%
        </p>
      </div>
    );
  }

  // Determina dominio Y automatico
  const minDrawdown = Math.min(...drawdownData.map((d) => d.drawdown));
  const yDomain = [minDrawdown * 1.1, 0]; // 10% extra sotto il minimo per visibilità

  return (
    <div className="mt-4">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={drawdownData}
          margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={formatTickDate}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            domain={yDomain}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="drawdown"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#drawdownGradient)"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}