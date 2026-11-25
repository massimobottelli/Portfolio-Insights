import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Line } from 'recharts';
import { TrendingUp, BarChart3, Wallet, Calendar, CoinsIcon } from 'lucide-react';
import type { DashboardData, AllocationItem, SnapshotItem, TWRData } from '../types';
import { apiFetch } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';
import { TIME_RANGE_OPTIONS, getCutoffDate, type TimeRange } from '../lib/timeRange';
import { formatEUR } from '../lib/format';

// Famiglia di colori per ogni asset type (tinta base).
// Ogni asset type ha una tinta propria: le sfumature vengono generate all'interno dello stesso gruppo.
// I tipi ETF/ETC/ETN sono decommissionati (migrati a UNKNOWN): non più presenti.
const ASSET_TYPE_COLORS: Record<string, { hue: number; saturation: number }> = {
  BOND: { hue: 145, saturation: 60 },      // verde
  COMMODITY: { hue: 45, saturation: 85 },  // giallo
  FUND: { hue: 28, saturation: 75 },       // arancione
  STOCK: { hue: 0, saturation: 70 },       // rosso
  CASH: { hue: 220, saturation: 65 },      // blu
  UNKNOWN: { hue: 0, saturation: 0 },      // grigio
};

const DEFAULT_ASSET_COLOR = { hue: 200, saturation: 60 };

// Genera una sfumatura: indexInType 0 = più scuro (importo maggiore), ultimo = più chiaro.
function getAssetColor(assetType: string, indexInType: number, typeCount: number): string {
  const { hue, saturation } = ASSET_TYPE_COLORS[assetType] ?? DEFAULT_ASSET_COLOR;
  // Con un solo asset nel gruppo usa una tinta media; con più asset scala da scura a chiara.
  const lightness = typeCount <= 1 ? 50 : 32 + (indexInType / (typeCount - 1)) * 38;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: AllocationItem;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const item = payload[0].payload;
  return (
    <div className="bg-ink-800/95 border border-gold-400/30 rounded-lg px-4 py-3 shadow-lg backdrop-blur">
      <p className="font-semibold text-paper text-sm">{item.name}</p>
      <p className="text-muted text-sm mt-1">
        Valore: {formatEUR(item.marketValue)}
      </p>
      <p className="text-muted text-sm">
        Peso: {item.allocationPercent.toFixed(2)}%
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [history, setHistory] = useState<SnapshotItem[]>([]);
  const [twr, setTwr] = useState<TWRData | null>(null);
  const [loading, setLoading] = useState(true);
  // Serie nascoste nel grafico (cliccando sulla legenda)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  // Filtro temporale per l'asse X del grafico
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const isMobile = useIsMobile();

  // Ordina gli asset: prima per asset type (alfabetico), poi per importo totale decrescente.
  const sortedAllocation = useMemo(() => {
    return [...allocation].sort((a, b) => {
      if (a.asset_type !== b.asset_type) return a.asset_type.localeCompare(b.asset_type);
      return b.marketValue - a.marketValue;
    });
  }, [allocation]);

  // Colori: ogni asset type ha una famiglia di tinte, e all'interno del tipo
  // ogni asset ottiene una sfumatura dal più scuro (valore maggiore) al più chiaro.
  const allocationColors = useMemo(() => {
    const typeCounts = new Map<string, number>();
    for (const item of sortedAllocation) {
      typeCounts.set(item.asset_type, (typeCounts.get(item.asset_type) ?? 0) + 1);
    }
    const typeIndex = new Map<string, number>();
    return sortedAllocation.map(item => {
      const idx = typeIndex.get(item.asset_type) ?? 0;
      typeIndex.set(item.asset_type, idx + 1);
      return getAssetColor(item.asset_type, idx, typeCounts.get(item.asset_type) ?? 1);
    });
  }, [sortedAllocation]);

  useEffect(() => {
    // Helper: verifica lo status prima del parse JSON. Senza questo controllo,
    // un body di errore { error: "..." } veniva assegnato allo stato come se
    // fossero dati validi (es. allocation diventava un oggetto non-array).
    const fetchJson = async <T,>(url: string): Promise<T> => {
      const res = await apiFetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
      return res.json() as Promise<T>;
    };

    Promise.all([
      fetchJson<DashboardData>('/api/analytics/dashboard'),
      fetchJson<AllocationItem[]>('/api/analytics/allocation'),
      fetchJson<SnapshotItem[]>('/api/analytics/history'),
      fetchJson<TWRData>('/api/analytics/twr'),
    ])
      .then(([dashData, allocData, histData, twrData]) => {
        setDashboard(dashData);
        setAllocation(allocData);
        setHistory(histData);
        setTwr(twrData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Merge history + TWR per il grafico combinato (memoizzato: senza useMemo
  // la Map veniva ricostruita ad ogni render della pagina)
  const chartData = useMemo(() => {
    const twrMap = new Map<string, number>();
    if (twr) {
      for (const item of twr.twrHistory) {
        twrMap.set(item.snapshot_date, item.twr);
      }
    }
    return history.map(s => ({
      ...s,
      twr: twrMap.get(s.snapshot_date) ?? null,
    }));
  }, [history, twr]);

  // Filtra i dati del grafico in base al timeRange selezionato
  const filteredChartData = useMemo(() => {
    const cutoff = getCutoffDate(timeRange);
    if (cutoff === null) return chartData;
    return chartData.filter(d => d.snapshot_date >= cutoff);
  }, [chartData, timeRange]);

  // Etichette trimestrali per l'asse X (Qx-YY) per evitare sovrapposizioni.
  // Mostra solo i punti a inizio trimestre (gen, apr, lug, ott), più primo e ultimo sempre inclusi.
  const formatQuarter = (dateStr: string) => {
    const d = new Date(dateStr);
    const q = Math.floor(d.getMonth() / 3) + 1;
    const y = d.getFullYear().toString().slice(-2);
    return `Q${q}-${y}`;
  };

  // Etichette mensili per l'asse X (MM/YYYY) quando il filtro non è "All".
  const formatMonth = (dateStr: string) => {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${yyyy}`;
  };

  const quarterTicks = useMemo(() => {
    return filteredChartData
      .filter((d, i, arr) => {
        if (i === 0 || i === arr.length - 1) return true;
        return new Date(d.snapshot_date).getMonth() % 3 === 0;
      })
      .map(d => d.snapshot_date);
  }, [filteredChartData]);

  // Tick mensili per l'asse X: un tick per ogni cambio mese, più primo e ultimo sempre inclusi.
  const monthTicks = useMemo(() => {
    return filteredChartData
      .filter((d, i, arr) => {
        if (i === 0 || i === arr.length - 1) return true;
        return d.snapshot_date.slice(0, 7) !== arr[i - 1].snapshot_date.slice(0, 7);
      })
      .map(d => d.snapshot_date);
  }, [filteredChartData]);

  // Calcola variazione di periodo e TWR quando viene selezionato un time range specifico
  const periodStats = useMemo(() => {
    if (timeRange === 'all' || filteredChartData.length < 2) return null;
    const first = filteredChartData[0];
    const last = filteredChartData[filteredChartData.length - 1];
    const change = last.portfolio_value - first.portfolio_value;
    const changePct = first.portfolio_value > 0 ? (change / first.portfolio_value) * 100 : 0;
    // TWR del periodo: calcolo geometrico corretto
    // Formula: ((1 + TWR_finale) / (1 + TWR_iniziale) - 1) * 100
    // Non una semplice differenza, perché il TWR è cumulato geometricamente
    const twrPeriod = first.twr !== null && last.twr !== null
      ? ((1 + last.twr) / (1 + first.twr) - 1) * 100
      : null;
    return { change, changePct, twrPeriod };
  }, [filteredChartData, timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted text-lg">Caricamento...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bear text-lg">Errore nel caricamento dei dati</div>
      </div>
    );
  }

  const isPositive = dashboard.totalProfitLoss >= 0;

  const formatPercent = (value: number) =>
    `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

  // Funzione per attivare/disattivare una serie nella legenda
  const toggleSeries = (key: string) => {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const isHidden = (key: string) => hiddenSeries.has(key);

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Ultimo aggiornamento — in alto a destra */}
      <div className="flex justify-end">
        {dashboard.snapshotDate && (
          <p className="text-muted text-xs lg:text-sm flex items-center gap-1">
            <Calendar size={14} className="text-muted" />
            {new Date(dashboard.snapshotDate).toLocaleDateString('it-IT')}
          </p>
        )}
      </div>

      {/* Box VALORE PORTAFOGLIO — full-width (hero registro) */}
      <div className="bg-ink-800 rounded-xl border border-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] card-lift p-4 lg:p-6 reveal reveal-1 relative overflow-hidden">
        {/* Watermark sparkline */}
        {chartData.length > 1 && (
          <svg
            viewBox={`0 0 ${chartData.length} 100`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]"
            aria-hidden="true"
          >
            <polyline
              fill="none"
              stroke="var(--gold-400)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              points={(() => {
                const values = chartData.map(d => d.portfolio_value);
                const mn = Math.min(...values);
                const mx = Math.max(...values);
                const range = mx - mn || 1;
                return values.map((v, i) => `${i},${100 - ((v - mn) / range) * 100}`).join(' ');
              })()}
            />
          </svg>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <p className="uppercase text-muted text-sm lg:text-base tracking-wider mb-2">
              Valore Portafoglio
            </p>
            <p className="num font-bold text-5xl lg:text-7xl text-paper">
              {formatEUR(dashboard.portfolioValue)}
            </p>
            <p className={`text-lg lg:text-2xl font-bold mt-2 ${isPositive ? 'text-bull' : 'text-bear'}`}>
              {isPositive ? '+' : ''}{formatEUR(dashboard.totalProfitLoss)}
            </p>
          </div>
          {/* Variazione del periodo selezionato */}
          {periodStats && (
            <div className="sm:text-right">
              <p className="uppercase text-muted text-xs lg:text-sm tracking-wider mb-1">
                Variazione {timeRange.toUpperCase()}
              </p>
              <p className={`text-lg lg:text-2xl font-bold ${periodStats.change >= 0 ? 'text-bull' : 'text-bear'}`}>
                {periodStats.change >= 0 ? '+' : ''}{formatEUR(periodStats.change)}&nbsp;
                <span>({periodStats.changePct >= 0 ? '+' : ''}{periodStats.changePct.toFixed(2)}%)</span>
              </p>
              {periodStats.twrPeriod !== null && (
                <p className={`text-sm lg:text-base mt-1 ${periodStats.twrPeriod >= 0 ? 'text-gold-400' : 'text-bear'}`}>
                  TWR: {periodStats.twrPeriod >= 0 ? '+' : ''}{periodStats.twrPeriod.toFixed(2)}%
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Box ANDAMENTO PORTAFOGLIO — full-width */}
      <div className="bg-ink-800 rounded-xl border border-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] card-lift p-4 lg:p-6 reveal reveal-2">
        <h3 className="uppercase text-paper text-sm lg:text-base font-semibold tracking-wider mb-3">
          Andamento Portafoglio
        </h3>
        {/* Header con legenda a sinistra e bottoni time range a destra */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          {/* Legenda */}
          <div className="flex items-center gap-4">
            {[
              { key: 'portfolio', label: 'Portfolio', dashClass: '', color: 'var(--bull)' },
              { key: 'deposits', label: 'Investito', dashClass: 'dashed', color: 'var(--gold-400)' },
              { key: 'twr', label: 'TWR', dashClass: '', color: 'var(--muted)' },
            ].map(({ key, label, dashClass, color }) => (
              <button
                key={key}
                onClick={() => toggleSeries(key)}
                className={`flex items-center gap-1.5 text-xs transition-all cursor-pointer select-none ${
                  isHidden(key) ? 'opacity-40 line-through' : 'text-muted hover:text-paper'
                }`}
                title={isHidden(key) ? `Mostra ${label}` : `Nascondi ${label}`}
              >
                <div
                  className="w-3 h-0.5"
                  style={{
                    backgroundColor: isHidden(key) ? 'var(--ink-600)' : color,
                    ...(dashClass === 'dashed' && !isHidden(key)
                      ? { backgroundImage: 'linear-gradient(90deg, var(--gold-400) 50%, transparent 50%)', backgroundSize: '6px 2px', backgroundRepeat: 'repeat-x' }
                      : {}),
                  }}
                />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {/* Bottoni time range */}
          <div className="flex items-center gap-1 sm:pr-[80px] pr-[28px]">
            {TIME_RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer select-none ${
                  timeRange === key
                    ? 'bg-gold-500/80 text-paper'
                    : 'bg-ink-700 text-muted hover:bg-ink-600 hover:text-paper'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filteredChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 400}>
            <ComposedChart data={filteredChartData} margin={{ top: 10, right: isMobile ? 4 : 20, left: isMobile ? 0 : 10, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--bull)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--bull)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="depositsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--gold-400)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="var(--gold-400)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--ink-600)" />
              <XAxis
                dataKey="snapshot_date"
                ticks={timeRange === 'all' ? quarterTicks : monthTicks}
                tick={{ fill: 'var(--muted)', fontSize: isMobile ? 10 : 12, fontFamily: 'var(--font-num)' }}
                tickFormatter={timeRange === 'all' ? formatQuarter : formatMonth}
              />
              <YAxis
                yAxisId="left"
                width={isMobile ? 32 : 60}
                tick={{ fill: 'var(--muted)', fontSize: isMobile ? 8 : 12, fontFamily: 'var(--font-num)' }}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                domain={['auto', 'auto']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={isMobile ? 24 : 60}
                tick={{ fill: 'var(--muted)', fontSize: isMobile ? 8 : 12, fontFamily: 'var(--font-num)' }}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0].payload as SnapshotItem & { twr: number | null };
                  const formatPct = (v: number | null) =>
                    v !== null ? `${(v * 100).toFixed(2)}%` : 'N/D';
                  return (
                    <div className="bg-ink-800/95 backdrop-blur border border-gold-400/30 rounded-lg px-4 py-3 shadow-lg">
                      <p className="text-muted text-sm">
                        {new Date(item.snapshot_date).toLocaleDateString('it-IT', {
                          day: '2-digit', month: 'long', year: 'numeric'
                        })}
                      </p>
                      <p className="font-semibold text-bull text-sm mt-1">
                        Portfolio: {formatEUR(item.portfolio_value)}
                      </p>
                      <p className="text-muted text-xs mt-1">
                        Liquidità: {formatEUR(item.available_cash)}
                      </p>
                      <p className="text-gold-400 text-xs mt-1">
                        Investito: {formatEUR(item.cumulative_deposits)}
                      </p>
                      <p className={`text-xs mt-1 ${item.twr !== null && item.twr >= 0 ? 'text-bull' : 'text-bear'}`}>
                        TWR: {formatPct(item.twr)}
                      </p>
                    </div>
                  );
                }}
              />
              {!isHidden('portfolio') && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="portfolio_value"
                  stroke="var(--bull)"
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                />
              )}
              {!isHidden('deposits') && (
                <Area
                  yAxisId="left"
                  type="stepBefore"
                  dataKey="cumulative_deposits"
                  stroke="var(--gold-400)"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  fill="url(#depositsGradient)"
                  dot={false}
                />
              )}
              {!isHidden('twr') && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="twr"
                  stroke="var(--muted)"
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted text-center py-8">Nessun dato storico disponibile</p>
        )}
      </div>

      {/* Due colonne: sinistra = allocazione, destra = 4 KPI verticali */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Allocazione Portafoglio — PieChart */}
        <div className="bg-ink-800 rounded-xl border border-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] card-lift p-4 lg:p-6 reveal reveal-3">
          <h3 className="uppercase text-paper text-sm lg:text-base font-semibold tracking-wider mb-4">
            Allocazione Portafoglio
          </h3>
          {allocation.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={isMobile ? 250 : 400}>
                <PieChart>
                  <Pie
                    data={sortedAllocation}
                    dataKey="allocationPercent"
                    nameKey="ticker"
                    cx="50%"
                    cy="50%"
                    outerRadius={isMobile ? 90 : 140}
                    innerRadius={isMobile ? 45 : 70}
                    paddingAngle={1}
                  >
                    {sortedAllocation.map((_, index) => (
                      <Cell key={index} fill={allocationColors[index]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 mt-4 w-full max-w-2xl">
                {sortedAllocation.map((item, index) => (
                  <div key={item.asset_id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: allocationColors[index] }}
                    />
                    <span className="text-muted truncate">{item.ticker}</span>
                    <span className="text-muted ml-auto">{item.allocationPercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted text-center py-8">Nessun dato di allocazione disponibile</p>
          )}
        </div>

        {/* 4 KPI box in sequenza verticale */}
        <div className="flex flex-col gap-4">
          <KpiCard
            title="Gain / Loss"
            value={`${isPositive ? '+' : ''}${formatEUR(dashboard.totalProfitLoss)}`}
            sub={`(${dashboard.totalProfitLossPercent}%)`}
            color={isPositive ? 'text-bull' : 'text-bear'}
            icon={<TrendingUp size={isMobile ? 24 : 32} className={isPositive ? 'text-bull' : 'text-bear'} />}
            reveal="reveal-4"
          />
          {twr && (
            <KpiCard
              title="TWR"
              value={formatPercent(twr.twrTotal)}
              color={twr.twrTotal >= 0 ? 'text-gold-400' : 'text-bear'}
              icon={<BarChart3 size={isMobile ? 24 : 32} className={twr.twrTotal >= 0 ? 'text-gold-400' : 'text-bear'} />}
              reveal="reveal-5"
            />
          )}
          <KpiCard
            title="Capitale Investito"
            value={formatEUR(dashboard.investedCapital)}
            color="text-gold-400"
            icon={<Wallet size={isMobile ? 24 : 32} className="text-gold-400" />}
            reveal="reveal-6"
          />
          <KpiCard
            title="Liquidità"
            value={formatEUR(dashboard.availableCash)}
            color="text-gold-400"
            icon={<CoinsIcon size={isMobile ? 24 : 32} className="text-gold-400" />}
            reveal="reveal-6"
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, color, icon, sub, reveal }: { title: string; value: string; color: string; icon?: React.ReactNode; sub?: string; reveal?: string }) {
  return (
    <div className={`flex-1 bg-ink-800 rounded-xl border border-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] card-lift p-3 lg:p-5 flex items-center justify-between ${reveal || ''}`}>
      <div>
        <p className="uppercase text-muted text-sm lg:text-base font-semibold tracking-wider mb-2">{title}</p>
        <p className={`num font-bold text-2xl lg:text-4xl ${color}`}>{value}</p>
        {sub && <p className={`num font-bold mt-1 text-base lg:text-2xl ${color}`}>{sub}</p>}
      </div>
      {icon}
    </div>
  );
}