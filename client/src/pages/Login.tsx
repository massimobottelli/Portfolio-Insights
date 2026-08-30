import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, KeyRound, Loader2 } from 'lucide-react';
import { setToken, checkToken, fetchDemoToken } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Inserisci il token di accesso');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const valid = await checkToken(token.trim());
      if (valid) {
        setToken(token.trim());
        navigate('/dashboard', { replace: true });
      } else {
        setError('Token non valido. Controlla il token e riprova.');
      }
    } catch {
      setError('Errore di connessione. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  // All'avvio, tenta di recuperare il token dal server (solo demo).
  // Se l'endpoint /api/auth/demo-token non esiste, fallisce silenziosamente.
  useEffect(() => {
    let cancelled = false;

    fetchDemoToken().then((autoToken) => {
      if (cancelled) return;
      if (autoToken) {
        setTokenInput(autoToken);
      }
      setAutoLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8">
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
              <Lock size={28} className="text-blue-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">
            <span className="text-blue-400">Portfolio</span>
            <span className="text-green-400">Insights</span>
          </h1>
          <p className="text-slate-400 text-sm text-center mb-8">
            Inserisci il token di accesso per continuare
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Token di accesso
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  value={token}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder={autoLoading ? 'Caricamento token...' : "Inserisci il token..."}
                  autoFocus
                  className="w-full bg-slate-700/50 border border-slate-600 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                />
                {autoLoading && (
                  <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 animate-spin" />
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors text-sm font-medium"
            >
              {loading ? 'Verifica in corso...' : 'Accedi'}
            </button>
          </form>

          <p className="text-xs text-slate-500 text-center mt-6">
            {autoLoading
              ? 'Recupero automatico del token in corso...'
              : 'Modalità demo: il token viene generato e compilato automaticamente.'
            }
          </p>
        </div>
      </div>
    </div>
  );
}