/**
 * Performance & Risk — Fase 11: DrawdownAnalysis
 *
 * Sezione analisi drawdown con statistiche: max drawdown, data di massimo/minimo,
 * data di recupero, durata e tempo di recupero.
 */

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface DrawdownAnalysisProps {
  maximum: number | null;
  peakDate: string | null;
  troughDate: string | null;
  recoveryDate: string | null;
  durationDays: number | null;
  recoveryDays: number | null;
  isRecovered: boolean;
}

// ──────────────────────────────────────────────
// Formatting helpers (Italian locale)
// ──────────────────────────────────────────────

const percentFmt = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/D';
  return new Date(dateStr).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export default function DrawdownAnalysis({
  maximum,
  peakDate,
  troughDate,
  recoveryDate,
  durationDays,
  recoveryDays,
  isRecovered,
}: DrawdownAnalysisProps) {
  // Determine status text and icon
  let statusText = '';
  let statusIcon = '';
  let statusColor = '';

  if (maximum === 0 || maximum === null) {
    // No drawdown occurred or no data
    if (maximum === 0) {
      statusText = 'Assente';
      statusIcon = '✓';
      statusColor = 'text-emerald-400';
    } else {
      statusText = 'N/D';
      statusIcon = '?';
      statusColor = 'text-slate-400';
    }
  } else if (isRecovered) {
    statusText = 'Recuperato';
    statusIcon = '✓';
    statusColor = 'text-emerald-400';
  } else {
    statusText = 'In corso';
    statusIcon = '⏳';
    statusColor = 'text-amber-400';
  }

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Max Drawdown */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Max Drawdown
          </p>
          <p className={`font-bold text-2xl ${maximum !== null && maximum < -0.1 ? 'text-red-500' : maximum !== null && maximum < 0 ? 'text-red-400' : 'text-slate-300'}`}>
            {maximum !== null ? percentFmt.format(maximum) : 'N/D'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">Calatura massima dal picco</p>
        </div>

        {/* Duration */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Durata Drawdown
          </p>
          <p className="font-bold text-2xl text-slate-300">
            {durationDays !== null ? `${durationDays} giorni` : isRecovered ? 'N/D' : 'In corso'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">Dal massimo al recupero</p>
        </div>

        {/* Recovery Time */}
        <div className="flex-1 bg-slate-900 rounded-lg border border-slate-700 p-3">
          <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
            Tempo Recupero
          </p>
          <p className="font-bold text-2xl text-slate-300">
            {recoveryDays !== null ? `${recoveryDays} giorni` : isRecovered ? 'N/D' : 'In corso'}
          </p>
          <p className="text-slate-500 mt-1 text-xs">Dal minimo al recupero</p>
        </div>
      </div>

      {/* Detailed dates table */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-4">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-2 text-slate-400 uppercase text-xs tracking-wider">Data di massimo</td>
              <td className="py-2 text-white font-medium text-right">{formatDate(peakDate)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 text-slate-400 uppercase text-xs tracking-wider">Data di minimo</td>
              <td className="py-2 text-white font-medium text-right">{formatDate(troughDate)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2 text-slate-400 uppercase text-xs tracking-wider">Data di recupero</td>
              <td className="py-2 text-white font-medium text-right">{formatDate(recoveryDate)}</td>
            </tr>
            <tr>
              <td className="py-2 text-slate-400 uppercase text-xs tracking-wider">Stato</td>
              <td className={`py-2 font-medium text-right ${statusColor}`}>
                <span className="mr-1">{statusIcon}</span>
                {statusText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}