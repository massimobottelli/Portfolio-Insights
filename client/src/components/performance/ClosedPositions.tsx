/**
 * Performance — Tabella "Posizioni chiuse"
 *
 * Raggruppa gli ordini per ticker e mostra quelli con quantità netta zero,
 * con il Gain/Loss EUR aggregato. Il fetch è SENZA filtri: le posizioni chiuse
 * devono essere calcolate sull'intera storia, indipendentemente da qualunque
 * filtro attivo altrove.
 *
 * Click sul nome → naviga a /orders?symbol=TICKER (la pagina Ordini applica
 * il filtro simbolo dal query param).
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MarketOrderItem } from '../../types';
import { apiFetch } from '../../lib/api';
import { formatAmount } from '../../lib/format';

type ClosedSortKey = 'ticker' | 'name' | 'pnl' | 'orderCount';
type SortDirection = 'asc' | 'desc';

/** Restituisce l'importo con segno patrimoniale: BUY negativo (-), SELL positivo (+) */
const displayAmount = (order: MarketOrderItem) => {
  const raw = order.euro_amount ?? 0;
  return order.type === 'BUY' ? -(Math.abs(raw)) : raw;
};

export default function ClosedPositions() {
  const [orders, setOrders] = useState<MarketOrderItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closedSortKey, setClosedSortKey] = useState<ClosedSortKey>('pnl');
  const [closedSortDir, setClosedSortDir] = useState<SortDirection>('desc');
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    // Nessun filtro: servono TUTTI gli ordini per individuare le posizioni chiuse
    apiFetch('/api/orders?sortBy=operation_date&sortOrder=desc', { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Errore nel caricamento degli ordini'); return r.json(); })
      .then(data => { setOrders(data.data); })
      .catch(err => { if (err instanceof DOMException && err.name === 'AbortError') return; console.error(err); })
      .finally(() => setLoaded(true));
    return () => controller.abort();
  }, []);

  // Freccia ordinamento per tabella posizioni chiuse
  const closedSortArrow = (key: ClosedSortKey) => {
    if (closedSortKey !== key) return ' \u21f5';
    return closedSortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  // Gestione click colonna ordinamento posizioni chiuse
  const handleClosedSort = (key: ClosedSortKey) => {
    if (closedSortKey === key) setClosedSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    else { setClosedSortKey(key); setClosedSortDir('asc'); }
  };

  const thClass = (key: ClosedSortKey, align: 'left' | 'right' = 'left') =>
    `cursor-pointer select-none px-4 py-3 text-xs font-medium uppercase tracking-wider transition-colors ${align === 'right' ? 'text-right' : 'text-left'} ${closedSortKey === key ? 'text-white' : 'text-slate-400'} hover:text-white`;

  const closedPositions = (() => {
    const groups = new Map<string, MarketOrderItem[]>();
    orders.forEach(o => { if (o.ticker) { const g = groups.get(o.ticker) || []; g.push(o); groups.set(o.ticker, g); } });
    const result: { ticker: string; name: string | null; orderCount: number; pnl: number }[] = [];
    for (const [ticker, items] of groups) {
      const netQty = items.reduce((s, i) => s + (i.type === 'SELL' ? -(i.quantity ?? 0) : (i.quantity ?? 0)), 0);
      if (netQty === 0) {
        const pnl = items.reduce((s, i) => s + displayAmount(i), 0);
        result.push({ ticker, name: items.find(i => i.asset_name)?.asset_name ?? null, orderCount: items.length, pnl });
      }
    }
    return result.sort((a, b) => {
      let cmp = 0;
      if (closedSortKey === 'ticker') cmp = a.ticker.localeCompare(b.ticker);
      else if (closedSortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (closedSortKey === 'pnl') cmp = a.pnl - b.pnl;
      else if (closedSortKey === 'orderCount') cmp = a.orderCount - b.orderCount;
      return closedSortDir === 'asc' ? cmp : -cmp;
    });
  })();

  // Non mostrare nulla finché i dati non sono caricati o se non ci sono posizioni chiuse
  if (!loaded || closedPositions.length === 0) return null;

  return (

    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider px-4 lg:px-5 pt-4 lg:pt-5 pb-2">Posizioni chiuse</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className={thClass('ticker')} onClick={() => handleClosedSort('ticker')}>Ticker{closedSortArrow('ticker')}</th>
              <th className={thClass('name')} onClick={() => handleClosedSort('name')}>Nome{closedSortArrow('name')}</th>
              <th className={thClass('pnl', 'right')} onClick={() => handleClosedSort('pnl')}>Gain/Loss EUR{closedSortArrow('pnl')}</th>
              <th className={thClass('orderCount', 'right')} onClick={() => handleClosedSort('orderCount')}>Num Ordini{closedSortArrow('orderCount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {closedPositions.map(pos => (
              <tr key={pos.ticker} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{pos.ticker}</td>
                <td className="px-4 py-3 text-sm" onClick={() => navigate(`/orders?symbol=${encodeURIComponent(pos.ticker)}`)} title="Click per vedere gli ordini di questo asset">
                  <span className="text-slate-300 hover:text-white hover:underline cursor-pointer transition-colors">{pos.name || '\u2014'}</span>
                </td>
                <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pos.pnl !== 0 && pos.pnl < 0 ? '-' : ''}{formatAmount(Math.abs(pos.pnl))}€
                </td>
                <td className="px-4 py-3 text-sm text-slate-300 text-right whitespace-nowrap">{pos.orderCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
