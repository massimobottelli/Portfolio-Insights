import { useEffect, useState, useRef, useCallback } from 'react';
import type { ImportSession, ImportResponse } from '../types';
import { apiFetch } from '../lib/api';

// Tipi di report supportati
type ReportType = 'movimenti' | 'patrimonio' | 'portafoglio';

interface UploadState {
  file: File | null;
  loading: boolean;
  error: string | null;
  success: boolean;
}

interface ReportBoxState {
  movimenti: UploadState;
  patrimonio: UploadState;
  portafoglio: UploadState;
}

/**
 * Rileva il tipo di report Directa analizzando le prime righe del CSV.
 * @param csvText - Contenuto testuale del file CSV
 * @returns Il tipo di report rilevato, o null se non riconosciuto
 */
function detectReportType(csvText: string): ReportType | null {
  const lines = csvText.split(/\r?\n/);
  const firstLines = lines.slice(0, 10);
  const allText = firstLines.join('\n');

  // Marker per report Movimenti: "Tutti i movimenti ordinati per Data Operazione"
  if (allText.includes('Tutti i movimenti ordinati per Data Operazione')) {
    return 'movimenti';
  }

  // Marker per report Patrimonio: "PATRIMONIO" nella riga 6 (index 5)
  if (lines.length > 5 && lines[5].includes('PATRIMONIO')) {
    return 'patrimonio';
  }

  // Marker per report Portafoglio: "Strumento;Ticker;Isin" nell'header
  if (allText.includes('Strumento') && allText.includes('Ticker') && allText.includes('Isin')) {
    return 'portafoglio';
  }

  return null;
}

export default function ImportPage() {
  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [uploadStates, setUploadStates] = useState<ReportBoxState>({
    movimenti: { file: null, loading: false, error: null, success: false },
    patrimonio: { file: null, loading: false, error: null, success: false },
    portafoglio: { file: null, loading: false, error: null, success: false },
  });
  const movimentiInputRef = useRef<HTMLInputElement>(null);
  const patrimonioInputRef = useRef<HTMLInputElement>(null);
  const portafoglioInputRef = useRef<HTMLInputElement>(null);

  const loadSessions = () => {
    apiFetch('/api/import/sessions')
      .then(r => r.json())
      .then(data => setSessions(data))
      .catch(console.error);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  /**
   * Calcola il numero di report caricati con successo.
   */
  const loadedCount = Object.values(uploadStates).filter(s => s.success).length;

  /**
   * Carica un file CSV nel box corrispondente dopo averne validato il tipo.
   */
  const handleFileUpload = useCallback(async (
    type: ReportType,
    file: File
  ) => {
    // Reset dello stato per questo box
    setUploadStates(prev => ({
      ...prev,
      [type]: { ...prev[type], error: null, success: false },
    }));

    try {
      const fileContent = await file.text();

      // Rileva il tipo di report dal contenuto del file
      const detectedType = detectReportType(fileContent);

      // Nomi dei report per i messaggi
      const reportNames: Record<ReportType, string> = {
        movimenti: 'Movimenti',
        patrimonio: 'Patrimonio Totale',
        portafoglio: 'Portafoglio Corrente',
      };

      if (detectedType !== type) {
        // detectedType può essere null (file non riconosciuto): il fallback
        // precedente mostrava "Movimenti" anche quando nulla era stato rilevato.
        const detectedLabel = detectedType ? reportNames[detectedType] : 'non riconosciuto';
        throw new Error(
          `Tipo di file non valido: rilevato ${detectedLabel}, ma era atteso ${reportNames[type]}.`
        );
      }

      // Invia al backend per l'importazione
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
        setUploadStates(prev => ({
          ...prev,
          [type]: {
            file,
            loading: false,
            error: null,
            success: true,
          },
        }));
        setResult({
          success: true,
          message: `${reportNames[type]} caricato: ${data.recordsImported} record su ${data.totalRecords} importati`,
        });
        loadSessions();
      } else {
        // Il backend restituisce 400 con { error, details } per CSV malformati,
        // oppure un array di errori per-record su import parzialmente fallito.
        if (!response.ok && data.error) {
          throw new Error(`${data.error}${data.details ? `: ${data.details}` : ''}`);
        }
        const backendErrors = Array.isArray(data.errors) ? ` (${data.errors.length} errori)` : '';
        throw new Error(`Importazione fallita${backendErrors}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sconosciuto';
      setUploadStates(prev => ({
        ...prev,
        [type]: {
          file: null,
          loading: false,
          error: errorMessage,
          success: false,
        },
      }));
      setResult({
        success: false,
        message: errorMessage,
      });
    }
  }, []);

  /**
   * Gestisce la selezione di un file in un box specifico.
   */
  const handleFileSelect = useCallback((
    type: ReportType,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStates(prev => ({
      ...prev,
      [type]: { ...prev[type], loading: true },
    }));

    // Piccolo delay per permettere l'aggiornamento UI
    requestAnimationFrame(() => {
      handleFileUpload(type, file);
    });

    // Reset dell'input per permettere la stessa selezione nuovamente
    if (e.target) {
      e.target.value = '';
    }
  }, [handleFileUpload]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Importa Dati</h2>
        <p className="text-slate-400 text-sm mt-1">
          Scarica i report CSV da Directa e caricali nei box corrispondenti
        </p>
      </div>

      {/* Progress Bar */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-300">Progresso importazione</span>
          <span className={`text-sm font-bold ${
            loadedCount === 3
              ? 'text-emerald-400'
              : loadedCount > 0
                ? 'text-blue-400'
                : 'text-slate-500'
          }`}>
            {loadedCount} di 3 report caricati
          </span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              loadedCount === 3
                ? 'bg-emerald-500'
                : loadedCount === 2
                  ? 'bg-blue-500'
                  : loadedCount === 1
                    ? 'bg-blue-600'
                    : 'bg-slate-600'
            }`}
            style={{ width: `${(loadedCount / 3) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>Movimenti</span>
          <span>Portafoglio</span>
          <span>Patrimonio</span>
        </div>
      </div>

      {/* Result Message */}
      {result && (
        <div className={`p-4 rounded-xl border text-sm ${
          result.success
            ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50'
            : 'bg-red-900/30 text-red-400 border-red-800/50'
        }`}>
          <div className="flex items-center gap-2">
            {result.success ? (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {result.message}
          </div>
        </div>
      )}

      {/* Three Upload Boxes */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Box Movimenti */}
        <ReportUploadBox
          title="Movimenti"
          subtitle="Conto → Movimenti"
          description="Ordini di acquisto/vendita, commissioni, dividendi, bolli, ritenute fiscali e conferimenti."
          fileName="Movimenti*.csv"
          icon={
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="blue"
          state={uploadStates.movimenti}
          inputRef={movimentiInputRef}
          boxType="movimenti"
          setUploadStates={setUploadStates}
          onFileSelect={(e) => handleFileSelect('movimenti', e)}
          onFileDrop={(e: React.DragEvent) => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
              handleFileUpload('movimenti', file);
            }
          }}
        />

        {/* Box Portafoglio */}
        <ReportUploadBox
          title="Portafoglio"
          subtitle="Investimenti → Portfolio"
          description="Situazione attuale degli strumenti finanziari in portafoglio: ISIN, ticker, nome, quantità e valore."
          fileName="P_TOTALE*.csv"
          icon={
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
            </svg>
          }
          color="emerald"
          state={uploadStates.portafoglio}
          inputRef={portafoglioInputRef}
          boxType="portafoglio"
          setUploadStates={setUploadStates}
          onFileSelect={(e) => handleFileSelect('portafoglio', e)}
          onFileDrop={(e: React.DragEvent) => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
              handleFileUpload('portafoglio', file);
            }
          }}
        />

        {/* Box Patrimonio Totale */}
        <ReportUploadBox
          title="Patrimonio Totale"
          subtitle="Conto → Patrimonio → Rendimento"
          description="Snapshot giornalieri del valore totale del portafoglio: liquidità, valore portafoglio e patrimonio complessivo."
          fileName="PatrimonioTotale*.csv"
          icon={
            <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          }
          color="violet"
          state={uploadStates.patrimonio}
          inputRef={patrimonioInputRef}
          boxType="patrimonio"
          setUploadStates={setUploadStates}
          onFileSelect={(e) => handleFileSelect('patrimonio', e)}
          onFileDrop={(e: React.DragEvent) => {
            const file = e.dataTransfer.files?.[0];
            if (file) {
              handleFileUpload('patrimonio', file);
            }
          }}
        />
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

      {/* Clear Database Section */}
      <div className="bg-slate-800 rounded-xl border border-red-900/30 p-6 mt-8">
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
                onClick={async () => {
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
                }}
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
    </div>
  );
}

/**
 * Componente riutilizzabile per il box di upload di un singolo report.
 */
function ReportUploadBox({
  title,
  subtitle,
  description,
  fileName,
  icon,
  color,
  state,
  inputRef,
  onFileSelect,
  onFileDrop,
  boxType,
  setUploadStates,
}: {
  title: string;
  subtitle: string;
  description: string;
  fileName: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'violet';
  state: UploadState;
  inputRef: React.RefObject<HTMLInputElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFileDrop: (e: React.DragEvent) => void;
  boxType: ReportType;
  setUploadStates: React.Dispatch<React.SetStateAction<ReportBoxState>>;
}) {
  // Colori in base al tipo di report
  const colors = {
    blue: {
      bg: 'bg-blue-900/40',
      text: 'text-blue-400',
      border: state.success
        ? 'border-emerald-500'
        : state.error
          ? 'border-red-500'
          : 'border-slate-700',
      hoverBorder: 'hover:border-blue-500',
      button: 'bg-blue-600 hover:bg-blue-700',
      checkBg: 'bg-emerald-900/60',
      checkIcon: 'text-emerald-400',
    },
    emerald: {
      bg: 'bg-emerald-900/40',
      text: 'text-emerald-400',
      border: state.success
        ? 'border-emerald-500'
        : state.error
          ? 'border-red-500'
          : 'border-slate-700',
      hoverBorder: 'hover:border-emerald-500',
      button: 'bg-emerald-600 hover:bg-emerald-700',
      checkBg: 'bg-emerald-900/60',
      checkIcon: 'text-emerald-400',
    },
    violet: {
      bg: 'bg-violet-900/40',
      text: 'text-violet-400',
      border: state.success
        ? 'border-emerald-500'
        : state.error
          ? 'border-red-500'
          : 'border-slate-700',
      hoverBorder: 'hover:border-violet-500',
      button: 'bg-violet-600 hover:bg-violet-700',
      checkBg: 'bg-emerald-900/60',
      checkIcon: 'text-emerald-400',
    },
  };

  const c = colors[color];

  return (
    <div className={`bg-slate-800/60 rounded-xl border-2 ${c.border} p-5 transition-all duration-300 ${state.loading ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`shrink-0 w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white truncate">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {/* Check mark when successful */}
        {state.success && (
          <div className={`shrink-0 w-7 h-7 rounded-full ${c.checkBg} flex items-center justify-center`}>
            <svg className={`w-4 h-4 ${c.checkIcon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-slate-400 mb-3">{description}</p>

      {/* File name badge */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-mono bg-slate-700/50 px-2 py-0.5 rounded text-slate-300">{fileName}</span>
        <span className="text-xs bg-slate-700/50 px-1.5 py-0.5 rounded text-slate-400">CSV</span>
      </div>

      {/* Upload Area or Success State */}
      {state.loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
          <span>Elaborazione in corso...</span>
        </div>
      ) : state.success && state.file ? (
        <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-900/20 rounded-lg p-3 border border-emerald-800/30">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="truncate font-medium">{state.file.name}</span>
        </div>
      ) : state.error && !state.file ? (
        /* Error state with retry - show both error and upload zone */
        <>
          <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 rounded-lg p-3 border border-red-800/30 mb-3">
            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate flex-1">{state.error}</span>
          </div>
          {/* Upload zone for retry */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setUploadStates(prev => ({
                ...prev,
                [boxType]: { ...prev[boxType], error: null },
              }));
              onFileDrop(e);
            }}
            onClick={() => {
              if (inputRef.current) {
                inputRef.current.click();
              }
            }}
            className={`border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer transition-all ${c.hoverBorder} hover:bg-slate-700/20`}
          >
            <svg className="w-6 h-6 mx-auto mb-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-xs text-slate-400 mb-3">Trascina il file qui o clicca</p>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={onFileSelect}
              ref={inputRef}
              className="hidden"
            />
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (inputRef.current) {
                  inputRef.current.click();
                }
              }}
              className={`inline-block px-4 py-2 ${c.button} text-white rounded-md cursor-pointer transition-colors text-sm font-medium`}
            >
              Riprova
            </span>
          </div>
        </>
      ) : (
        /* Upload zone - clickable area */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFileDrop(e);
          }}
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.click();
            }
          }}
          className={`border-2 border-dashed border-slate-600 rounded-lg p-4 text-center cursor-pointer transition-all ${c.hoverBorder} hover:bg-slate-700/20`}
        >
          <svg className="w-6 h-6 mx-auto mb-2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-slate-400 mb-3">Trascina il file qui o clicca</p>
          {/* Hidden file input */}
          <input
            type="file"
            accept=".csv,.txt"
            onChange={onFileSelect}
            ref={inputRef}
            className="hidden"
          />
          {/* Button styled as trigger */}
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (inputRef.current) {
                inputRef.current.click();
              }
            }}
            className={`inline-block px-4 py-2 ${c.button} text-white rounded-md cursor-pointer transition-colors text-sm font-medium`}
          >
            Seleziona file
          </span>
        </div>
      )}
    </div>
  );
}

