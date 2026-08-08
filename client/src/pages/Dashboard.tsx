import { useEffect, useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Line } from 'recharts';
import { TrendingUp, BarChart3, Wallet, Droplets, Calendar } from 'lucide-react';
import type { DashboardData, AllocationItem, SnapshotItem, TWRData } from '../types';

// Tipi per il filtro temporale del grafico
type TimeRange = '1m' | '3m' | '6m' | '1y' | 'ytd' | 'all';

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'ytd', label: 'YTD' },
  { key: 'all', label: 'All' },
];

// Calcola la data di cutoff in base al filtro selezionato.
// Restituisce una stringa ISO (YYYY-MM-DD) da confrontare con snapshot_date.
function getCutoffDate(range: TimeRange): string | null {
  const now = new Date();
  const yyyy = (d: Date) => d.getFullYear();
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0');
  const dd = (d: Date) => String(d.getDate()).padStart(2, '0');
  const fmt = (d: Date) => `${yyyy(d)}-${mm(d)}-${dd(d)}`;

  switch (range) {
    case '1m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return fmt(d);
    }
    case '3m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return fmt(d);
    }
    case '6m': {
      const d = new Date(now);
      d.setDate(d.getDate() - 180);
      return fmt(d);
    }
    case '1y': {
      const d = new Date(now);
      d.setDate(d.getDate() - 365);
      return fmt(d);
    }
    case 'ytd': {
      return `${yyyy(now)}-01-01`;
    }
    case 'all':
      return null;
  }
}

// Famiglia di colori per ogni asset type (tinta base).
// Ogni asset type ha una tinta propria: le sfumature vengono generate all'interno dello stesso gruppo.
const ASSET_TYPE_COLORS: Record<string, { hue: number; saturation: number }> = {
  BOND: { hue: 145, saturation: 60 },      // verde
  COMMODITY: { hue: 45, saturation: 85 },  // giallo
  FUND: { hue: 28, saturation: 75 },       // arancione
  STOCK: { hue: 0, saturation: 70 },       // rosso
  CASH: { hue: 220, saturation: 65 },      // blu
  ETF: { hue: 190, saturation: 60 },       // ciano
  ETC: { hue: 275, saturation: 60 },       // viola
  ETN: { hue: 330, saturation: 65 },       // rosa
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
    <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-lg">
      <p className="font-semibold text-white text-sm">{item.name}</p>
      <p className="text-slate-300 text-sm mt-1">
        Valore: €{item.marketValue.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
      <p className="text-slate-300 text-sm">
        Peso: {item.allocationPercent.toFixed(2)}%
      </p>
    </div>
  );
}

// Hook semplice per rilevare schermi < 1024px
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return isMobile;
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
    Promise.all([
      fetch('/api/analytics/dashboard').then(r => r.json()),
      fetch('/api/analytics/allocation').then(r => r.json()),
      fetch('/api/analytics/history').then(r => r.json()),
      fetch('/api/analytics/twr').then(r => r.json()),
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

  // Merge history + TWR per il grafico combinato
  const twrMap = new Map<string, number>();
  if (twr) {
    for (const item of twr.twrHistory) {
      twrMap.set(item.snapshot_date, item.twr);
    }
  }
  const chartData = history.map(s => ({
    ...s,
    twr: twrMap.get(s.snapshot_date) ?? null,
  }));

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

  const quarterTicks = useMemo(() => {
    return filteredChartData
      .filter((d, i, arr) => {
        if (i === 0 || i === arr.length - 1) return true;
        return new Date(d.snapshot_date).getMonth() % 3 === 0;
      })
      .map(d => d.snapshot_date);
  }, [filteredChartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Caricamento...</div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-lg">Errore nel caricamento dei dati</div>
      </div>
    );
  }

  const isPositive = dashboard.totalProfitLoss >= 0;

  const formatEUR = (value: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

  const formatPercent = (value: number) =>
    `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;

  const formatPctGainLoss = (value: number) =>
    `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

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
          <p className="text-slate-400 text-xs lg:text-sm flex items-center gap-1">
            <Calendar size={14} className="text-slate-400" />
            {new Date(dashboard.snapshotDate).toLocaleDateString('it-IT')}
          </p>
        )}
      </div>

      {/* Box VALORE PORTAFOGLIO — full-width */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
        <p className="uppercase text-slate-300 text-sm lg:text-base tracking-wider mb-2">
          Valore Portafoglio
        </p>
        <p className="text-white font-bold text-4xl lg:text-6xl">
          {formatEUR(dashboard.portfolioValue)}
        </p>
        <p className={`text-lg lg:text-2xl font-bold mt-2 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {isPositive ? '+' : ''}{formatEUR(dashboard.totalProfitLoss)}&nbsp;
          <span>({formatPctGainLoss(dashboard.totalProfitLossPercent)})</span>
        </p>
      </div>

      {/* Box ANDAMENTO PORTAFOGLIO — full-width */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
        <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-3">
          Andamento Portafoglio
        </h3>
        {/* Header con legenda a sinistra e bottoni time range a destra */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          {/* Legenda */}
          <div className="flex items-center gap-4">
            {[
              { key: 'portfolio', label: 'Portfolio', dashClass: '', color: '#10b981' },
              { key: 'deposits', label: 'Investito', dashClass: 'dashed', color: '#3b82f6' },
              { key: 'twr', label: 'TWR', dashClass: '', color: '#f59e0b' },
            ].map(({ key, label, dashClass, color }) => (
              <button
                key={key}
                onClick={() => toggleSeries(key)}
                className={`flex items-center gap-1.5 text-xs transition-all cursor-pointer select-none ${
                  isHidden(key) ? 'opacity-40 line-through' : 'text-slate-300 hover:text-white'
                }`}
                title={isHidden(key) ? `Mostra ${label}` : `Nascondi ${label}`}
              >
                <div
                  className="w-3 h-0.5"
                  style={{
                    backgroundColor: isHidden(key) ? '#475569' : color,
                    ...(dashClass === 'dashed' && !isHidden(key)
                      ? { backgroundImage: 'linear-gradient(90deg, #60a5fa 50%, transparent 50%)', backgroundSize: '6px 2px', backgroundRepeat: 'repeat-x' }
                      : {}),
                  }}
                />
                <span>{label}</span>
              </button>
            ))}
          </div>
          {/* Bottoni time range */}
          <div className="flex items-center gap-1">
            {TIME_RANGE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer select-none ${
                  timeRange === key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-200'
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
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="depositsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="snapshot_date"
                ticks={quarterTicks}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 12 }}
                tickFormatter={formatQuarter}
              />
              <YAxis
                yAxisId="left"
                width={isMobile ? 32 : 60}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 8 : 12 }}
                tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                domain={['auto', 'auto']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                width={isMobile ? 24 : 60}
                tick={{ fill: '#94a3b8', fontSize: isMobile ? 8 : 12 }}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const item = payload[0].payload as SnapshotItem & { twr: number | null };
                  const formatEUR = (v: number) =>
                    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
                  const formatPct = (v: number | null) =>
                    v !== null ? `${(v * 100).toFixed(2)}%` : 'N/D';
                  return (
                    <div className="bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 shadow-lg">
                      <p className="text-slate-300 text-sm">
                        {new Date(item.snapshot_date).toLocaleDateString('it-IT', {
                          day: '2-digit', month: 'long', year: 'numeric'
                        })}
                      </p>
                      <p className="font-semibold text-emerald-400 text-sm mt-1">
                        Portfolio: {formatEUR(item.portfolio_value)}
                      </p>
                      <p className="text-slate-300 text-xs mt-1">
                        Liquidità: {formatEUR(item.available_cash)}
                      </p>
                      <p className="text-blue-400 text-xs mt-1">
                        Investito: {formatEUR(item.cumulative_deposits)}
                      </p>
                      <p className={`text-xs mt-1 ${item.twr !== null && item.twr >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                />
              )}
              {!isHidden('deposits') && (
                <Area
                  yAxisId="left"
                  type="stepBefore"
                  dataKey="cumulative_deposits"
                  stroke="#3b82f6"
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
                  stroke="#f59e0b"
                  strokeWidth={1}
                  dot={false}
                  connectNulls={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-center py-8">Nessun dato storico disponibile</p>
        )}
      </div>

      {/* Due colonne: sinistra = allocazione, destra = 4 KPI verticali */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Allocazione Portafoglio — PieChart */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 lg:p-6">
          <h3 className="uppercase text-white text-sm lg:text-base font-semibold tracking-wider mb-4">
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
                    <span className="text-slate-300 truncate">{item.ticker}</span>
                    <span className="text-slate-500 ml-auto">{item.allocationPercent.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">Nessun dato di allocazione disponibile</p>
          )}
        </div>

        {/* 4 KPI box in sequenza verticale */}
        <div className="flex flex-col gap-4">
          <KpiCard
            title="Profit / Loss"
            value={`${isPositive ? '+' : ''}${formatEUR(dashboard.totalProfitLoss)}`}
            sub={`(${dashboard.totalProfitLossPercent}%)`}
            color={isPositive ? 'text-emerald-400' : 'text-red-400'}
            icon={<TrendingUp size={isMobile ? 24 : 32} className={isPositive ? 'text-emerald-400' : 'text-red-400'} />}
          />
          {twr && (
            <KpiCard
              title="TWR"
              value={formatPercent(twr.twrTotal)}
              color={twr.twrTotal >= 0 ? 'text-amber-400' : 'text-red-400'}
              icon={<BarChart3 size={isMobile ? 24 : 32} className={twr.twrTotal >= 0 ? 'text-amber-400' : 'text-red-400'} />}
            />
          )}
          <KpiCard
            title="Capitale Investito"
            value={formatEUR(dashboard.investedCapital)}
            color="text-blue-400"
            icon={<Wallet size={isMobile ? 24 : 32} className="text-blue-400" />}
          />
          <KpiCard
            title="Liquidità"
            value={formatEUR(dashboard.availableCash)}
            color="text-blue-400"
            icon={<Droplets size={isMobile ? 24 : 32} className="text-blue-400" />}
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, color, icon, sub }: { title: string; value: string; color: string; icon?: React.ReactNode; sub?: string }) {
  return (
    <div className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3 lg:p-5 flex items-center justify-between">
      <div>
        <p className="uppercase text-slate-400 text-sm lg:text-base font-semibold tracking-wider mb-2">{title}</p>
        <p className={`font-bold text-2xl lg:text-4xl ${color}`}>{value}</p>
        {sub && <p className={`font-bold mt-1 text-base lg:text-2xl ${color}`}>{sub}</p>}
      </div>
      {icon}
    </div>
  );
}