export default function Settings() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-paper" style={{ fontFamily: 'var(--font-display)' }}>Impostazioni</h2>
        <p className="text-muted text-sm mt-1">
          Configurazione dell'applicazione
        </p>
      </div>

      <div className="bg-ink-800 rounded-xl border border-ink-600 p-6">
        <h3 className="text-lg font-semibold text-paper mb-4">Informazioni</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-ink-600">
            <span className="text-muted">Versione</span>
            <span className="text-paper font-medium">MVP1 v1.0.0</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-ink-600">
            <span className="text-muted">Backend</span>
            <span className="text-paper font-medium">Node.js + Express + SQLite</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-ink-600">
            <span className="text-muted">Frontend</span>
            <span className="text-paper font-medium">React + TypeScript + Tailwind</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted">Broker</span>
            <span className="text-paper font-medium">Directa</span>
          </div>
        </div>
      </div>

      <div className="bg-ink-800 rounded-xl border border-ink-600 p-6">
        <h3 className="text-lg font-semibold text-paper mb-4">Database</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-ink-600">
            <span className="text-muted">Tipo</span>
            <span className="text-paper font-medium">SQLite (nativo)</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-muted">Posizione</span>
            <span className="text-paper font-mono text-sm">db/portfolio.db</span>
          </div>
        </div>
      </div>
    </div>
  );
}