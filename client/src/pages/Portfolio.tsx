import { useEffect, useState } from 'react';
import type { PositionItem } from '../types';

export default function Portfolio() {
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/portfolio')
      .then(r => r.json())
      .then(data => setPositions(data))
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Portfolio</h2>
        <p className="text-slate-400 text-sm mt-1">
          {positions.length} posizioni attive
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Ticker</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">ISIN</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Nome</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Quantità</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Valuta</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {positions.map((pos) => (
                <tr key={pos.asset_id} className="hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">{pos.ticker}</td>
                  <td className="px-4 py-3 text-sm text-slate-400 font-mono">{pos.isin}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">{pos.name}</td>
                  <td className="px-4 py-3 text-sm text-right text-white font-medium">
                    {pos.quantity.toLocaleString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{pos.currency}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-300">
                      {pos.asset_type || 'UNKNOWN'}
                    </span>
                  </td>
                </tr>
              ))}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nessuna posizione attiva
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}