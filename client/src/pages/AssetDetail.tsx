import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AssetDetailData,
  AssetDailyPricesResponse,
  AssetPriceRefreshResponse,
  DailyPricePoint,
} from '../types';
import { apiFetch } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { TIME_RANGE_OPTIONS, getCutoffDate, type TimeRange } from '../lib/timeRange';
// Helper di formattazione condivisi (erano duplicati verbatim in più pagine)
import {
  formatPrice,
  formatAmount,
  formatPercent,
  formatPercentNoSign,
  formatDate,
  gainColorClass,
} from '../lib/format';

/**
 * Badge colorato per il tipo di asset (stessa palette di Portfolio.tsx).
 */
// I tipi ETF/ETC/ETN sono decommissionati (migrati a UNKNOWN): rami rimossi.
const AssetTypeBadge = ({ assetType }: { assetType: string }) => {
  const bgColor =
    assetType === 'UNKNOWN'
      ? 'bg-amber-900/30 text-amber-300 border-amber-700/50'
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
function KpiCard({ label, value, sublabel, sublabel2, valueClass = 'text-white', sublabelClass = 'text-slate-300' }: {
  label: string;
  value: string;
  sublabel?: string | null;
  sublabel2?: string | null;
  valueClass?: string;
  sublabelClass?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      {/* Tipografia responsive: con 2 card per riga su mobile il valore a 24px traboccherebbe */}
      <p className={`mt-1 text-lg sm:text-xl lg:text-2xl font-bold break-words ${valueClass}`}>{value}</p>
      {sublabel && <p className={`mt-1 text-sm lg:text-base ${sublabelClass}`}>{sublabel}</p>}
      {/* Secondo sublabel sempre neutro: non eredita verde/rosso del primo */}
      {sublabel2 && <p className="mt-0.5 text-xs lg:text-sm text-slate-400">{sublabel2}</p>}
    </div>
  );
}

/**
 * destinazione del link "Torna a...": la pagina da cui si è arrivati.
 * La provenienza viene passata via location.state.from da chi naviga verso
 * /asset/:id (Portfolio, Performance...); fallback a Portfolio per accessi
 * diretti via URL (refresh, link condiviso) dove lo state non esiste.
 * Nota: NON si usa navigate(-1) perché con un accesso diretto il "back"
 * del browser uscirebbe dall'app.
 */
const BACK_LABELS: Record<string, string> = {
  '/portfolio': 'Torna al Portfolio',
  '/performance': 'Torna alla Performance',
};

function backTarget(state: unknown): { to: string; label: string } {
  const from = (state as { from?: string } | null)?.from;
  if (from && BACK_LABELS[from]) return { to: from, label: BACK_LABELS[from] };
  return { to: '/portfolio', label: 'Torna al Portfolio' };
}

// Etichette mensili per l'asse X del grafico Storico Quotazioni (MM/YYYY)
const formatMonthTick = (dateStr: string) => {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
};

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const back = backTarget(location.state);
  const isMobile = useIsMobile();
  const [data, setData] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Storico prezzi di chiusura (GET /api/prices/asset/:id) + aggiornamento
  // on-demand (POST /api/prices/asset/:id/refresh, fonte EODHD): alla visita
  // della pagina, se l'ultima quotazione in DB non è aggiornata a oggi il
  // refresh parte automaticamente. Feature non critica: un fallimento o un
  // asset senza storico (es. BTP/cash) degradano a banner/nessun grafico,
  // senza toccare il resto della pagina.
  const [priceHistory, setPriceHistory] = useState<DailyPricePoint[] | null>(null);
  const [priceTimeRange, setPriceTimeRange] = useState<TimeRange>('all');
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/analytics/asset/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Asset non trovato');
        return r.json();
      })
      .then((d: AssetDetailData) => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // Caricamento della serie storica. Restituisce i metadati (isCurrent/count)
  // così l'auto-refresh può decidere se serve un aggiornamento.
  const loadPriceHistory = useCallback(
    async (assetId: string): Promise<AssetDailyPricesResponse | null> => {
      try {
        const r = await apiFetch(`/api/prices/asset/${assetId}`);
        if (!r.ok) {
          setPriceHistory([]);
          return null;
        }
        const d: AssetDailyPricesResponse = await r.json();
        setPriceHistory(d.prices ?? []);
        return d;
      } catch {
        setPriceHistory([]);
        return null;
      }
    },
    []
  );

  // Aggiornamento incrementale per-asset (EODHD). Esiti senza errore
  // (updated/already_current/no_new_data/skipped) → ricarica la serie; il
  // fallimento del provider (ok:false) mostra il banner e il grafico resta
  // con gli ultimi dati disponibili.
  const refreshPriceHistory = useCallback(
    async (assetId: string) => {
      setPriceRefreshing(true);
      setPriceError(null);
      try {
        const response = await apiFetch(`/api/prices/asset/${assetId}/refresh`, {
          method: 'POST',
        });
        if (response.status === 503) {
          // Problema di configurazione: EODHD_API_KEY non impostata sul server
          const body = await response.json().catch(() => null);
          setPriceError(
            body?.details ??
              'Servizio prezzi EODHD non configurato: impostare EODHD_API_KEY sul server.'
          );
          return;
        }
        if (response.status === 429) {
          setPriceError('Troppe richieste di aggiornamento. Riprova tra un minuto.');
          return;
        }
        if (!response.ok) {
          setPriceError("Errore durante l'aggiornamento dei prezzi di chiusura.");
          return;
        }
        const body: AssetPriceRefreshResponse = await response.json().catch(() => null);
        if (body && body.status === 'failed') {
          setPriceError(body.error ?? "Errore durante l'aggiornamento dei prezzi di chiusura.");
          return;
        }
        // updated / already_current / no_new_data / skipped → ricarica dal DB
        await loadPriceHistory(assetId);
      } catch {
        setPriceError("Errore di rete durante l'aggiornamento dei prezzi di chiusura.");
      } finally {
        setPriceRefreshing(false);
      }
    },
    [loadPriceHistory]
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    loadPriceHistory(id).then(d => {
      // Auto-refresh solo se c'è storico locale ma non è aggiornato a oggi:
      // asset senza storico (es. BTP/cash) restano senza grafico, come per
      // design (il backfill storico avviene solo via import CSV).
      if (!cancelled && d && d.isCurrent === false && d.count > 0) {
        refreshPriceHistory(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [id, loadPriceHistory, refreshPriceHistory]);

  // Dati del grafico filtrati per time range (memoizzato: ricomputati solo se
  // cambiano i dati o il filtro, non a ogni render della pagina)
  const filteredPriceData = useMemo(() => {
    if (!priceHistory) return [];
    const cutoff = getCutoffDate(priceTimeRange);
    if (cutoff === null) return priceHistory;
    return priceHistory.filter(p => p.date >= cutoff);
  }, [priceHistory, priceTimeRange]);

  // Tick mensili per l'asse X: un tick per ogni cambio mese, più primo e
  // ultimo sempre inclusi (stessa strategia del grafico Dashboard non-"All")
  const priceMonthTicks = useMemo(() => {
    return filteredPriceData
      .filter((p, i, arr) => {
        if (i === 0 || i === arr.length - 1) return true;
        return p.date.slice(0, 7) !== arr[i - 1].date.slice(0, 7);
      })
      .map(p => p.date);
  }, [filteredPriceData]);

  // Variazione del periodo selezionato: primo → ultimo punto del filtro
  const pricePeriodChange = useMemo(() => {
    if (priceTimeRange === 'all' || filteredPriceData.length < 2) return null;
    const first = filteredPriceData[0];
    const last = filteredPriceData[filteredPriceData.length - 1];
    if (!first.close) return null;
    return ((last.close - first.close) / first.close) * 100;
  }, [filteredPriceData, priceTimeRange]);

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
        <Link to={back.to} className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={16} /> {back.label}
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
      {/* Back link — dinamico in base alla pagina di provenienza */}
      <Link to={back.to} className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
        <ArrowLeft size={16} /> {back.label}
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

      {/* 2. KPI Card — Situazione Corrente (2 card per riga su mobile, 3 su desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">

        {/* 1. Prezzo attuale */}
        <KpiCard
          label="Prezzo Attuale"
          value={formatPrice(position.currentPrice)}
          sublabel={position.priceDate ? `Aggiornato al ${formatDate(position.priceDate)}` : null}
        />

        {/* 2. Quantità */}
        <KpiCard
          label="Quantità"
          value={position.quantity.toLocaleString('it-IT')}
          sublabel={position.allocationPercent !== null ? `${formatPercentNoSign(position.allocationPercent)} del portafoglio` : null}
          sublabel2={
            position.allocationTypePercent !== null
              ? `${formatPercentNoSign(position.allocationTypePercent)} della classe ${asset.assetType}`
              : null
          }
        />

        {/* 3. Prezzo medio di carico */}
        <KpiCard
          label="Prezzo Medio di Carico"
          value={`${formatPrice(position.averagePrice)}${
            position.averagePrice !== null ? ` ${asset.currency}` : ''
          }`}
        />

        {/* 4. Valore di carico vs attuale */}
        <KpiCard
          label="Carico vs Attuale"
          value={`${formatAmount(position.bookValueEUR)} → ${formatAmount(position.currentValueEUR)}`}
          sublabel={
            position.bookValueEUR && position.currentValueEUR
              ? `Diff: ${formatAmount(position.currentValueEUR - position.bookValueEUR)} EUR`
              : null
          }
          valueClass={
            position.bookValueEUR && position.currentValueEUR && position.currentValueEUR >= position.bookValueEUR
              ? 'text-emerald-400'
              : 'text-white'
          }
          sublabelClass={
            position.bookValueEUR && position.currentValueEUR && position.currentValueEUR >= position.bookValueEUR
              ? 'text-emerald-400'
              : 'text-slate-300'
          }
        />

        {/* 5. P&L */}
        <KpiCard
          label="P&L"
          value={`${formatAmount(position.pnl)} ${asset.currency}`}
          sublabel={position.pnlPercent !== null ? formatPercent(position.pnlPercent) : null}
          valueClass={gainColorClass(position.pnl)}
          sublabelClass={gainColorClass(position.pnlPercent)}
        />

        {/* 6. IRR money-weighted */}
        {data.irr ? (
          <KpiCard
            label="IRR (Money-Weighted)"
            value={`${(data.irr.irr * 100).toFixed(2)}%`}
            sublabel={`${data.irr.years.toFixed(1)} anni investiti`}
            valueClass={data.irr.irr >= 0 ? 'text-emerald-400' : 'text-red-400'}
            sublabelClass="text-slate-300"
          />
        ) : (
          <KpiCard
            label="IRR (Money-Weighted)"
            value="N/D"
            sublabel="Dati insufficienti"
            valueClass="text-slate-400"
            sublabelClass="text-slate-400"
          />
        )}
      </div>

      {/* 2b. Grafico Storico Quotazioni — solo per asset con storico prezzi.
          Richiesto dopo la sezione KPI (Prezzo attuale ... IRR) e prima di
          Cronologia Ordini; stile identico al grafico Andamento Portafoglio. */}
      {priceHistory !== null && priceHistory.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider">
                Storico Quotazioni
              </h3>
              {priceRefreshing && !priceError && (
                <p className="text-sm text-slate-400 mt-1">Aggiornamento quotazioni da EODHD…</p>
              )}
              {/* Variazione del periodo selezionato (hidden per "All") */}
              {pricePeriodChange !== null && (
                <p
                  className={`text-sm lg:text-base font-bold mt-1 ${
                    pricePeriodChange >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  Variazione {priceTimeRange.toUpperCase()}:{' '}
                  {pricePeriodChange >= 0 ? '+' : ''}
                  {pricePeriodChange.toFixed(2)}%
                </p>
              )}
            </div>
            {/* Bottoni time range — allineati all'asse Y destro */}
            <div className="flex items-center gap-1">
              {TIME_RANGE_OPTIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPriceTimeRange(key)}
                  className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer select-none ${
                    priceTimeRange === key
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Banner errore refresh (non critico): il grafico resta con gli ultimi dati disponibili */}
          {priceError && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-700/50 bg-amber-900/30 px-3 py-2">
              <p className="text-sm text-amber-300">{priceError}</p>
              <button
                onClick={() => id && refreshPriceHistory(id)}
                disabled={priceRefreshing}
                className="px-3 py-1 text-xs font-medium rounded bg-amber-700/40 text-amber-100 hover:bg-amber-700/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {priceRefreshing ? 'Aggiornamento…' : 'Riprova'}
              </button>
            </div>
          )}
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 350}>
            <AreaChart
              data={filteredPriceData}
              margin={{ top: 10, right: isMobile ? 4 : 20, left: isMobile ? 0 : 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="priceHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                ticks={priceMonthTicks}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }}
                tickFormatter={formatMonthTick}
              />
              <YAxis
                width={isMobile ? 32 : 60}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 8 : 12 }}
                tickFormatter={(value: number) => formatPrice(value)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0].payload as DailyPricePoint;
                  return (
                    <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-lg">
                      <p className="text-slate-300 text-sm">
                        {new Date(item.date).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="font-semibold text-emerald-400 text-sm mt-1">
                        Chiusura: {formatPrice(item.close)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#priceHistoryGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3. Cronologia Ordini */}
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
                    {/* Importo con segno invertito: positivo per acquisto, negativo per vendita */}
                    {formatAmount(order.type === 'BUY' ? Math.abs(order.amount) : -Math.abs(order.amount))} {order.currency}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Nessun ordine registrato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Cedole (per BOND) o Dividend History (per gli altri) */}
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
        dividends.length > 0 && (
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
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-600 bg-slate-800/80">
                    <td className="px-4 py-3 text-sm font-semibold text-white uppercase tracking-wider">Totale</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-emerald-400">
                      +{formatAmount(dividendsTotal)} {dividends[0].currency}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}