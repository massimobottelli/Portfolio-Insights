import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { AssetDetailData } from '../types';

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
 * Formatta una percentuale senza segno (per allocazioni).
 */
const formatPercentNoSign = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)}%`;
};

/**
 * Formatta una data ISO in formato italiano (DD/MM/YYYY).
 */
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('it-IT', { year: 'numeric', month: '2-digit', day: '2-digit' });
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
 * Badge colorato per il tipo di asset (stessa palette di Portfolio.tsx).
 */
const AssetTypeBadge = ({ assetType }: { assetType: string }) => {
  const bgColor =
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
      : 'bg-slate-700 text-slate-200 border-slate-600';

  return (
    <span className={`inline-block px-2 py-1 rounded-md text-xs font-medium border ${bgColor}`}>
      {assetType}
    </span>
  );
};

/**
 * Card KPI per la sezione "Situazione Corrente".
 */
function KpiCard({ label, value, sublabel, valueClass = 'text-white', sublabelClass = 'text-slate-300' }: {
  label: string;
  value: string;
  sublabel?: string | null;
  valueClass?: string;
  sublabelClass?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
      {sublabel && <p className={`mt-1 text-base ${sublabelClass}`}>{sublabel}</p>}
    </div>
  );
}

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/analytics/asset/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Asset non trovato');
        return r.json();
      })
      .then((d: AssetDetailData) => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to="/portfolio" className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} /> Torna al Portfolio
        </Link>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
          <p className="text-slate-400">{error || 'Asset non trovato'}</p>
        </div>
      </div>
    );
  }

  const { asset, position, orders, dividends } = data;
  const coupons = data.coupons || [];
  const couponsTotal = coupons.reduce((sum, c) => sum + c.amount, 0);
  const dividendsTotal = dividends.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/portfolio" className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> Torna al Portfolio
      </Link>

      {/* 1. Header — Identità dell'Asset */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-white">{asset.name}</h2>
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-200 border border-slate-600">
              {asset.ticker}
            </span>
            <AssetTypeBadge assetType={asset.assetType} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-slate-400">
            <span className="font-mono">{asset.isin}</span>
            <span>Valuta: {asset.currency}</span>
          </div>
        </div>
      </div>

      {/* 2. KPI Card — Situazione Corrente */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Prezzo Attuale"
          value={formatPrice(position.currentPrice)}
          sublabel={position.priceDate ? `Aggiornato al ${formatDate(position.priceDate)}` : null}
        />
        <KpiCard
          label="Quantità"
          value={position.quantity.toLocaleString('it-IT')}
          sublabel={position.allocationPercent !== null ? `${formatPercentNoSign(position.allocationPercent)} del portafoglio` : null}
        />
        <KpiCard
          label="Valore Attuale"
          value={`${formatAmount(position.currentValue)} ${asset.currency}`}
          sublabel={position.allocationTypePercent !== null ? `${formatPercentNoSign(position.allocationTypePercent)} della classe ${asset.assetType}` : null}
        />
        <KpiCard
          label="P&L"
          value={`${formatAmount(position.pnl)} ${asset.currency}`}
          sublabel={position.pnlPercent !== null ? formatPercent(position.pnlPercent) : null}
          valueClass={gainColorClass(position.pnl)}
          sublabelClass={gainColorClass(position.pnlPercent)}
        />
      </div>

      {/* 3. Dettaglio Posizione — Griglia carico vs attuale */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Dettaglio Posizione</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-slate-700">
          {/* Colonna sinistra: valori di carico */}
          <div className="divide-y divide-slate-700">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-400">Prezzo medio di carico</span>
              <span className="text-sm text-white font-medium">{formatPrice(position.averagePrice)} {asset.currency}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-400">Valore totale di carico</span>
              <span className="text-sm text-white font-medium">{formatAmount(position.bookValue)} {asset.currency}</span>
            </div>
          </div>
          {/* Colonna destra: valori attuali */}
          <div className="divide-y divide-slate-700 sm:border-l sm:border-slate-700">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-400">Prezzo attuale</span>
              <span className="text-sm text-white font-medium">{formatPrice(position.currentPrice)} {asset.currency}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-400">Valore totale attuale</span>
              <span className="text-sm text-white font-medium">{formatAmount(position.currentValue)} {asset.currency}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4a. Cronologia Ordini */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Cronologia Ordini</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-left">Data</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-left">Tipo</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Quantità</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Prezzo</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Importo</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-left">Riferimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {orders.map((order, idx) => (
                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-300">{formatDate(order.date)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      order.type === 'BUY'
                        ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-700/50'
                        : 'bg-red-900/30 text-red-300 border border-red-700/50'
                    }`}>
                      {order.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-white font-medium">
                    {order.quantity.toLocaleString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-slate-300">{formatPrice(order.price)}</td>
                  <td className="px-4 py-3 text-sm text-right text-white font-medium">
                    {formatAmount(order.amount)} {order.currency}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">{order.reference || '—'}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nessun ordine registrato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4b. Cedole (per BOND) o Dividend History (per gli altri) */}
      {asset.assetType === 'BOND' ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Cedole Incassate</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-left">Data</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {coupons.map((c, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(c.date)}</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-400 font-medium">
                      +{formatAmount(c.amount)} {c.currency}
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                      Nessuna cedola incassata
                    </td>
                  </tr>
                )}
              </tbody>
              {coupons.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                    <td className="px-4 py-3 text-sm font-semibold text-white uppercase tracking-wider">Totale</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-emerald-400">
                      +{formatAmount(couponsTotal)} {coupons[0].currency}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Dividend History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-left">Data</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-slate-400 text-right">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {dividends.map((div, idx) => (
                  <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(div.date)}</td>
                    <td className="px-4 py-3 text-sm text-right text-emerald-400 font-medium">
                      +{formatAmount(div.amount)} {div.currency}
                    </td>
                  </tr>
                ))}
                {dividends.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                      Nessun dividendo incassato
                    </td>
                  </tr>
                )}
              </tbody>
              {dividends.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                    <td className="px-4 py-3 text-sm font-semibold text-white uppercase tracking-wider">Totale</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-emerald-400">
                      +{formatAmount(dividendsTotal)} {dividends[0].currency}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}