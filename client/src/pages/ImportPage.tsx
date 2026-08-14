import { useEffect, useState, useRef } from 'react';
import type { ImportSession, ImportResponse } from '../types';
import { apiFetch } from '../lib/api';

export default function ImportPage() {
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = () => {
    apiFetch('/api/import/sessions')
      .then(r => r.json())
      .then(data => setSessions(data))
      .catch(console.error);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const fileContent = await file.text();

      const response = await apiFetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileContent,
          filename: file.name,
        }),
      });

      const data: ImportResponse = await response.json();

      if (response.ok && data.success) {
        setResult({
          success: true,
          message: `Importati ${data.recordsImported} record su ${data.totalRecords} totali`,
        });
        loadSessions();
      } else {
        setResult({
          success: false,
          message: 'Errore durante l\'importazione',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`,
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearDatabase = async () => {
    setClearing(true);
    setResult(null);
    setShowConfirm(false);

    try {
      const response = await apiFetch('/api/import/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const { deleted } = data;
        setResult({
          success: true,
          message: `Database svuotato: ${deleted.sessions} sessioni, ${deleted.assets} asset, ${deleted.marketOrders} ordini, ${deleted.cashMovements} movimenti, ${deleted.snapshots} snapshot rimossi.`,
        });
        loadSessions();
      } else {
        setResult({
          success: false,
          message: data.error || 'Errore durante la cancellazione',
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: `Errore: ${error instanceof Error ? error.message : 'Sconosciuto'}`,
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Importa Dati</h2>
        <p className="text-slate-400 text-sm mt-1">
          Scarica i report CSV da Directa e caricali qui sotto
        </p>
      </div>

      {/* Report Instructions */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Report Movimenti */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-blue-900/40 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">Movimenti</h3>
              <p className="text-xs text-slate-500">Conto → Movimenti</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-400">
            <p>
              Ordini di acquisto/vendita, commissioni, dividendi, bolli, ritenute fiscali e conferimenti.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">Movimenti*.csv</span>
              <span className="text-xs bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-400">CSV</span>
            </div>
          </div>
        </div>

        {/* Report Patrimonio */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-900/40 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">Patrimonio Totale</h3>
              <p className="text-xs text-slate-500">Conto → Patrimonio → Rendimento</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-400">
            <p>
              Snapshot giornalieri del valore totale del portafoglio: liquidità, valore portafoglio e patrimonio complessivo.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">PatrimonioTotale*.csv</span>
              <span className="text-xs bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-400">CSV</span>
            </div>
          </div>
        </div>

        {/* Report Portafoglio */}
        <div className="bg-slate-800/60 rounded-xl border border-slate-700 p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-violet-900/40 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">Portafoglio</h3>
              <p className="text-xs text-slate-500">Investimenti</p>
            </div>
          </div>
          <div className="space-y-2 text-sm text-slate-400">
            <p>
              Situazione attuale degli strumenti finanziari in portafoglio: ISIN, ticker, nome, quantità e valore.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">P_TOTALE*.csv</span>
              <span className="text-xs bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-400">CSV</span>
            </div>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Carica file CSV</h3>

        <div className="border-2 border-dashed border-slate-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
          {importing ? (
            <div className="text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mb-3"></div>
              <p>Importazione in corso...</p>
            </div>
          ) : (
            <div>
              <svg className="w-10 h-10 mx-auto mb-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-slate-400 mb-2">
                Trascina il file CSV qui o clicca per selezionarlo
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Report supportati: Movimenti, PatrimonioTotale, P_TOTALE
              </p>
              <label className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer transition-colors text-sm font-medium">
                Seleziona file
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>

        {result && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            result.success
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'
              : 'bg-red-900/50 text-red-400 border border-red-800'
          }`}>
            {result.message}
          </div>
        )}
      </div>

      {/* Clear Database Section */}
      <div className="bg-slate-800 rounded-xl border border-red-900/30 p-6">
        <h3 className="text-lg font-semibold text-white mb-2">Gestione Database</h3>
        <p className="text-sm text-slate-400 mb-4">
          Svuota completamente il database cancellando tutti i dati importati, inclusi asset,
          ordini, movimenti di cassa, snapshot e cronologia import.
        </p>

        {showConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-red-400 font-medium">
              Sei sicuro di voler cancellare tutti i dati? Questa operazione è irreversibile.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleClearDatabase}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white rounded-lg transition-colors text-sm font-medium"
              >
                {clearing ? 'Cancellazione in corso...' : 'Sì, cancella tutto'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={clearing}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm font-medium"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={clearing}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {clearing ? 'Cancellazione in corso...' : 'Svuota database'}
          </button>
        )}
      </div>

      {/* Import Sessions History */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white">Storico Import</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">File</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Data</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Record</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Stato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sessions.map((session) => (
                <tr key={session.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-3 text-sm text-slate-300">{session.filename}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(session.import_date).toLocaleString('it-IT')}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-slate-300">{session.records_imported}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      session.status === 'SUCCESS'
                        ? 'bg-emerald-900/50 text-emerald-400'
                        : 'bg-red-900/50 text-red-400'
                    }`}>
                      {session.status === 'SUCCESS' ? 'Completato' : 'Fallito'}
                    </span>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    Nessuna importazione effettuata
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