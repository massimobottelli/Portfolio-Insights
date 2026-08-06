export default function Settings() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-white">Impostazioni</h2>
        <p className="text-slate-400 text-sm mt-1">
          Configurazione dell'applicazione
        </p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Informazioni</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <span className="text-slate-400">Versione</span>
            <span className="text-white font-medium">MVP1 v1.0.0</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <span className="text-slate-400">Backend</span>
            <span className="text-white font-medium">Node.js + Express + SQLite</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <span className="text-slate-400">Frontend</span>
            <span className="text-white font-medium">React + TypeScript + Tailwind</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-slate-400">Broker</span>
            <span className="text-white font-medium">Directa</span>
          </div>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Database</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-slate-700">
            <span className="text-slate-400">Tipo</span>
            <span className="text-white font-medium">SQLite (nativo)</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-slate-400">Posizione</span>
            <span className="text-white font-mono text-sm">db/portfolio.db</span>
          </div>
        </div>
      </div>
    </div>
  );
}