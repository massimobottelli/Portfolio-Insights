import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardData, AllocationItem } from '../types';

const COLORS = ['#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#2dd4bf', '#fb923c', '#e879f9'];

export default function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [allocation, setAllocation] = useState<AllocationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/analytics/dashboard').then(r => r.json()),
      fetch('/api/analytics/allocation').then(r => r.json()),
    ])
      .then(([dashData, allocData]) => {
        setDashboard(dashData);
        setAllocation(allocData);
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1">
          Ultimo aggiornamento: {dashboard.snapshotDate ? new Date(dashboard.snapshotDate).toLocaleDateString('it-IT') : 'N/D'}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Valore Portafoglio"
          value={formatEUR(dashboard.portfolioValue)}
          color="text-blue-400"
        />
        <KpiCard
          title="Capitale Investito"
          value={formatEUR(dashboard.investedCapital)}
          color="text-purple-400"
        />
        <KpiCard
          title="Liquidità"
          value={formatEUR(dashboard.availableCash)}
          color="text-emerald-400"
        />
        <KpiCard
          title="Profit / Loss"
          value={`${isPositive ? '+' : ''}${formatEUR(dashboard.totalProfitLoss)} (${dashboard.totalProfitLossPercent}%)`}
          color={isPositive ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* Allocation Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Allocazione Portafoglio</h3>
          {allocation.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={allocation.slice(0, 10)}
                    dataKey="allocationPercent"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    label={({ name, allocationPercent }) => `${name} (${allocationPercent}%)`}
                    labelLine={true}
                  >
                    {allocation.slice(0, 10).map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${value}%`}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-xs text-slate-500 mt-2">
                {allocation.length > 10 && `+${allocation.length - 10} asset minori`}
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">Nessun dato di allocazione disponibile</p>
          )}
        </div>

        {/* Position Summary */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Riepilogo Posizioni</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-slate-700">
              <span className="text-slate-400">Posizioni attive</span>
              <span className="text-white font-semibold">{dashboard.totalPositions}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-700">
              <span className="text-slate-400">Valore medio</span>
              <span className="text-white font-semibold">
                {dashboard.totalPositions > 0
                  ? formatEUR(dashboard.portfolioValue / dashboard.totalPositions)
                  : '-'}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-slate-400">Rapporto Liquidità/Patrimonio</span>
              <span className="text-white font-semibold">
                {dashboard.portfolioValue > 0
                  ? `${((dashboard.availableCash / dashboard.portfolioValue) * 100).toFixed(1)}%`
                  : '-'}
              </span>
            </div>
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