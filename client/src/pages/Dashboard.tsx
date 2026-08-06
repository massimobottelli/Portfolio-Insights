import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, CartesianGrid, Line } from 'recharts';
import type { DashboardData, AllocationItem, SnapshotItem, TWRData } from '../types';

const COLORS = [
  '#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ca8a04', '#9333ea',
  '#0d9488', '#be123c', '#4f46e5', '#16a34a', '#f59e0b',
  '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
  '#eab308', '#a855f7', '#14b8a6', '#e11d48', '#6366f1',
  '#22c55e', '#f97316',
];

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
        Valore: €{item.marketValue.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
      <p className="text-slate-300 text-sm">
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
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);

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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1">
          Ultimo aggiornamento: {dashboard.snapshotDate ? new Date(dashboard.snapshotDate).toLocaleDateString('it-IT') : 'N/D'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          title="Valore Portfolio"
          value={formatEUR(dashboard.portfolioValue)}
          color="text-emerald-400"
        />
        <KpiCard
          title="Capitale Investito"
          value={formatEUR(dashboard.investedCapital)}
          color="text-blue-400"
        />
        <KpiCard
          title="Liquidità"
          value={formatEUR(dashboard.availableCash)}
          color="text-blue-400"
        />
        <KpiCard
          title="Profit / Loss"
          value={`${isPositive ? '+' : ''}${formatEUR(dashboard.totalProfitLoss)} (${dashboard.totalProfitLossPercent}%)`}
          color={isPositive ? 'text-emerald-400' : 'text-red-400'}
        />
        {twr && (
          <KpiCard
            title="TWR"
            value={formatPercent(twr.twrTotal)}
            color={twr.twrTotal >= 0 ? 'text-amber-400' : 'text-red-400'}
          />
        )}
      </div>

      {/* Allocation Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Allocazione Portafoglio</h3>
          {allocation.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="allocationPercent"
                    nameKey="ticker"
                    cx="50%"
                    cy="50%"
                    outerRadius={140}
                    innerRadius={70}
                    paddingAngle={1}
                  >
                    {allocation.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 mt-4 w-full max-w-2xl">
                {allocation.map((item, index) => (
                  <div key={item.asset_id} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
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

        {/* Portfolio Value & TWR History Chart */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Andamento Portfolio & TWR</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
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
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(dateStr) => {
                    const d = new Date(dateStr);
                    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' });
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const item = payload[0].payload as SnapshotItem & { twr: number | null };
                    const formatEUR = (v: number) =>
                      new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v);
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
          {/* Legenda cliccabile per attivare/disattivare le serie */}
          <div className="flex items-center gap-4 mt-2">
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
        </div>
      </div>
    </div>
  );
}

function KpiCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <p className="text-sm text-slate-400 mb-2">{title}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}