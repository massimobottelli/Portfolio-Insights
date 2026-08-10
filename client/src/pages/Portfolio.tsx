import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Loader2 } from 'lucide-react';
import { ASSET_TYPES } from '@config/assetTypes.js';
import type { PositionItem, PortfolioResponse } from '../types';

type SortKey = 'ticker' | 'isin' | 'name' | 'quantity' | 'currency' | 'asset_type' | 'current_price' | 'average_price' | 'total_value' | 'gain_eur' | 'gain_percent';
type SortDirection = 'asc' | 'desc';

// I BTP (Buoni del Tesoro Poliennali) sono quotati in percentuale (es. 102.50),
// quindi la quantità importata da Directa va divisa per 100 per riflettere il valore nominale effettivo.
const isBtp = (pos: PositionItem) =>
  pos.name.toLowerCase().includes('btp') || pos.ticker.toLowerCase().includes('btp');

const displayQuantity = (pos: PositionItem) => (isBtp(pos) ? pos.quantity / 100 : pos.quantity);

/**
 * Formatta un numero come prezzo con 2-4 decimali significativi.
 * Per valori > 10 usa 2 decimali, per valori <= 10 usa 4 decimali.
 */
const formatPrice = (price: number | null) => {
  if (price === null || price === undefined) return '—';
  return price >= 10
    ? price.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : price.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
};

/**
 * Formatta un importo numerico (senza simbolo di valuta).
 */
const formatAmount = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Formatta una percentuale con segno.
 */
const formatPercent = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

/**
 * Restituisce la classe CSS per il colore in base al segno del valore.
 */
const gainColorClass = (value: number | null) => {
  if (value === null || value === undefined) return 'text-slate-300';
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-300';
};

/**
 * Calcola il gain in valuta: (prezzo_attuale - prezzo_medio) × quantità
 */
const calcGainEur = (pos: PositionItem) => {
  if (pos.current_price === null || pos.average_price === null) return null;
  return (pos.current_price - pos.average_price) * pos.quantity;
};

/**
 * Calcola il gain percentuale: ((prezzo_attuale - prezzo_medio) / prezzo_medio) × 100
 */
const calcGainPercent = (pos: PositionItem) => {
  if (pos.current_price === null || pos.average_price === null || pos.average_price === 0) return null;
  return ((pos.current_price - pos.average_price) / pos.average_price) * 100;
};

/**
 * Calcola il valore totale: quantità × prezzo attuale
 */
const calcTotalValue = (pos: PositionItem) => {
  if (pos.current_price === null) return null;
  return pos.current_price * pos.quantity;
};

/**
 * Formatta una data ISO in formato italiano (DD/MM/YYYY).
 */
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
};


function AssetTypeDropdown({ assetId, assetType }: { assetId: string; assetType: string }) {
  const [currentType, setCurrentType] = useState(assetType);
  const [saving, setSaving] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value;
    const previousType = currentType;
    // Ottimistic update
    setCurrentType(newType);
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${assetId}/type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetType: newType }),
      });
      if (!res.ok) {
        // Rollback on error
        setCurrentType(previousType);
      }
    } catch {
      setCurrentType(previousType);
    } finally {
      setSaving(false);
    }
  };

  const isUnknown = currentType === 'UNKNOWN';
  const bgColor = saving
    ? 'bg-blue-900/50 border-blue-700'
    : isUnknown
      ? 'bg-amber-900/30 border-amber-700/50'
      : 'bg-slate-700 border-slate-600';

  const textColor = saving ? 'text-blue-200' : isUnknown ? 'text-amber-300' : 'text-slate-200';

  return (
    <div className="relative">
      {saving && (
        <Loader2 size={12} className="absolute -left-4 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />
      )}
      <select
        value={currentType}
        onChange={handleChange}
        className={`px-2 py-1 rounded-md text-xs font-medium border cursor-pointer appearance-none transition-colors ${bgColor} ${textColor} hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500`}
        style={{ paddingRight: '1.25rem' }}
      >
        {ASSET_TYPES.map(type => (
          <option key={type} value={type} className="bg-slate-800 text-slate-200">
            {type}
          </option>
        ))}
      </select>
      <svg
        className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none ${textColor}`}
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
      >
        <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function Portfolio() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [priceDate, setPriceDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  useEffect(() => {
    fetch('/api/analytics/portfolio')
      .then(r => r.json())
      .then((data: PortfolioResponse) => {
        setPositions(data.positions);
        setPriceDate(data.priceDate);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Trasforma le quantità BTP (/100), calcola i derivati e nasconde quantità zero.
  const visiblePositions = useMemo(
    () =>
      positions
        .map(pos => {
          // Applica la trasformazione BTP alla quantità PRIMA di calcolare i derivati
          // così ordinamento e display coincidono (es. BTP: 70 invece di 7000)
          const transformed = { ...pos, quantity: displayQuantity(pos) };
          return {
            ...transformed,
            // Campi calcolati per ordinamento (usano la quantity già trasformata)
            total_value: calcTotalValue(transformed),
            gain_eur: calcGainEur(transformed),
            gain_percent: calcGainPercent(transformed),
          };
        })
        .filter(pos => pos.quantity !== 0),
    [positions]
  );

  // Raggruppa per asset_type e calcola totali aggregati
  const assetTypeSummary = useMemo(() => {
    const groups = new Map<string, { carico: number; attuale: number; count: number }>();
    for (const pos of visiblePositions) {
      const type = pos.asset_type || 'UNKNOWN';
      if (!groups.has(type)) {
        groups.set(type, { carico: 0, attuale: 0, count: 0 });
      }
      const g = groups.get(type)!;
      // Valore di carico: prezzo medio × quantità (solo se prezzo medio disponibile)
      if (pos.average_price !== null) {
        g.carico += pos.average_price * pos.quantity;
      }
      // Valore attuale: prezzo corrente × quantità (solo se prezzo corrente disponibile)
      if (pos.current_price !== null) {
        g.attuale += pos.current_price * pos.quantity;
      }
      g.count++;
    }
    // Ordina per asset_type
    return Array.from(groups.entries())
      .map(([assetType, { carico, attuale, count }]) => ({
        assetType,
        carico,
        attuale,
        gain: attuale - carico,
        gainPercent: carico !== 0 ? ((attuale - carico) / carico) * 100 : null,
        count,
      }))
      .sort((a, b) => a.assetType.localeCompare(b.assetType));
  }, [visiblePositions]);

  // Chiavi che rappresentano valori numerici (per ordinamento numerico, non testuale)
  const numericSortKeys = new Set<SortKey>([
    'quantity', 'current_price', 'average_price', 'total_value', 'gain_eur', 'gain_percent',
  ]);

  const sortedPositions = useMemo(() => {
    if (!sortKey) return visiblePositions;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...visiblePositions].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (numericSortKeys.has(sortKey)) {
        return ((aVal as number) - (bVal as number)) * dir;
      }
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [visiblePositions, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return ' ⇅';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const thClass = (key: SortKey, align: 'left' | 'right' = 'left') =>
    `cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${
      align === 'right' ? 'text-right' : 'text-left'
    } ${sortKey === key ? 'text-white' : 'text-slate-400'} hover:text-white`;

  // Totali complessivi per la riga di riepilogo
  const totals = useMemo(() => {
    const carico = assetTypeSummary.reduce((s, g) => s + g.carico, 0);
    const attuale = assetTypeSummary.reduce((s, g) => s + g.attuale, 0);
    const gain = attuale - carico;
    return {
      carico,
      attuale,
      gain,
      gainPercent: carico !== 0 ? (gain / carico) * 100 : null,
      count: assetTypeSummary.reduce((s, g) => s + g.count, 0),
    };
  }, [assetTypeSummary]);

  type SummarySortKey = 'assetType' | 'carico' | 'attuale' | 'gain' | 'gainPercent';
  const [summarySortKey, setSummarySortKey] = useState<SummarySortKey>('attuale');
  const [summarySortDirection, setSummarySortDirection] = useState<SortDirection>('desc');

  const handleSummarySort = (key: SummarySortKey) => {
    if (summarySortKey === key) {
      setSummarySortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSummarySortKey(key);
      setSummarySortDirection('asc');
    }
  };

  const summarySortArrow = (key: SummarySortKey) => {
    if (summarySortKey !== key) return ' ⇅';
    return summarySortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const numericSummaryKeys = new Set<SummarySortKey>(['carico', 'attuale', 'gain', 'gainPercent']);

  const sortedSummary = useMemo(() => {
    const dir = summarySortDirection === 'asc' ? 1 : -1;
    return [...assetTypeSummary].sort((a, b) => {
      const aVal = a[summarySortKey];
      const bVal = b[summarySortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (numericSummaryKeys.has(summarySortKey)) {
        return ((aVal as number) - (bVal as number)) * dir;
      }
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [assetTypeSummary, summarySortKey, summarySortDirection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        {priceDate && (
          <p className="text-slate-400 text-sm flex items-center gap-1">
            <Calendar size={14} className="text-slate-400" />
            {formatDate(priceDate)}
          </p>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className={thClass('ticker')} onClick={() => handleSort('ticker')}>
                  Ticker{sortArrow('ticker')}
                </th>
                <th className={thClass('isin')} onClick={() => handleSort('isin')}>
                  ISIN{sortArrow('isin')}
                </th>
                <th className={thClass('name')} onClick={() => handleSort('name')}>
                  Nome{sortArrow('name')}
                </th>
                <th className={thClass('quantity', 'right')} onClick={() => handleSort('quantity')}>
                  Quantità{sortArrow('quantity')}
                </th>
                <th className={thClass('current_price', 'right')} onClick={() => handleSort('current_price')}>
                  Prezzo{sortArrow('current_price')}
                </th>
                <th className={thClass('average_price', 'right')} onClick={() => handleSort('average_price')}>
                  P. Medio{sortArrow('average_price')}
                </th>
                <th className={thClass('total_value', 'right')} onClick={() => handleSort('total_value')}>
                  Valore{sortArrow('total_value')}
                </th>
                <th className={thClass('gain_eur', 'right')} onClick={() => handleSort('gain_eur')}>
                  Gain/Loss €{sortArrow('gain_eur')}
                </th>
                <th className={thClass('gain_percent', 'right')} onClick={() => handleSort('gain_percent')}>
                  Gain/Loss %{sortArrow('gain_percent')}
                </th>
                <th className={thClass('currency')} onClick={() => handleSort('currency')}>
                  Valuta{sortArrow('currency')}
                </th>
                <th className={thClass('asset_type')} onClick={() => handleSort('asset_type')}>
                  Tipo{sortArrow('asset_type')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sortedPositions.map((pos) => {
                const gainEur = calcGainEur(pos);
                const gainPercent = calcGainPercent(pos);
                const totalValue = calcTotalValue(pos);
                return (
                  <tr
                    key={pos.asset_id}
                    className="hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/asset/${pos.asset_id}`)}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-white">{pos.ticker}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono">{pos.isin}</td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className="text-slate-300 hover:text-white hover:underline cursor-pointer transition-colors"
                        title="Click per Scheda Asset"
                      >
                        {pos.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-white font-medium">
                      {pos.quantity.toLocaleString('it-IT')}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-white font-medium">
                      {formatPrice(pos.current_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-300">
                      {formatPrice(pos.average_price)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-white font-medium">
                      {formatAmount(totalValue)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gainEur)}`}>
                      {formatAmount(gainEur)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gainPercent)}`}>
                      {formatPercent(gainPercent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{pos.currency}</td>
                    <td className="px-4 py-3 text-sm">
                      <AssetTypeDropdown
                        assetId={pos.asset_id}
                        assetType={pos.asset_type || 'UNKNOWN'}
                      />
                    </td>
                  </tr>
                );
              })}
              {sortedPositions.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-slate-500">
                    Nessuna posizione attiva
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabella riepilogativa per asset type */}
      {assetTypeSummary.length > 0 && (
        <>
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold text-white">Asset Class</h2>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors text-slate-400 hover:text-white text-left"
                      onClick={() => handleSummarySort('assetType')}>
                    Tipo Asset{summarySortArrow('assetType')}
                  </th>
                  <th className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors text-slate-400 hover:text-white text-right"
                      onClick={() => handleSummarySort('carico')}>
                    Valore Carico{summarySortArrow('carico')}
                  </th>
                  <th className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors text-slate-400 hover:text-white text-right"
                      onClick={() => handleSummarySort('attuale')}>
                    Valore Attuale{summarySortArrow('attuale')}
                  </th>
                  <th className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors text-slate-400 hover:text-white text-right"
                      onClick={() => handleSummarySort('gain')}>
                    Gain/Loss €{summarySortArrow('gain')}
                  </th>
                  <th className="cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors text-slate-400 hover:text-white text-right"
                      onClick={() => handleSummarySort('gainPercent')}>
                    Gain/Loss %{summarySortArrow('gainPercent')}
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">
                    N. Asset
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {sortedSummary.map(({ assetType, carico, attuale, gain, gainPercent, count }) => (
                  <tr key={assetType} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium border ${
                        assetType === 'UNKNOWN'
                          ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
                          : assetType === 'ETF'
                          ? 'bg-blue-900/30 text-blue-300 border-blue-700/50'
                          : assetType === 'ETC'
                          ? 'bg-purple-900/30 text-purple-300 border-purple-700/50'
                          : assetType === 'ETN'
                          ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50'
                          : assetType === 'STOCK'
                          ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50'
                          : assetType === 'BOND'
                          ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
                          : assetType === 'FUND'
                          ? 'bg-cyan-900/30 text-cyan-300 border-cyan-700/50'
                          : assetType === 'COMMODITY'
                          ? 'bg-orange-900/30 text-orange-300 border-orange-700/50'
                          : assetType === 'CASH'
                          ? 'bg-green-900/30 text-green-300 border-green-700/50'
                          : 'bg-slate-700 text-slate-200 border-slate-600'
                      }`}>
                        {assetType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-white font-medium">{formatAmount(carico)}</td>
                    <td className="px-4 py-3 text-sm text-right text-white font-medium">{formatAmount(attuale)}</td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gain)}`}>
                      {formatAmount(gain)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gainPercent)}`}>
                      {formatPercent(gainPercent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-slate-400">{count}</td>
                  </tr>
                ))}
              </tbody>
              {/* Riga totali complessivi */}
              <tfoot>
                <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                  <td className="px-4 py-3 text-sm font-semibold text-white uppercase tracking-wider">Totale</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-white">{formatAmount(totals.carico)}</td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-white">{formatAmount(totals.attuale)}</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${gainColorClass(totals.gain)}`}>
                    {formatAmount(totals.gain)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-bold ${gainColorClass(totals.gainPercent)}`}>
                    {formatPercent(totals.gainPercent)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-bold text-white">{totals.count}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
