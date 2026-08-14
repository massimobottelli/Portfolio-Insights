import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../lib/api';
import type {
  CurrentAllocationResponse,
  AllocationTargetResponse,
  RebalanceResponse,
  DivergenceItem,
  RebalanceSuggestion
} from '../types';

const TARGETABLE_TYPES = ['STOCK', 'BOND', 'COMMODITY', 'FUND', 'CASH'];

// Colori per il diagramma a torta, coerenti con la convention usata
// nella Dashboard per l'allocazione portfolio (ASSET_TYPE_COLORS).
// Lightness 50 = tinta media (come un singolo asset nel gruppo).
const TYPE_COLORS: Record<string, string> = {
  STOCK: 'hsl(0, 70%, 50%)',        // rosso
  BOND: 'hsl(145, 60%, 50%)',       // verde
  COMMODITY: 'hsl(45, 85%, 50%)',   // giallo
  FUND: 'hsl(28, 75%, 50%)',        // arancione
  CASH: 'hsl(220, 65%, 50%)',       // blu
};

const formatAmount = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const divergenceColor = (value: number) => {
  if (value > 0) return 'text-emerald-400';
  if (value < 0) return 'text-red-400';
  return 'text-slate-300';
};

export default function Allocation() {
  const [current, setCurrent] = useState<CurrentAllocationResponse | null>(null);
  const [target, setTarget] = useState<AllocationTargetResponse | null>(null);
  const [rebalance, setRebalance] = useState<RebalanceResponse | null>(null);
  const [targetInputs, setTargetInputs] = useState<Record<string, string>>({});
  const [toleranceInput, setToleranceInput] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Carica i dati iniziali
  useEffect(() => {
    const load = async () => {
      try {
        const [currentRes, targetRes, rebalanceRes] = await Promise.all([
          apiFetch('/api/allocation/current'),
          apiFetch('/api/allocation/target'),
          apiFetch('/api/allocation/rebalance'),
        ]);

        if (!currentRes.ok || !targetRes.ok || !rebalanceRes.ok) {
          throw new Error('Errore nel caricamento dei dati di allocazione');
        }

        const currentData: CurrentAllocationResponse = await currentRes.json();
        const targetData: AllocationTargetResponse = await targetRes.json();
        const rebalanceData: RebalanceResponse = await rebalanceRes.json();

        setCurrent(currentData);
        setTarget(targetData);
        setRebalance(rebalanceData);

        // Inizializza gli input target dai dati salvati
        const inputs: Record<string, string> = {};
        for (const type of TARGETABLE_TYPES) {
          const found = targetData.targets.find(t => t.assetType === type);
          inputs[type] = found ? String(found.targetPercent) : '0';
        }
        setTargetInputs(inputs);
        setToleranceInput(String(targetData.tolerance));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Errore sconosciuto');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Somma dei target in tempo reale
  const targetSum = useMemo(() => {
    return TARGETABLE_TYPES.reduce((sum, type) => {
      const val = parseFloat(targetInputs[type] || '0');
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [targetInputs]);

  const sumIsValid = Math.abs(targetSum - 100) < 0.001;

  // Dati per il diagramma a torta, calcolati in tempo reale dagli input
  const pieData = useMemo(() => {
    return TARGETABLE_TYPES.map(type => ({
      name: type,
      value: parseFloat(targetInputs[type] || '0') || 0,
      color: TYPE_COLORS[type],
    })).filter(d => d.value > 0);
  }, [targetInputs]);

  // Mappa categoria → percentuale attuale
  const currentMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (current) {
      for (const c of current.categories) {
        map[c.assetType] = c.percent;
      }
    }
    return map;
  }, [current]);

  // Mappa categoria → target
  const targetMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (target) {
      for (const t of target.targets) {
        map[t.assetType] = t.targetPercent;
      }
    }
    return map;
  }, [target]);

  // Mappa categoria → deviazione
  const divergenceMap = useMemo(() => {
    const map: Record<string, DivergenceItem> = {};
    if (rebalance) {
      for (const d of rebalance.divergences) {
        map[d.assetType] = d;
      }
    }
    return map;
  }, [rebalance]);

  const handleInputChange = (type: string, value: string) => {
    setTargetInputs(prev => ({ ...prev, [type]: value }));
  };

  const handleSave = async () => {
    if (!sumIsValid) {
      setError('La somma dei target deve essere 100%');
      return;
    }

    const tolerance = parseFloat(toleranceInput);
    if (isNaN(tolerance) || tolerance <= 0) {
      setError('La soglia di tolleranza deve essere un numero maggiore di 0');
      return;
    }

    setSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const targets = TARGETABLE_TYPES.map(type => ({
        assetType: type,
        targetPercent: parseFloat(targetInputs[type] || '0')
      }));

      const res = await apiFetch('/api/allocation/target', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tolerance, targets }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Errore nel salvataggio del target');
      }

      const saved: AllocationTargetResponse = await res.json();
      setTarget(saved);
      setSaveMessage('Target salvato');

      // Ricarica il ribilanciamento
      const rebalanceRes = await apiFetch('/api/allocation/rebalance');
      if (rebalanceRes.ok) {
        setRebalance(await rebalanceRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore sconosciuto');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Allocazione Portfolio</h1>
        <p className="text-sm text-slate-400 mt-1">
          Definisci l'allocazione target e verifica i ribilanciamenti necessari
        </p>
      </div>

      {/* Banner asset non classificati */}
      {current && current.unknownAssets > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-900/20">
          <AlertTriangle className="text-amber-400 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-medium text-amber-300">
              {current.unknownAssets} asset non classificati
            </p>
            <p className="text-xs text-amber-200/70 mt-1">
              Vai alla pagina Portfolio per assegnare un tipo a questi asset.
            </p>
          </div>
        </div>
      )}

      {/* Editor target */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Target Allocation</h2>
          <button
            onClick={handleSave}
            disabled={saving || !sumIsValid}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salva
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Colonna sinistra: input percentuali */}
          <div>
            <div className="space-y-3">
              {TARGETABLE_TYPES.map(type => (
                <div key={type} className="flex items-center justify-between gap-3">
                  <label className="text-sm font-medium text-slate-300">{type}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={targetInputs[type] || ''}
                      onChange={e => handleInputChange(type, e.target.value)}
                      className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-sm text-slate-400">%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Somma e validazione */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-slate-400">Somma:</span>
              <span className={`text-sm font-semibold ${sumIsValid ? 'text-emerald-400' : 'text-red-400'}`}>
                {targetSum.toFixed(1)}%
              </span>
              {sumIsValid ? (
                <span className="text-emerald-400 text-sm">✅</span>
              ) : (
                <span className="text-red-400 text-sm">❌ Deve essere 100%</span>
              )}
            </div>

            {/* Soglia di tolleranza */}
            <div className="mt-4 flex items-center gap-3">
              <label className="text-sm font-medium text-slate-300">Soglia di tolleranza:</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={toleranceInput}
                  onChange={e => setToleranceInput(e.target.value)}
                  className="w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <span className="text-sm text-slate-400">%</span>
              </div>
            </div>
          </div>

          {/* Colonna destra: diagramma a torta in tempo reale */}
          <div className="flex flex-col items-center justify-center">
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#0f172a',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legenda */}
            <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-300">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
            {error}
          </div>
        )}
        {saveMessage && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/30 text-sm text-emerald-300">
            {saveMessage}
          </div>
        )}
      </div>

      {/* Tabella attuale vs target */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Allocazione attuale vs target</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-700">
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-right">Attuale</th>
                <th className="px-4 py-3 text-right">Target</th>
                <th className="px-4 py-3 text-right">Deviazione</th>
                <th className="px-4 py-3 text-right">Importo</th>
                <th className="px-4 py-3 text-center">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {TARGETABLE_TYPES.map(type => {
                const currentPercent = currentMap[type] || 0;
                const targetPercent = targetMap[type] || 0;
                const div = divergenceMap[type];
                const divergence = div ? div.divergencePercent : currentPercent - targetPercent;
                const amount = div ? div.divergenceAmount : 0;
                const isOver = Math.abs(divergence) > (rebalance?.tolerance || 5);

                return (
                  <tr key={type} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-200">{type}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatPercent(currentPercent)}</td>
                    <td className="px-4 py-3 text-right text-slate-300">{formatPercent(targetPercent)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${divergenceColor(divergence)}`}>
                      {formatPercent(divergence)}
                    </td>
                    <td className={`px-4 py-3 text-right ${divergenceColor(divergence)}`}>
                      {divergence !== 0 ? `€${formatAmount(amount)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOver && divergence !== 0 ? (
                        divergence < 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-900/30 text-emerald-300 border border-emerald-700/50 text-xs font-medium">
                            <TrendingUp size={14} /> COMPRA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-900/30 text-red-300 border border-red-700/50 text-xs font-medium">
                            <TrendingDown size={14} /> VENDI
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center text-slate-500">
                          <Minus size={14} />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suggerimenti ribilanciamento */}
      {rebalance && rebalance.suggestions.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Suggerimenti ribilanciamento</h2>
          <div className="space-y-3">
            {rebalance.suggestions.map((s: RebalanceSuggestion) => (
              <div
                key={s.assetType}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  s.action === 'BUY'
                    ? 'bg-emerald-900/20 border-emerald-700/50'
                    : 'bg-red-900/20 border-red-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {s.action === 'BUY' ? (
                    <TrendingUp className="text-emerald-400" size={20} />
                  ) : (
                    <TrendingDown className="text-red-400" size={20} />
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${s.action === 'BUY' ? 'text-emerald-300' : 'text-red-300'}`}>
                      {s.action === 'BUY' ? 'COMPRA' : 'VENDI'} €{formatAmount(s.amount)} di {s.assetType}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Deviazione {formatPercent(s.divergencePercent)} {s.action === 'BUY' ? 'sotto' : 'oltre'} target
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totale investito */}
      {current && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <p className="text-sm text-slate-400">
            Valore totale investito:{' '}
            <span className="font-semibold text-white">€{formatAmount(current.totalValue)}</span>
          </p>
        </div>
      )}
    </div>
  );
}