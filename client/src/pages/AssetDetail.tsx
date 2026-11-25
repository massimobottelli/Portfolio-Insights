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
  formatPercent,
  formatPercentNoSign,
  formatDate,
  formatCurrency,
  formatEUR,
  gainColorClass,
  getAssetTypeStyle,
} from '../lib/format';

/**
 * Badge colorato per il tipo di asset (stessa palette di Portfolio.tsx).
 */
// I tipi ETF/ETC/ETN sono decommissionati (migrati a UNKNOWN): rami rimossi.
const AssetTypeBadge = ({ assetType }: { assetType: string }) => {
  const style = getAssetTypeStyle(assetType);
  const isUnknown = assetType === 'UNKNOWN';
  return (
    <span
      className="inline-block border font-medium uppercase tracking-wide"
      style={{
        borderRadius: '6px',
        padding: '2px 8px',
        lineHeight: 1.2,
        fontSize: '11px',
        fontWeight: 500,
        letterSpacing: '0.4px',
        backgroundColor: isUnknown ? '#1e253040' : style.bg,
        borderColor: isUnknown ? '#d4a24a80' : style.border,
        borderWidth: '1px',
        color: isUnknown ? '#d4a24a' : style.text,
      }}
    >
      {assetType}
    </span>
  );
};

/**
 * Card KPI per la sezione "Situazione Corrente".
 */
function KpiCard({ label, value, sublabel, sublabel2, valueClass = 'text-paper', sublabelClass = 'text-muted' }: {
  label: string;
  value: string;
  sublabel?: string | null;
  sublabel2?: string | null;
  valueClass?: string;
  sublabelClass?: string;
}) {
  return (
    <div className="bg-ink-800 rounded-xl border border-ink-600 p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      {/* Tipografia responsive: con 2 card per riga su mobile il valore a 24px traboccherebbe */}
      <p className={`mt-1 text-lg sm:text-xl lg:text-2xl font-bold break-words ${valueClass}`}>{value}</p>
      {sublabel && <p className={`mt-1 text-sm lg:text-base ${sublabelClass}`}>{sublabel}</p>}
      {/* Secondo sublabel sempre neutro: non eredita verde/rosso del primo */}
      {sublabel2 && <p className="mt-0.5 text-xs lg:text-sm text-muted">{sublabel2}</p>}
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

  // Data del primo ordine dell'asset (dal dettaglio già caricato): il grafico
  // Storico Quotazioni parte da questa data, non dall'inizio dello storico
  // EODHD (le quotazioni precedenti all'investimento non sono rilevanti).
  // Min esplicito sulle date, robusto all'ordinamento della lista ordini.
  // Se l'asset non ha ordini (es. posizione senza movimenti importati) si
  // mostra l'intera serie disponibile.
  const firstOrderDate = useMemo(() => {
    const orders = data?.orders ?? [];
    if (orders.length === 0) return null;
    return orders.reduce(
      (min, o) => (o.date.slice(0, 10) < min ? o.date.slice(0, 10) : min),
      orders[0].date.slice(0, 10)
    );
  }, [data?.orders]);

  // Dati del grafico filtrati per time range e limitati al periodo di
  // detenzione (dal primo ordine in poi; memoizzato: ricomputati solo se
  // cambiano i dati o i filtri, non a ogni render della pagina)
  const filteredPriceData = useMemo(() => {
    if (!priceHistory) return [];
    let list = priceHistory;
    if (firstOrderDate !== null) {
      list = list.filter(p => p.date >= firstOrderDate);
    }
    const cutoff = getCutoffDate(priceTimeRange);
    if (cutoff !== null) {
      list = list.filter(p => p.date >= cutoff);
    }
    return list;
  }, [priceHistory, priceTimeRange, firstOrderDate]);

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
        <div className="text-muted text-lg">Caricamento...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link to={back.to} className="inline-flex items-center gap-1 text-muted hover:text-paper transition-colors">
          <ArrowLeft size={16} /> {back.label}
        </Link>
        <div className="bg-ink-800 rounded-xl border border-ink-600 p-8 text-center">
          <p className="text-muted">{error || 'Asset non trovato'}</p>
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
      <Link to={back.to} className="inline-flex items-center gap-1 text-muted hover:text-paper transition-colors">
        <ArrowLeft size={16} /> {back.label}
      </Link>

      {/* 1. Header — Identità dell'Asset */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-paper" style={{ fontFamily: 'var(--font-display)' }}>{asset.name}</h2>
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-ink-700 text-paper border border-ink-600">
              {asset.ticker}
            </span>
            <AssetTypeBadge assetType={asset.assetType} />
          </div>
          <div className="mt-2 flex items-center gap-4 text-sm text-muted">
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
          value={`${formatEUR(position.bookValueEUR)} → ${formatEUR(position.currentValueEUR)}`}

          valueClass={
            position.bookValueEUR && position.currentValueEUR && position.currentValueEUR >= position.bookValueEUR
              ? 'text-bull'
              : 'text-paper'
          }
          sublabelClass={
            position.bookValueEUR && position.currentValueEUR && position.currentValueEUR >= position.bookValueEUR
              ? 'text-bull'
              : 'text-muted'
          }
        />

        {/* 5. Gain/Loss */}
        <KpiCard
          label="Gain/Loss"
          value={formatCurrency(position.pnl, asset.currency)}
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
            valueClass={data.irr.irr >= 0 ? 'text-bull' : 'text-bear'}
            sublabelClass="text-muted"
          />
        ) : (
          <KpiCard
            label="IRR (Money-Weighted)"
            value="N/D"
            sublabel="Dati insufficienti"
            valueClass="text-muted"
            sublabelClass="text-muted"
          />
        )}
      </div>

      {/* 2b. Grafico Storico Quotazioni — solo per asset con almeno un punto
          nel range visualizzato (serie limitata al periodo di detenzione: dal
          primo ordine in poi). Richiesto dopo la sezione KPI (Prezzo attuale
          ... IRR) e prima di Cronologia Ordini; stile identico al grafico
          Andamento Portafoglio. */}
      {priceHistory !== null && filteredPriceData.length > 0 && (
        <div className="bg-ink-800 rounded-xl border border-ink-600 p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="uppercase text-paper text-sm lg:text-base font-semibold tracking-wider">
                Storico Quotazioni
              </h3>
              {priceRefreshing && !priceError && (
                <p className="text-sm text-muted mt-1">Aggiornamento quotazioni da EODHD…</p>
              )}
              {/* Variazione del periodo selezionato (hidden per "All") */}
              {pricePeriodChange !== null && (
                <p
                  className={`text-sm lg:text-base font-bold mt-1 ${
                    pricePeriodChange >= 0 ? 'text-bull' : 'text-bear'
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
                      ? 'bg-bull text-paper'
                      : 'bg-ink-700 text-muted hover:bg-ink-600 hover:text-paper'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Banner errore refresh (non critico): il grafico resta con gli ultimi dati disponibili */}
          {priceError && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-400/30 bg-gold-500/15 px-3 py-2">
              <p className="text-sm text-gold-400">{priceError}</p>
              <button
                onClick={() => id && refreshPriceHistory(id)}
                disabled={priceRefreshing}
                className="px-3 py-1 text-xs font-medium rounded bg-gold-500/40 text-gold-400 hover:bg-gold-400/60 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
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
                tick={{ fill: 'var(--muted)', fontSize: isMobile ? 10 : 12 }}
                tickFormatter={formatMonthTick}
              />
              <YAxis
                width={isMobile ? 32 : 60}
                tick={{ fill: 'var(--muted)', fontSize: isMobile ? 8 : 12 }}
                tickFormatter={(value: number) => formatPrice(value)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0].payload as DailyPricePoint;
                  return (
                    <div className="bg-ink-700 border border-ink-600 rounded-lg px-4 py-3 shadow-lg">
                      <p className="text-muted text-sm">
                        {new Date(item.date).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                      <p className="font-semibold text-bull text-sm mt-1">
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
      <div className="bg-ink-800 rounded-xl border border-ink-600 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-600 bg-ink-800/50">
          <h3 className="text-sm font-semibold text-paper uppercase tracking-wider">Cronologia Ordini</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-ink-600 bg-ink-800/50">
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-left">Data</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-left">Tipo</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-right">Quantità</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-right">Prezzo</th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-right">Importo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-600">
              {orders.map((order, idx) => (
                <tr key={idx} className="hover:bg-ink-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-muted">{formatDate(order.date)}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      order.type === 'BUY'
                        ? 'bg-bull/15 text-bull border border-bull/30'
                        : 'bg-bear/15 text-bear border border-bear/30'
                    }`}>
                      {order.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-paper font-medium">
                    {order.quantity.toLocaleString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-muted">{formatPrice(order.price)}</td>
                  <td className="px-4 py-3 text-sm text-right text-paper font-medium">
                    {/* Importo con segno invertito: positivo per acquisto, negativo per vendita */}
                    {formatCurrency(order.type === 'BUY' ? Math.abs(order.amount) : -Math.abs(order.amount), order.currency)}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
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
        <div className="bg-ink-800 rounded-xl border border-ink-600 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-600 bg-ink-800/50">
            <h3 className="text-sm font-semibold text-paper uppercase tracking-wider">Cedole Incassate</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-ink-600 bg-ink-800/50">
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-left">Data</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-right">Importo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-600">
                {coupons.map((c, idx) => (
                  <tr key={idx} className="hover:bg-ink-700/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-muted">{formatDate(c.date)}</td>
                    <td className="px-4 py-3 text-sm text-right text-bull font-medium">
                      +{formatCurrency(c.amount, c.currency)}
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-muted">
                      Nessuna cedola incassata
                    </td>
                  </tr>
                )}
              </tbody>
              {coupons.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-ink-600 bg-ink-800/80">
                    <td className="px-4 py-3 text-sm font-semibold text-paper uppercase tracking-wider">Totale</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-bull">
                      +{formatCurrency(couponsTotal, coupons[0].currency)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        dividends.length > 0 && (
          <div className="bg-ink-800 rounded-xl border border-ink-600 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-600 bg-ink-800/50">
              <h3 className="text-sm font-semibold text-paper uppercase tracking-wider">Dividend History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-ink-600 bg-ink-800/50">
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-left">Data</th>
                    <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted text-right">Importo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-600">
                  {dividends.map((div, idx) => (
                    <tr key={idx} className="hover:bg-ink-700/30 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted">{formatDate(div.date)}</td>
                      <td className="px-4 py-3 text-sm text-right text-bull font-medium">
                        +{formatCurrency(div.amount, div.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-ink-600 bg-ink-800/80">
                    <td className="px-4 py-3 text-sm font-semibold text-paper uppercase tracking-wider">Totale</td>
                    <td className="px-4 py-3 text-sm text-right font-bold text-bull">
                      +{formatCurrency(dividendsTotal, dividends[0].currency)}
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