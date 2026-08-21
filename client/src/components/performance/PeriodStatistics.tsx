/**
 * Performance & Risk — Phase 10
 *
 * Period Statistics — Summary of positive/negative/flat periods
 * for months and years, plus best/worst month/year.
 */

interface PeriodStats {
  positive: number;
  negative: number;
  flat: number;
  total: number;
  positiveRate: number | null;
  negativeRate: number | null;
}

interface BestWorstMonthItem {
  year: number | null;
  month: number | null;
  return: number | null;
}

interface BestWorstYearItem {
  year: number | null;
  return: number | null;
}

interface BestWorst {
  month: BestWorstMonthItem;
  worst: BestWorstMonthItem;
  year: BestWorstYearItem;
  worstYear: BestWorstYearItem;
}

interface PeriodStatisticsProps {
  months: PeriodStats;
  years: PeriodStats;
  bestWorst: BestWorst;
}

/** Format a decimal return as percentage string: 0.083 → +8.3% */
function formatReturn(value: number | null, decimals = 1): string {
  if (value === null) return 'N/D';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(decimals)}%`;
}

/** Format month-year for display: "Mar 2025", "Oct 2024" */
function formatMonthYear(year: number | null, month: number | null): string {
  if (year === null || month === null) return 'N/D';
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  return `${months[month - 1]} ${year}`;
}

/** Render a single stat row */
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}

export default function PeriodStatistics({ months, years, bestWorst }: PeriodStatisticsProps) {
  return (
    <div className="space-y-4">
      {/* Row 1: Positive/Negative counts for months and years */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mesi Positivi / Negativi */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h4 className="uppercase text-slate-300 text-sm font-semibold tracking-wider mb-3">
            Mesi Positivi / Negativi
          </h4>
          <div className="space-y-2">
            <StatRow label="Positivi" value={`${months.positive}`} />
            <StatRow label="Negativi" value={`${months.negative}`} />
            <StatRow label="Totali" value={`${months.total}`} />
          </div>
        </div>

        {/* Anni Positivi / Negativi */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h4 className="uppercase text-slate-300 text-sm font-semibold tracking-wider mb-3">
            Anni Positivi / Negativi
          </h4>
          <div className="space-y-2">
            <StatRow label="Positivi" value={`${years.positive}`} />
            <StatRow label="Negativi" value={`${years.negative}`} />
            <StatRow label="Totali" value={`${years.total}`} />
          </div>
        </div>
      </div>

      {/* Row 2: Best/Worst Month and Year */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mese Migliore / Peggiore */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h4 className="uppercase text-slate-300 text-sm font-semibold tracking-wider mb-3">
            Mese Migliore / Peggiore
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Mese migliore</span>
              <span className="text-white font-bold text-sm">
                {formatMonthYear(bestWorst.month.year, bestWorst.month.month)}
              </span>
              <span className="text-emerald-400 font-medium">{formatReturn(bestWorst.month.return)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Mese peggiore</span>
              <span className="text-white font-bold text-sm">
                {formatMonthYear(bestWorst.worst.year, bestWorst.worst.month)}
              </span>
              <span className="text-red-400 font-medium">{formatReturn(bestWorst.worst.return)}</span>
            </div>
          </div>
        </div>

        {/* Anno Migliore / Peggiore */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <h4 className="uppercase text-slate-300 text-sm font-semibold tracking-wider mb-3">
            Anno Migliore / Peggiore
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Anno migliore</span>
              <span className="text-white font-bold text-sm">
                {bestWorst.year.year ?? 'N/D'}
              </span>
              <span className="text-emerald-400 font-medium">{formatReturn(bestWorst.year.return)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Anno peggiore</span>
              <span className="text-white font-bold text-sm">
                {bestWorst.worstYear.year ?? 'N/D'}
              </span>
              <span className="text-red-400 font-medium">{formatReturn(bestWorst.worstYear.return)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}