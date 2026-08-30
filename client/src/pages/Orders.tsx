import { useEffect, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { MarketOrderItem, OrdersResponse } from '../types';
import { apiFetch } from '../lib/api';
import { formatAmount } from '../lib/format';

type SortKey = 'operation_date' | 'value_date' | 'type' | 'ticker' | 'asset_name' | 'quantity' | 'euro_amount' | 'currency';
type SortDirection = 'asc' | 'desc';

const ORDER_TYPE_LABELS: Record<string, string> = { BUY: 'Acquisto', SELL: 'Vendita' };

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '\u2014';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const ddmmyy = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyy) return `${ddmmyy[2]}/${ddmmyy[1]}/${ddmmyy[3]}`;
  const mdy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const month = mdy[1].padStart(2, '0'), day = mdy[2].padStart(2, '0');
    const year = mdy[3].length === 2 ? '20' + mdy[3] : mdy[3];
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

export default function Orders() {
  const [orders, setOrders] = useState<MarketOrderItem[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('operation_date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [symbolFilter, setSymbolFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const id = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(id); }, [search]);

  useEffect(() => {
    const query = new URLSearchParams();
    query.set('sortBy', sortKey); query.set('sortOrder', sortDirection);
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);
    if (typeFilter) query.set('type', typeFilter);
    if (symbolFilter) query.set('symbol', symbolFilter);
    if (debouncedSearch) query.set('search', debouncedSearch);
    const controller = new AbortController();
    setLoading(true);
    apiFetch(`/api/orders?${query.toString()}`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Errore nel caricamento degli ordini'); return r.json(); })
      .then((data: OrdersResponse) => { setOrders(data.data); setError(null); })
      .catch(err => { if (err instanceof DOMException && err.name === 'AbortError') return; console.error(err); setError('Errore nel caricamento degli ordini'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [sortKey, sortDirection, startDate, endDate, typeFilter, symbolFilter, debouncedSearch]);

  useEffect(() => {
    apiFetch('/api/orders/symbols').then(r => r.json()).then((data: string[]) => setSymbols(data)).catch(console.error);
  }, []);

  const handleSort = (key: SortKey) => { if (sortKey === key) { setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc')); } else { setSortKey(key); setSortDirection('asc'); } };
  const sortArrow = (key: SortKey) => { if (sortKey !== key) return ' \u21f5'; return sortDirection === 'asc' ? ' \u2191' : ' \u2193'; };
  const thClass = (key: SortKey, align: 'left' | 'right' = 'left') =>
    `cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${sortKey === key ? 'text-white' : 'text-slate-400'} hover:text-white`;
  const inputClass = 'bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';
  /** Calcola il totale: acquisti negativi, vendite positive */
  const totalAmount = orders.reduce((sum, ord) => sum + (ord.type === 'BUY' ? -(Math.abs(ord.euro_amount ?? 0)) : (ord.euro_amount ?? 0)), 0);
  const hasActiveFilters = Boolean(startDate || endDate || typeFilter || symbolFilter || debouncedSearch);
  const resetFilters = () => { setStartDate(''); setEndDate(''); setTypeFilter(''); setSymbolFilter(''); setSearch(''); };

  /** Calcola il prezzo unitario (importo ÷ quantità), gestendo i casi limite */
  const unitPrice = (order: MarketOrderItem) => {
    if (order.quantity === 0 || !order.euro_amount) return null;
    return Math.abs(order.euro_amount) / order.quantity;
  };

  /** Restituisce l'importo visualizzato: BUY negativo (-), SELL positivo (+) rispetto al patrimonio */
  const displayAmount = (order: MarketOrderItem) => {
    const raw = order.euro_amount ?? 0;
    return order.type === 'BUY' ? -(Math.abs(raw)) : raw;
  };

  /** Calcola il totale quantità: BUY positivo, SELL negativo */
  const totalQuantity = orders.reduce((sum, ord) => sum + (ord.type === 'SELL' ? -(ord.quantity ?? 0) : (ord.quantity ?? 0)), 0);

  /** Colore in base al segno dell'importo visualizzato e al tipo */
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <h2 className="text-2xl font-bold text-white">Ordini</h2>
        {!loading && (<p className="text-slate-400 text-sm">{orders.length} ordini</p>)}
      </div>
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Dal</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={`${inputClass} w-full min-w-0`} />
          </div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Al</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={`${inputClass} w-full min-w-0`} />
          </div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Tipo</label>
            <div className="relative">
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={`${inputClass} w-full appearance-none cursor-pointer pr-8`}>
                <option value="">Tutti i tipi</option>
                {Object.entries(ORDER_TYPE_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Simbolo</label>
            <div className="relative">
              <select value={symbolFilter} onChange={e => setSymbolFilter(e.target.value)} className={`${inputClass} w-full appearance-none cursor-pointer pr-8`}>
                <option value="">Tutti i simboli</option>
                {symbols.map(sym => (<option key={sym} value={sym}>{sym}</option>))}
              </select>
              <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Ricerca</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, ticker..." className={`${inputClass} w-full pl-9`} />
            </div>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button onClick={resetFilters} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"><X size={14} /> Azzera filtri</button>
          </div>
        )}
      </div>

      {/* Tabella */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className={thClass('operation_date')} onClick={() => handleSort('operation_date')}>Data oper.{sortArrow('operation_date')}</th>
                <th className={thClass('value_date')} onClick={() => handleSort('value_date')}>Data val.{sortArrow('value_date')}</th>
                <th className={thClass('type')} onClick={() => handleSort('type')}>Tipo{sortArrow('type')}</th>
                <th className={thClass('ticker')} onClick={() => handleSort('ticker')}>Simbolo{sortArrow('ticker')}</th>
                <th className={thClass('asset_name')} onClick={() => handleSort('asset_name')}>Descrizione{sortArrow('asset_name')}</th>
                <th className={thClass('quantity', 'right')} onClick={() => handleSort('quantity')}>Quantità{sortArrow('quantity')}</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Prezzo unit.</th>
                <th className={thClass('euro_amount', 'right')} onClick={() => handleSort('euro_amount')}>Importo{sortArrow('euro_amount')}</th>
                <th className={thClass('currency')} onClick={() => handleSort('currency')}>Valuta{sortArrow('currency')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-white whitespace-nowrap">{formatDate(order.operation_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{formatDate(order.value_date)}</td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${order.type === 'BUY' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {ORDER_TYPE_LABELS[order.type] || order.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300 font-medium">{order.ticker || '\u2014'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{order.asset_name || '\u2014'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium whitespace-nowrap">
                    {typeof order.quantity === 'number' ? `${order.type === 'SELL' ? '-' : ''}${order.quantity.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : order.quantity}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium whitespace-nowrap ${order.type === 'BUY' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {unitPrice(order) !== null ? formatAmount(unitPrice(order)) : '—'}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-medium whitespace-nowrap ${order.type === 'BUY' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {formatAmount(displayAmount(order))}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{order.currency}</td>
                </tr>
              ))}
              {orders.length === 0 && !loading && (<tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">Nessun ordine trovato</td></tr>)}
              {loading && (<tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Caricamento...</td></tr>)}
            </tbody>
            {orders.length > 0 && hasActiveFilters && (
              <tfoot>
                <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-white text-right uppercase tracking-wider">Totale</td>
                  <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${totalQuantity >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalQuantity !== 0 && totalQuantity < 0 ? '-' : ''}{formatAmount(Math.abs(totalQuantity))}
                  </td>
                  <td />
                  <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${totalAmount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {totalAmount !== 0 && totalAmount < 0 ? '-' : ''}{formatAmount(Math.abs(totalAmount))}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{orders[0]?.currency}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {error && (<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">{error}</div>)}

      {!loading && orders.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Legenda tipologie</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(ORDER_TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-start gap-2 text-sm">
                <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium ${type === 'BUY' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{label}</span>
                <span className="text-slate-400 leading-5">{type === 'BUY' ? 'Ordine di acquisto di quote/azioni' : 'Ordine di vendita di quote/azioni'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}