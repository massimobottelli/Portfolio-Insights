/**
 * Performance & Risk — Phase 10
 *
 * Monthly Returns Heatmap — CSS Grid-based heatmap.
 * No external dependencies beyond React + Tailwind.
 * Each cell color reflects the monthly return value.
 */

import { useState } from 'react';

interface MonthlyReturnItem {
  year: number;
  month: number;
  return: number | null;
}

interface MonthlyReturnsHeatmapProps {
  monthlyReturns: MonthlyReturnItem[];
}

/** Italian month abbreviations */
const MONTH_ABBR = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

/** Format a decimal return as percentage string */
function formatReturn(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

/** Get CSS background class based on return value */
function getCellBgClass(returnValue: number | null): string {
  if (returnValue === null) return 'bg-slate-700 text-slate-500';
  if (returnValue >= 0.05) return 'bg-emerald-600 text-white';
  if (returnValue >= 0.02) return 'bg-emerald-700 text-white';
  if (returnValue >= 0.01) return 'bg-emerald-800 text-emerald-100';
  if (returnValue > 0) return 'bg-emerald-900 text-emerald-200';
  if (returnValue === 0) return 'bg-slate-700 text-slate-400';
  if (returnValue >= -0.01) return 'bg-red-900 text-red-200';
  if (returnValue >= -0.02) return 'bg-red-800 text-red-100';
  if (returnValue >= -0.05) return 'bg-red-700 text-white';
  return 'bg-red-600 text-white';
}

/** Tooltip content for a month cell */
function MonthTooltip({ year, month, returnVal }: { year: number; month: number; returnVal: number | null }) {
  if (returnVal === null) {
    return (
      <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="text-white font-semibold">{MONTH_ABBR[month - 1]} {year}</p>
        <p className="text-slate-300 mt-1">Nessun dato</p>
      </div>
    );
  }
  const color = returnVal >= 0 ? '#10b981' : '#ef4444';
  return (
    <div className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="text-white font-semibold">{MONTH_ABBR[month - 1]} {year}</p>
      <p className="mt-1" style={{ color }}>
        Rendimento: {formatReturn(returnVal)}
      </p>
    </div>
  );
}

export default function MonthlyReturnsHeatmap({ monthlyReturns }: MonthlyReturnsHeatmapProps) {
  // Group by year
  const yearMap = new Map<number, Array<{ month: number; return: number | null }>>();
  for (const item of monthlyReturns) {
    if (!yearMap.has(item.year)) {
      yearMap.set(item.year, []);
    }
    yearMap.get(item.year)!.push({ month: item.month, return: item.return });
  }

  // Sort years ascending (oldest first, most recent last)
  const sortedYears = Array.from(yearMap.keys()).sort((a, b) => a - b);

  if (sortedYears.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate-500 text-sm">Nessun dato mensile disponibile</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto py-4">
      <div className="min-w-[650px]">
        {/* Header row: month abbreviations */}
        {/* Note: grid-cols-13 not in standard Tailwind, use inline style */}
        <div
          className="grid gap-1 mb-1"
          style={{ gridTemplateColumns: '3rem repeat(12, 1fr)' }}
        >
          <div className="w-12" /> {/* Year label placeholder */}
          {MONTH_ABBR.map((m) => (
            <div key={m} className="text-center text-xs text-slate-400 font-medium">
              {m}
            </div>
          ))}
        </div>

        {/* Data rows: one per year */}
        {sortedYears.map((year) => {
          const months = yearMap.get(year)!;
          // Create array of 12 months (index 0 = Jan, etc.)
          const monthData = new Array<number | null>(13).fill(null); // 1-indexed
          for (const m of months) {
            monthData[m.month] = m.return;
          }

          return (
            <div
              key={year}
              className="grid gap-1 mb-1 items-center"
              style={{ gridTemplateColumns: '3rem repeat(12, 1fr)' }}
            >
              {/* Year label */}
              <div className="text-sm font-semibold text-slate-300 w-12 text-right pr-1">
                {year}
              </div>

              {/* Month cells */}
              {Array.from({ length: 12 }, (_, i) => {
                const monthNum = i + 1;
                const returnValue = monthData[monthNum];
                const hasData = returnValue !== null;

                return (
                  <div
                    key={monthNum}
                    className={`
                      relative flex items-center justify-center rounded-md cursor-pointer
                      h-9 text-xs font-medium transition-opacity
                      ${hasData ? getCellBgClass(returnValue!) : 'bg-slate-800 text-slate-600'}
                    `}
                    title={hasData ? `${MONTH_ABBR[i]} ${year}: ${formatReturn(returnValue!)}` : `${MONTH_ABBR[i]} ${year}: N/D`}
                  >
                    {hasData ? (
                      formatReturn(returnValue!)
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}

                    {/* Hover tooltip using state */}
                    <HoverTooltip>
                      <MonthTooltip year={year} month={monthNum} returnVal={returnValue} />
                    </HoverTooltip>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Simple hover tooltip wrapper using absolute positioning */
function HoverTooltip({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap">
          {children}
        </div>
      )}
    </div>
  );
}