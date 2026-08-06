import { useEffect, useMemo, useState } from 'react';
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
 * Formatta un importo in euro.
 */
const formatEur = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  return `€ ${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function Portfolio() {
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
        .map(pos => ({
          ...pos,
          quantity: displayQuantity(pos),
          // Campi calcolati per ordinamento
          total_value: calcTotalValue(pos),
          gain_eur: calcGainEur(pos),
          gain_percent: calcGainPercent(pos),
        }))
        .filter(pos => pos.quantity !== 0),
    [positions]
  );

  const sortedPositions = useMemo(() => {
    if (!sortKey) return visiblePositions;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...visiblePositions].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return (aVal - bVal) * dir;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        <p className="text-slate-400 text-sm mt-1">
          {sortedPositions.length} posizioni attive
        </p>
        {priceDate && (
          <p className="text-emerald-400 text-xs mt-1">
            Prezzi attuali aggiornati al {formatDate(priceDate)}
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
                  <tr key={pos.asset_id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-white">{pos.ticker}</td>
                    <td className="px-4 py-3 text-sm text-slate-400 font-mono">{pos.isin}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{pos.name}</td>
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
                      {formatEur(totalValue)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gainEur)}`}>
                      {formatEur(gainEur)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-medium ${gainColorClass(gainPercent)}`}>
                      {formatPercent(gainPercent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-400">{pos.currency}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-300">
                        {pos.asset_type || 'UNKNOWN'}
                      </span>
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
    </div>
  );
}
