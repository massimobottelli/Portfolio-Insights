/**
 * Performance & Risk — Phase 10
 *
 * Monthly Returns Heatmap — CSS Grid-based heatmap.
 * No external dependencies beyond React + Tailwind.
 * Each cell color follows a continuous gradient: pale/soft near zero,
 * saturated and intense toward the extremes of the observed range.
 */

import { useMemo, useState } from 'react';
import { MONTH_ABBR, formatReturn } from '../../lib/performanceFormat';

interface MonthlyReturnItem {
  year: number;
  month: number;
  return: number | null;
}

interface MonthlyReturnsHeatmapProps {
  monthlyReturns: MonthlyReturnItem[];
}

/** Gradient endpoints: darker/muted at extremes, lighter/brighter around zero (dark theme). */
const BRIGHT_POSITIVE = '#2fbf8f';  // bull — bright, used near zero
const DARK_POSITIVE = '#1a7a5a';    // bull più scuro — dark, at extreme positive
const BRIGHT_NEGATIVE = '#e0564f';  // bear — bright, used near zero
const DARK_NEGATIVE = '#8a3025';    // bear più scuro — dark, at extreme negative
const NEUTRAL_ZERO = '#8b93a3';     // muted — light neutral for exactly 0%
const TEXT_DARK = '#1e2530';        // ink-700
const TEXT_LIGHT = '#e8e6e1';       // paper

/** Luminance crossover at which white text becomes more readable than dark text */
const TEXT_LUMINANCE_CUTOFF = 0.225;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Perceived luminance (WCAG) of an RGB color, 0 (black) to 1 (white) */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Background + text color for a cell: t=0 → palest, t=1 → most intense */
function getCellStyle(
  returnValue: number,
  maxAbsReturn: number
): { backgroundColor: string; color: string } {
  if (returnValue === 0) {
    return { backgroundColor: NEUTRAL_ZERO, color: TEXT_DARK };
  }
  const t = maxAbsReturn > 0 ? Math.min(Math.abs(returnValue) / maxAbsReturn, 1) : 0;
  const positive = returnValue > 0;
  const rgb = mixRgb(
    hexToRgb(positive ? BRIGHT_POSITIVE : BRIGHT_NEGATIVE), // bright at t=0 (center)
    hexToRgb(positive ? DARK_POSITIVE : DARK_NEGATIVE),     // dark at t=1 (extreme)
    t
  );
  return {
    backgroundColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    color: relativeLuminance(rgb) > TEXT_LUMINANCE_CUTOFF ? TEXT_DARK : TEXT_LIGHT,
  };
}

/** Tooltip content for a month cell */
function MonthTooltip({ year, month, returnVal }: { year: number; month: number; returnVal: number | null }) {
  if (returnVal === null) {
    return (
      <div className="bg-ink-800/95 border border-gold-400/30 rounded-lg px-3 py-2 shadow-lg text-sm">
        <p className="text-paper font-semibold">{MONTH_ABBR[month - 1]} {year}</p>
        <p className="text-muted mt-1">Nessun dato</p>
      </div>
    );
  }
  const color = returnVal >= 0 ? '#2fbf8f' : '#e0564f';
  return (
    <div className="bg-ink-800/95 border border-gold-400/30 rounded-lg px-3 py-2 shadow-lg text-sm">
      <p className="text-paper font-semibold">{MONTH_ABBR[month - 1]} {year}</p>
      <p className="mt-1" style={{ color }}>
        Rendimento: {formatReturn(returnVal)}
      </p>
    </div>
  );
}

export default function MonthlyReturnsHeatmap({ monthlyReturns }: MonthlyReturnsHeatmapProps) {
  // Maximum absolute return in the dataset: anchors the gradient scale
  const maxAbsReturn = useMemo(() => {
    let max = 0;
    for (const item of monthlyReturns) {
      if (item.return !== null) {
        max = Math.max(max, Math.abs(item.return));
      }
    }
    return max;
  }, [monthlyReturns]);

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
        <p className="text-muted text-sm">Nessun dato mensile disponibile</p>
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
            <div key={m} className="text-center text-xs text-muted font-medium">
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
              <div className="text-sm font-semibold text-muted w-12 text-right pr-1">
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
                    className={`relative flex items-center justify-center rounded-md cursor-pointer h-9 text-xs font-medium transition-opacity ${
                      hasData ? '' : 'bg-ink-800 text-muted'
                    }`}
                    style={hasData ? getCellStyle(returnValue!, maxAbsReturn) : undefined}
                  >
                    {hasData ? (
                      formatReturn(returnValue!, 1)
                    ) : (
                      <span className="text-muted">—</span>
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