import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TIME_RANGE_OPTIONS, getCutoffDate, type TimeRange } from '../../lib/timeRange';
import type { ComparisonAssetItem, PriceComparisonResponse } from '../../types';

// Palette di colori ad alto contrasto per tema scuro
const ASSET_COLORS = [
  '#38bdf8', // Sky 400
  '#f59e0b', // Amber 500
  '#a855f7', // Purple 500
  '#ec4899', // Pink 500
  '#06b6d4', // Cyan 500
  '#eab308', // Yellow 500
  '#f97316', // Orange 500
  '#6366f1', // Indigo 500
  '#14b8a6', // Teal 500
  '#84cc16', // Lime 500
  '#f43f5e', // Rose 500
  '#8b5cf6', // Violet 500
];

const PORTFOLIO_COLOR = '#10b981'; // Emerald 500

interface AssetComparisonChartProps {
  portfolioSeries?: Array<{ date: string; value: number }>;
}

export default function AssetComparisonChart({ portfolioSeries }: AssetComparisonChartProps) {
  const isMobile = useIsMobile();
  const [range, setRange] = useState<TimeRange>('1y');
  const [assets, setAssets] = useState<ComparisonAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Asset selezionati per la visualizzazione
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Toggle benchmark Portafoglio complessivo
  const [showPortfolio, setShowPortfolio] = useState(true);

  // Caricamento dati da GET /api/prices/compare
  const loadComparisonData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/prices/compare');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: PriceComparisonResponse = await res.json();
      setAssets(data.assets || []);
      // Seleziona inizialmente tutti gli asset disponibili
      setSelectedIds(new Set((data.assets || []).map((a) => a.id)));
    } catch (err) {
      console.error('Failed to load price comparison data:', err);
      setError('Impossibile caricare i dati storici degli asset');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComparisonData();
  }, [loadComparisonData]);

  // Mappa stabile ID -> Colore assegnato all'asset
  const assetColors = useMemo(() => {
    const map = new Map<string, string>();
    assets.forEach((asset, idx) => {
      map.set(asset.id, ASSET_COLORS[idx % ASSET_COLORS.length]);
    });
    return map;
  }, [assets]);

  // Cutoff date in base al range temporale selezionato
  const cutoffDate = useMemo(() => getCutoffDate(range), [range]);

  // Filtra e prepara i punti per ciascun asset nel range temporale
  const preparedAssets = useMemo(() => {
    return assets
      .map((asset) => {
        let filteredPrices = asset.prices;
        if (asset.firstOrderDate !== null && asset.firstOrderDate !== undefined) {
          filteredPrices = filteredPrices.filter((p) => p.date >= asset.firstOrderDate!);
        }
        if (cutoffDate !== null) {
          filteredPrices = filteredPrices.filter((p) => p.date >= cutoffDate);
        }

        if (filteredPrices.length < 2) {
          return null;
        }

        const basePrice = filteredPrices[0].close;
        const lastPrice = filteredPrices[filteredPrices.length - 1].close;
        const periodReturn = basePrice > 0 ? ((lastPrice - basePrice) / basePrice) * 100 : 0;

        const priceByDate = new Map<string, number>();
        for (const p of filteredPrices) {
          priceByDate.set(p.date, p.close);
        }

        return {
          ...asset,
          filteredPrices,
          basePrice,
          periodReturn,
          priceByDate,
          firstDate: filteredPrices[0].date,
          lastDate: filteredPrices[filteredPrices.length - 1].date,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [assets, cutoffDate]);

  // Serie Portafoglio normalizzata nel range temporale selezionato
  const preparedPortfolio = useMemo(() => {
    if (!portfolioSeries || portfolioSeries.length === 0) return null;

    const filtered = cutoffDate
      ? portfolioSeries.filter((p) => p.date >= cutoffDate)
      : portfolioSeries;

    if (filtered.length < 2) return null;

    const baseValue = filtered[0].value;
    const lastValue = filtered[filtered.length - 1].value;
    const periodReturn = baseValue > 0 ? ((lastValue / baseValue) - 1) * 100 : 0;

    const valueByDate = new Map<string, number>();
    for (const p of filtered) {
      valueByDate.set(p.date, p.value);
    }

    return {
      filtered,
      baseValue,
      periodReturn,
      valueByDate,
      firstDate: filtered[0].date,
    };
  }, [portfolioSeries, cutoffDate]);

  // Costruzione della tabella unificata di punti per Recharts
  const { chartData, monthTicks } = useMemo(() => {
    const activeAssets = preparedAssets.filter((a) => selectedIds.has(a.id));

    // Raccoglie tutte le date uniche
    const dateSet = new Set<string>();
    for (const a of activeAssets) {
      for (const p of a.filteredPrices) {
        dateSet.add(p.date);
      }
    }

    if (showPortfolio && preparedPortfolio) {
      for (const p of preparedPortfolio.filtered) {
        dateSet.add(p.date);
      }
    }

    const sortedDates = Array.from(dateSet).sort();
    if (sortedDates.length === 0) {
      return { chartData: [], monthTicks: [] };
    }

    // Forward-fill dei rendimenti per gestire borse con calendari festivi diversi
    const lastKnownReturn = new Map<string, number>();
    let lastKnownPortfolioReturn: number | null = null;

    const rows = sortedDates.map((date) => {
      const row: Record<string, string | number> = { date };

      for (const a of activeAssets) {
        const price = a.priceByDate.get(date);
        if (price !== undefined) {
          const ret = ((price - a.basePrice) / a.basePrice) * 100;
          lastKnownReturn.set(a.id, ret);
          row[a.id] = Number(ret.toFixed(2));
        } else if (date >= a.firstDate && lastKnownReturn.has(a.id)) {
          // Forward-fill solo dopo che l'asset ha iniziato a quotare nel range
          row[a.id] = Number(lastKnownReturn.get(a.id)!.toFixed(2));
        }
      }

      if (showPortfolio && preparedPortfolio) {
        const val = preparedPortfolio.valueByDate.get(date);
        if (val !== undefined) {
          const ret = ((val / preparedPortfolio.baseValue) - 1) * 100;
          lastKnownPortfolioReturn = ret;
          row.portfolio = Number(ret.toFixed(2));
        } else if (date >= preparedPortfolio.firstDate && lastKnownPortfolioReturn !== null) {
          row.portfolio = Number(lastKnownPortfolioReturn.toFixed(2));
        }
      }

      return row;
    });

    // Generazione tick dell'asse X (mensili o bisettimanali su range brevi)
    const seen = new Set<string>();
    const ticks: string[] = [];
    const isShortRange = range === '1m' || range === '3m';

    for (const row of rows) {
      const dateStr = String(row.date);
      const key = isShortRange ? dateStr.slice(0, 10) : dateStr.slice(0, 7);
      if (!seen.has(key)) {
        seen.add(key);
        ticks.push(dateStr);
      }
    }

    // Campionamento per evitare sovrapposizioni su mobile o periodi lunghi
    const maxTicks = isMobile ? 5 : 8;
    let sampledTicks = ticks;
    if (ticks.length > maxTicks) {
      const step = Math.ceil(ticks.length / maxTicks);
      sampledTicks = ticks.filter((_, idx) => idx % step === 0 || idx === ticks.length - 1);
    }

    return { chartData: rows, monthTicks: sampledTicks };
  }, [preparedAssets, selectedIds, showPortfolio, preparedPortfolio, range, isMobile]);

  // Formattatore asse X coerente con la durata
  const formatTick = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr);
      if (range === '1m' || range === '3m') {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}`;
      }
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}/${yyyy}`;
    },
    [range]
  );

  const toggleAsset = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(preparedAssets.map((a) => a.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  if (loading && assets.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Caricamento confronto quote...</span>
        </div>
      </div>
    );
  }

  if (error && assets.length === 0) {
    return (
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={loadComparisonData}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
        >
          Riprova
        </button>
      </div>
    );
  }

  if (preparedAssets.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
      {/* 1. Header con titolo e selettore timeframe */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider">
            Confronto Rendimenti Asset
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Rendimento normalizzato a base 0% dalla data del primo acquisto (o dall'inizio del periodo selezionato)
          </p>
        </div>

        {/* Filtro temporale (1M, 3M, 6M, 1Y, YTD, All) */}
        <div className="flex items-center gap-1 bg-slate-900/60 p-1 rounded-lg border border-slate-700/80 self-start sm:self-auto">
          {TIME_RANGE_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                range === key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Barra controlli: Selettori Asset e Benchmark Portafoglio */}
      <div className="mb-4 space-y-2.5 pt-2 border-t border-slate-700/60">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Strumenti:</span>
            <button
              onClick={selectAll}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 cursor-pointer transition-colors"
            >
              Tutti
            </button>
            <button
              onClick={deselectAll}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-700/60 hover:bg-slate-700 cursor-pointer transition-colors"
            >
              Nessuno
            </button>
          </div>

          {/* Toggle opzionale Portafoglio TWR */}
          {preparedPortfolio && (
            <button
              onClick={() => setShowPortfolio((prev) => !prev)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors cursor-pointer font-medium ${
                showPortfolio
                  ? 'bg-emerald-950/60 border-emerald-500/80 text-emerald-300'
                  : 'bg-slate-900/40 border-slate-700 text-slate-500 hover:text-slate-400'
              }`}
            >
              <span
                className="w-2.5 h-0.5 border-b-2 border-dashed"
                style={{ borderColor: PORTFOLIO_COLOR }}
              />
              <span>Portafoglio (TWR)</span>
              <span
                className={`font-semibold ml-0.5 ${
                  preparedPortfolio.periodReturn >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {preparedPortfolio.periodReturn >= 0 ? '+' : ''}
                {preparedPortfolio.periodReturn.toFixed(1)}%
              </span>
            </button>
          )}
        </div>

        {/* Chips/Pill interattive per ciascun asset con rendimento di periodo */}
        <div className="flex flex-wrap gap-1.5">
          {preparedAssets.map((asset) => {
            const isSelected = selectedIds.has(asset.id);
            const color = assetColors.get(asset.id) || '#38bdf8';
            const isPositive = asset.periodReturn >= 0;

            return (
              <button
                key={asset.id}
                onClick={() => toggleAsset(asset.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900/80 border-slate-600 text-white shadow-sm'
                    : 'bg-slate-900/30 border-slate-800 text-slate-500 opacity-60 hover:opacity-90'
                }`}
                title={`${asset.name} (${asset.ticker})`}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 transition-transform group-hover:scale-125"
                  style={{ backgroundColor: color }}
                />
                <span className={isSelected ? 'text-slate-200' : 'text-slate-500'}>
                  {asset.ticker}
                </span>
                <span
                  className={`font-semibold ${
                    isSelected
                      ? isPositive
                        ? 'text-emerald-400'
                        : 'text-red-400'
                      : 'text-slate-500'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {asset.periodReturn.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Grafico multi-linea Recharts */}
      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
          Nessuno strumento selezionato per il confronto.
        </div>
      ) : (
        <div className="w-full">
          <ResponsiveContainer width="100%" height={isMobile ? 260 : 380}>
            <LineChart
              data={chartData}
              margin={{
                top: 10,
                right: isMobile ? 8 : 20,
                left: isMobile ? -15 : 5,
                bottom: 0,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <ReferenceLine y={0} stroke="#64748b" strokeDasharray="2 2" strokeWidth={1} />
              <XAxis
                dataKey="date"
                ticks={monthTicks}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }}
                tickFormatter={formatTick}
              />
              <YAxis
                width={isMobile ? 45 : 60}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 9 : 12 }}
                tickFormatter={(val: number) => (val >= 0 ? `+${val.toFixed(0)}%` : `${val.toFixed(0)}%`)}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;

                  // Ordina i valori decrescenti per rendimento
                  const sorted = [...payload].sort(
                    (a, b) => Number(b.value ?? -Infinity) - Number(a.value ?? -Infinity)
                  );

                  const dateFormatted = new Date(String(label)).toLocaleDateString('it-IT', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <div className="bg-slate-900/95 border border-slate-700 shadow-2xl rounded-lg p-3 text-xs max-w-xs backdrop-blur-sm">
                      <p className="text-slate-400 font-medium mb-2 border-b border-slate-800 pb-1 capitalize">
                        {dateFormatted}
                      </p>
                      <div className="space-y-1.5 max-h-56 overflow-y-auto">
                        {sorted.map((item) => {
                          const val = Number(item.value);
                          const isPos = val >= 0;
                          const isPort = item.dataKey === 'portfolio';

                          return (
                            <div
                              key={String(item.dataKey)}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: item.stroke }}
                                />
                                <span
                                  className={`truncate ${
                                    isPort ? 'font-semibold text-emerald-300' : 'text-slate-300'
                                  }`}
                                >
                                  {item.name}
                                </span>
                              </div>
                              <span
                                className={`font-mono font-semibold flex-shrink-0 ${
                                  isPos ? 'text-emerald-400' : 'text-red-400'
                                }`}
                              >
                                {isPos ? '+' : ''}
                                {val.toFixed(2)}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Linea benchmark Portafoglio complessivo */}
              {showPortfolio && preparedPortfolio && (
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portafoglio (TWR)"
                  stroke={PORTFOLIO_COLOR}
                  strokeWidth={2.5}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 5, fill: PORTFOLIO_COLOR, strokeWidth: 0 }}
                  connectNulls
                />
              )}

              {/* Linee per gli asset selezionati */}
              {preparedAssets.map((asset) => {
                if (!selectedIds.has(asset.id)) return null;
                const color = assetColors.get(asset.id) || '#38bdf8';

                return (
                  <Line
                    key={asset.id}
                    type="monotone"
                    dataKey={asset.id}
                    name={asset.ticker}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 4. Nota informativa a piè di grafico */}
      <p className="text-[11px] text-slate-500 mt-3">
        Nota: le obbligazioni (BOND) e gli strumenti senza serie di prezzi di chiusura sono esclusi
        dal confronto. La serie di ciascun asset parte dalla data del primo acquisto (o dall'inizio del periodo selezionato se successivo), con rendimento normalizzato a base 0%.
      </p>
    </div>
  );
}
