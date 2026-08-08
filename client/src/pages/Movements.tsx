import { useEffect, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { CashMovementItem, MovementsResponse } from '../types';

type SortKey = 'operation_date' | 'movement_type' | 'ticker' | 'asset_name' | 'euro_amount' | 'currency';
type SortDirection = 'asc' | 'desc';

// Mappa dei MovementType in etichette italiane per la UI
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Conferimento',
  WITHDRAWAL: 'Prelievo',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Cedola',
  TAX: 'Imposte',
  COMMISSION: 'Commissione',
  STAMP_DUTY: 'Bollo',
  OTHER: 'Altro',
};

const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS);

// Legenda tipologie: descrizione estesa per ogni tipo di movimento
const MOVEMENT_TYPE_LEGEND: Record<string, string> = {
  DEPOSIT: 'Versamento di liquidità dall\'esterno (bonifico)',
  WITHDRAWAL: 'Prelievo di liquidità dal conto',
  DIVIDEND: 'Dividendi incassati su azioni o ETF',
  INTEREST: 'Cedole obbligazionarie (BTP, ecc.)',
  TAX: 'Ritenute fiscali, Tobin tax e altre imposte',
  COMMISSION: 'Commissioni pagate a Directa per operazioni',
  STAMP_DUTY: 'Imposta di bollo annuale sul portafoglio (0.20%)',
  OTHER: 'Altri movimenti (rimborsi obbligazioni, ratei, storni)',
};

/**
 * Converte una data in formato ISO (YYYY-MM-DD) in formato italiano (DD/MM/YYYY).
 * Gestisce anche formati legacy (DD-MM-YYYY, M/D/YY) per compatibilità con dati esistenti.
 */
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—';
  // Se è già in formato ISO (YYYY-MM-DD), parse diretto
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  // Se è in formato DD-MM-YYYY (es. "31-03-2026"), converto
  const ddmmyy = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyy) {
    return `${ddmmyy[2]}/${ddmmyy[1]}/${ddmmyy[3]}`;
  }
  // Se è in formato M/D/YY o M/D/YYYY (es. "8/6/26"), converto
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0');
    const day = mdy[2].padStart(2, '0');
    const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
    return `${day}/${month}/${year}`;
  }
  // Fallback: restituisce la stringa originale
  return dateStr;
};

/**
 * Formatta un importo numerico con 2 decimali in formato italiano.
 */
const formatAmount = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

/**
 * Restituisce la classe CSS per il colore in base al segno dell'importo.
 * I movimenti in entrata sono verdi, in uscita rossi, neutri se zero.
 */
const amountColorClass = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'text-slate-400';
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-300';
};

export default function Movements() {
  const [movements, setMovements] = useState<CashMovementItem[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stato ordinamento
  const [sortKey, setSortKey] = useState<SortKey>('operation_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Stato filtri (in formato ISO YYYY-MM-DD per l'input date HTML)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [search, setSearch] = useState('');

  // Load dei dati
  useEffect(() => {
    const query = new URLSearchParams();
    query.set('sortBy', sortKey);
    query.set('sortOrder', sortDirection);
    // Le date ISO dell'input HTML (YYYY-MM-DD) vengono passate direttamente
    // perché il DB ora memorizza le date in formato ISO
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);
    if (typeFilter) query.set('type', typeFilter);
    if (symbolFilter) query.set('symbol', symbolFilter);
    if (search) query.set('search', search);

    setLoading(true);
    fetch(`/api/movements?${query.toString()}`)
      .then(r => {
        if (!r.ok) throw new Error('Errore nel caricamento dei movimenti');
        return r.json();
      })
      .then((data: MovementsResponse) => {
        setMovements(data.data);
        setError(null);
      })
      .catch(err => {
        console.error(err);
        setError('Errore nel caricamento dei movimenti');
      })
      .finally(() => setLoading(false));
  }, [sortKey, sortDirection, startDate, endDate, typeFilter, symbolFilter, search]);

  // Load dei simboli per il dropdown filtro
  useEffect(() => {
    fetch('/api/movements/symbols')
      .then(r => r.json())
      .then((data: string[]) => setSymbols(data))
      .catch(console.error);
  }, []);

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

  // Classe input condivisa per tutti i filtri
  const inputClass =
    'bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';

  // Calcola il totale importo dei movimenti filtrati
  const totalAmount = movements.reduce((sum, mv) => sum + (mv.euro_amount ?? 0), 0);

  const hasActiveFilters = Boolean(startDate || endDate || typeFilter || symbolFilter || search);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setTypeFilter('');
    setSymbolFilter('');
    setSearch('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <h2 className="text-2xl font-bold text-white">Movimenti</h2>
        {!loading && (
          <p className="text-slate-400 text-sm">
            {movements.length} movimenti
          </p>
        )}
      </div>

      {/* Filtri */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Intervallo date */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Dal</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Al</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>

          {/* Tipo movimento — wrapper con freccia personalizzata */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Tipo</label>
            <div className="relative">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className={`${inputClass} w-full appearance-none cursor-pointer pr-8`}
              >
                <option value="">Tutti i tipi</option>
                {MOVEMENT_TYPES.map(type => (
                  <option key={type} value={type}>
                    {MOVEMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Simbolo — wrapper con freccia personalizzata */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Simbolo</label>
            <div className="relative">
              <select
                value={symbolFilter}
                onChange={e => setSymbolFilter(e.target.value)}
                className={`${inputClass} w-full appearance-none cursor-pointer pr-8`}
              >
                <option value="">Tutti i simboli</option>
                {symbols.map(sym => (
                  <option key={sym} value={sym}>{sym}</option>
                ))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          {/* Ricerca testuale */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Ricerca</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nome, ticker..."
                className={`${inputClass} w-full pl-9`}
              />
            </div>
          </div>
        </div>

        {/* Reset filtri */}
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button
              onClick={resetFilters}
              className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
              Azzera filtri
            </button>
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className={thClass('operation_date')} onClick={() => handleSort('operation_date')}>
                  Data{sortArrow('operation_date')}
                </th>
                <th className={thClass('movement_type')} onClick={() => handleSort('movement_type')}>
                  Tipo{sortArrow('movement_type')}
                </th>
                <th className={thClass('ticker')} onClick={() => handleSort('ticker')}>
                  Simbolo{sortArrow('ticker')}
                </th>
                <th className={thClass('asset_name')} onClick={() => handleSort('asset_name')}>
                  Descrizione{sortArrow('asset_name')}
                </th>
                <th className={thClass('euro_amount', 'right')} onClick={() => handleSort('euro_amount')}>
                  Importo{sortArrow('euro_amount')}
                </th>
                <th className={thClass('currency')} onClick={() => handleSort('currency')}>
                  Valuta{sortArrow('currency')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {movements.map((mv) => (
                <tr key={mv.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                    {formatDate(mv.operation_date)}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      mv.movement_type === 'DEPOSIT' || mv.movement_type === 'DIVIDEND' || mv.movement_type === 'INTEREST'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : mv.movement_type === 'TAX' || mv.movement_type === 'COMMISSION' || mv.movement_type === 'STAMP_DUTY'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-slate-700 text-slate-300'
                    }`}>
                      {MOVEMENT_TYPE_LABELS[mv.movement_type] || mv.movement_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300 font-medium">
                    {mv.ticker || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {mv.asset_name || '—'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium whitespace-nowrap ${amountColorClass(mv.euro_amount)}`}>
                    {formatAmount(mv.euro_amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{mv.currency}</td>
                </tr>
              ))}
              {movements.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nessun movimento trovato
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Caricamento...
                  </td>
                </tr>
              )}
            </tbody>
            {/* Riga totale importo — visibile solo quando ci sono movimenti e filtri attivi */}
            {movements.length > 0 && hasActiveFilters && (
              <tfoot>
                <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-white text-right uppercase tracking-wider">
                    Totale
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${amountColorClass(totalAmount)}`}>
                    {formatAmount(totalAmount)}
                    <span className="text-slate-500 font-normal ml-1">€</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">EUR</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Legenda tipologie */}
      {!loading && movements.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Legenda tipologie
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {MOVEMENT_TYPES.map(type => (
              <div key={type} className="flex items-start gap-2 text-sm">
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${
                  type === 'DEPOSIT' || type === 'DIVIDEND' || type === 'INTEREST'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : type === 'TAX' || type === 'COMMISSION' || type === 'STAMP_DUTY'
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {MOVEMENT_TYPE_LABELS[type]}
                </span>
                <span className="text-slate-400 leading-5">{MOVEMENT_TYPE_LEGEND[type]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}