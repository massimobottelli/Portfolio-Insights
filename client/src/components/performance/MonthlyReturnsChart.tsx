/**
 * Monthly Returns Chart — Vertical bar chart
 *
 * X-axis: months chronologically from first to last
 * Y-axis: monthly TWR returns
 * Green bars above zero, red bars below zero
 * 
 * Fixes:
 * - Y-axis scale aligned to zero (asymmetric range based on data)
 * - Tooltip follows mouse cursor
 * - Horizontal month labels
 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { MONTH_ABBR, formatReturn } from '../../lib/performanceFormat';

interface MonthlyReturnItem {
  year: number;
  month: number;
  return: number | null;
}

interface MonthlyReturnsChartProps {
  monthlyReturns: MonthlyReturnItem[];
}

// Layout fisso del grafico (costanti a livello modulo: usate anche nei callback)
const SVG_HEIGHT = 400;
const PADDING_TOP = 20;
const PADDING_BOTTOM = 45;
const PADDING_LEFT = 65;
const PADDING_RIGHT = 15;

export default function MonthlyReturnsChart({ monthlyReturns }: MonthlyReturnsChartProps) {
  // Filter out null values and sort chronologically
  const sortedReturns = useMemo(() => {
    const filtered = monthlyReturns.filter((r) => r.return !== null) as MonthlyReturnItem[];
    return filtered.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }, [monthlyReturns]);

  // ── Hooks: DEVONO stare tutti prima di qualsiasi early return.
  // Un return condizionato prima degli hook viola le Rules of Hooks e crasha
  // con "Rendered fewer hooks than expected" se i dati passano da vuoti a pieni.

  // Refs for responsive sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(800);

  // Update SVG width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setSvgWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const [tooltip, setTooltip] = useState<{ 
    x: number;
    y: number;
    month: number; 
    year: number; 
    value: number;
  } | null>(null);

  // Handle mouse move — position tooltip above the bar center
  const handleMouseMove = useCallback((_e: React.MouseEvent, barCenterX: number, barY: number, _barX: number, month: number, year: number, value: number) => {
    // Position tooltip 10px above the bar top, centered on the bar
    const tooltipWidth = 120; // approximate width of tooltip
    let finalX = barCenterX;
    
    // Keep tooltip within chart area
    if (barCenterX < PADDING_LEFT + tooltipWidth / 2) {
      finalX = PADDING_LEFT + tooltipWidth / 2 + 5;
    } else if (barCenterX > svgWidth - PADDING_RIGHT - tooltipWidth / 2) {
      finalX = svgWidth - PADDING_RIGHT - tooltipWidth / 2 - 5;
    }
    
    const finalY = Math.max(5, barY - 12); // 12px above bar, minimum 5px from top
    setTooltip({ x: finalX, y: finalY, month, year, value });
  }, [svgWidth]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Early return DOPO tutti gli hook
  if (sortedReturns.length === 0) {
    return (
      <div className="flex items-center justify-center h-48">
        <p className="text-slate-500 text-sm">Nessun dato mensile disponibile</p>
      </div>
    );
  }

  // Compute scales — asymmetric around zero for proper alignment
  // Compute scales — asymmetric around zero for proper alignment.
  // reduce invece di Math.max/min(...spread): con serie molto lunghe lo spread
  // può superare il limite di argomenti della call stack.
  const positiveValues = sortedReturns.map((r) => r.return!).filter((v) => v > 0);
  const negativeValues = sortedReturns.map((r) => r.return!).filter((v) => v < 0);
  const maxPositive = positiveValues.length > 0
    ? positiveValues.reduce((max, v) => (v > max ? v : max), -Infinity)
    : 0.001;
  const maxNegative = negativeValues.length > 0
    ? negativeValues.reduce((min, v) => (v < min ? v : min), Infinity)
    : -0.001;
  
  // Range for positive and negative separately
  const posRange = maxPositive * 1.15;
  const negRange = Math.abs(maxNegative) * 1.15;
  const totalRange = posRange + negRange;

  // Alias locali delle costanti di layout (usate nel JSX qui sotto)
  const svgHeight = SVG_HEIGHT;
  const paddingLeft = PADDING_LEFT;
  const paddingRight = PADDING_RIGHT;

  const chartAreaWidth = svgWidth - PADDING_LEFT - PADDING_RIGHT;
  const chartAreaHeight = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  // Each month gets equal width slot
  const totalMonths = sortedReturns.length;
  const monthSlotWidth = chartAreaWidth / totalMonths;

  // Bar width: 70% of slot, 30% gap
  const barGap = monthSlotWidth * 0.3;
  const barWidth = monthSlotWidth - barGap;

  // Zero line position — offset from top based on positive/negative ratio
  const zeroY = PADDING_TOP + posRange / totalRange * chartAreaHeight;

  // Determine which month indices to show labels for (avoid overlap)
  const labelInterval = totalMonths <= 12 ? 1 : totalMonths <= 24 ? 2 : totalMonths <= 48 ? 3 : 6;

  // Convert return value to bar properties
  // Bars always start from the zero line and extend up/down
  const getBarProps = (returnValue: number) => {
    const posPixelHeight = chartAreaHeight * posRange / totalRange;
    const negPixelHeight = chartAreaHeight * negRange / totalRange;
    
    if (returnValue >= 0) {
      // Positive bar: starts at zeroY, goes up
      const fraction = returnValue / posRange;
      const height = fraction * posPixelHeight;
      return { y: zeroY - height, height: height };
    } else {
      // Negative bar: starts at zeroY, goes down
      const fraction = Math.abs(returnValue) / negRange;
      const height = fraction * negPixelHeight;
      return { y: zeroY, height: height };
    }
  };

  return (
    <div ref={containerRef} className="w-full relative" style={{ height: svgHeight + 20 }}>
      <svg width={svgWidth} height={svgHeight} className="block">
        {/* Background */}
        <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="transparent" />

        {/* Horizontal grid lines and Y-axis labels */}
        {(() => {
          const elements: React.ReactElement[] = [];
          // Draw 5 grid lines: top, 25%, 50%, 75%, bottom of each side
          const numLines = 5;
          for (let i = 0; i < numLines; i++) {
            // Positive side (above zero)
            if (i > 0 || negativeValues.length === 0) {
              const frac = i / (numLines - 1);
              const val = frac * posRange;
              const y = zeroY - (val / posRange) * (chartAreaHeight * posRange / totalRange);
              elements.push(
                <g key={`grid-pos-${i}`}>
                  <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" />
                  <text x={paddingLeft - 8} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end">
                    {formatReturn(val)}
                  </text>
                </g>
              );
            }
            // Negative side (below zero)
            if (i > 0 || positiveValues.length === 0) {
              const frac = i / (numLines - 1);
              const val = -frac * negRange;
              const y = zeroY + (frac * negRange / negRange) * (chartAreaHeight * negRange / totalRange);
              if (i > 0 || positiveValues.length === 0) {
                elements.push(
                  <g key={`grid-neg-${i}`}>
                    <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#334155" strokeDasharray="3 3" />
                    <text x={paddingLeft - 8} y={y + 4} fill="#94a3b8" fontSize="11" textAnchor="end">
                      {formatReturn(val)}
                    </text>
                  </g>
                );
              }
            }
          }
          // Always draw zero label
          elements.push(
            <text key="zero-label" x={paddingLeft - 8} y={zeroY + 4} fill="#cbd5e1" fontSize="11" textAnchor="end" fontWeight="bold">
              {formatReturn(0)}
            </text>
          );
          return <>{elements}</>;
        })()}

        {/* Zero line — solid, thicker */}
        <line x1={paddingLeft} y1={zeroY} x2={svgWidth - paddingRight} y2={zeroY} stroke="#94a3b8" strokeWidth={2} />

        {/* X-axis labels: month-year — HORIZONTAL */}
        {sortedReturns.map((item, index) => {
          if (index % labelInterval !== 0 && index !== totalMonths - 1) return null;

          const centerX = paddingLeft + index * monthSlotWidth + monthSlotWidth / 2;
          const label = `${MONTH_ABBR[item.month - 1]} '${String(item.year).slice(2)}`;

          return (
            <text
              key={`label-${item.year}-${item.month}`}
              x={centerX}
              y={svgHeight - 12}
              fill="#94a3b8"
              fontSize="11"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}

        {/* Bars */}
        {sortedReturns.map((item, index) => {
          const slotCenter = paddingLeft + index * monthSlotWidth + monthSlotWidth / 2;
          const barX = slotCenter - barWidth / 2;
          const barCenterX = slotCenter;
          const { y: barY, height: barHeight } = getBarProps(item.return!);

          return (
            <g key={`${item.year}-${item.month}`}>
              <rect
                x={barX}
                y={barY}
                width={barWidth}
                height={barHeight}
                fill={item.return! >= 0 ? '#10b981' : '#ef4444'}
                rx={1}
                cursor="pointer"
                onMouseEnter={(e) => {
                  handleMouseMove(e, barCenterX, barY, barX, item.month, item.year, item.return!);
                }}
                onMouseMove={(e) => {
                  handleMouseMove(e, barCenterX, barY, barX, item.month, item.year, item.return!);
                }}
                onMouseLeave={handleMouseLeave}
                opacity={tooltip?.month === item.month && tooltip?.year === item.year ? 1 : 0.85}
              />
            </g>
          );
        })}
      </svg>

      {/* Custom tooltip positioned near bar and mouse */}
      {tooltip && (
        <div
          className="absolute bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-lg pointer-events-none z-50"
          style={{
            left: `${(tooltip.x / svgWidth) * 100}%`,
            top: `${(tooltip.y / svgHeight) * 100}%`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-semibold text-white text-sm">
            {MONTH_ABBR[tooltip.month - 1]} {tooltip.year}
          </p>
          <p className="text-slate-300 text-sm mt-1">
            Rendimento:{' '}
            <span style={{ color: tooltip.value >= 0 ? '#10b981' : '#ef4444' }}>
              {formatReturn(tooltip.value)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
