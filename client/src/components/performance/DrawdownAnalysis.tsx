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

  // Layout a griglia 2 righe × 2 colonne:
  //   R1 C1: Max Drawdown          | R1 C2: date (inizio/minimo/recupero) + stato
  //   R2 C1: Durata Drawdown       | R2 C2: Tempo Recupero
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* R1 C1 — Max Drawdown */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3 flex flex-col justify-center">
        <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
          Max Drawdown
        </p>
        <p className={`font-bold text-2xl ${maximum !== null && maximum < -0.1 ? 'text-red-500' : maximum !== null && maximum < 0 ? 'text-red-400' : 'text-slate-300'}`}>
          {maximum !== null ? percentFmt.format(maximum) : 'N/D'}
        </p>
        <p className="text-slate-500 mt-1 text-xs">Caduta massima dal picco</p>
      </div>

      {/* R1 C2 — Date chiave e stato del drawdown */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-1.5 text-slate-400 uppercase text-xs tracking-wider">Data inizio drawdown</td>
              <td className="py-1.5 text-white font-medium text-right">{formatDate(peakDate)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-1.5 text-slate-400 uppercase text-xs tracking-wider">Data di minimo</td>
              <td className="py-1.5 text-white font-medium text-right">{formatDate(troughDate)}</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-1.5 text-slate-400 uppercase text-xs tracking-wider">Data di recupero</td>
              <td className="py-1.5 text-white font-medium text-right">{formatDate(recoveryDate)}</td>
            </tr>
            <tr>
              <td className="py-1.5 text-slate-400 uppercase text-xs tracking-wider">Stato</td>
              <td className={`py-1.5 font-medium text-right ${statusColor}`}>
                <span className="mr-1">{statusIcon}</span>
                {statusText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* R2 C1 — Durata Drawdown */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3 flex flex-col justify-center">
        <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
          Durata Drawdown
        </p>
        <p className="font-bold text-2xl text-slate-300">
          {durationDays !== null ? `${durationDays} giorni` : isRecovered ? 'N/D' : 'In corso'}
        </p>
        <p className="text-slate-500 mt-1 text-xs">Dal massimo al recupero</p>
      </div>

      {/* R2 C2 — Tempo Recupero */}
      <div className="bg-slate-900 rounded-lg border border-slate-700 p-3 flex flex-col justify-center">
        <p className="uppercase text-slate-400 text-xs font-semibold tracking-wider mb-2">
          Tempo Recupero
        </p>
        <p className="font-bold text-2xl text-slate-300">
          {recoveryDays !== null ? `${recoveryDays} giorni` : isRecovered ? 'N/D' : 'In corso'}
        </p>
        <p className="text-slate-500 mt-1 text-xs">Dal minimo al recupero</p>
      </div>
    </div>
  );
}
