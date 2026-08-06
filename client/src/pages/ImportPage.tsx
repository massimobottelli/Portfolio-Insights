import { useEffect, useState, useRef } from 'react';
import type { ImportSession, ImportResponse } from '../types';

export default function ImportPage() {
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = () => {
    fetch('/api/import/sessions')
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

      const response = await fetch('/api/import', {
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Importa Dati</h2>
        <p className="text-slate-400 text-sm mt-1">
          Carica i report CSV esportati da Directa
        </p>
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
              <p className="text-slate-400 mb-2">
                Trascina il file CSV qui o clicca per selezionarlo
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Report supportati: Movimenti (Order History), Patrimonio Totale (Portfolio Value History)
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