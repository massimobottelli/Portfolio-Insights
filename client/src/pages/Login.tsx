import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, KeyRound } from 'lucide-react';
import { setToken, checkToken } from '../lib/api';

export default function Login() {
  const navigate = useNavigate();
  const [token, setTokenInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-ink-800 rounded-xl border border-ink-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_24px_rgba(0,0,0,0.3)] p-8">
          {/* Logo — cerchio oro */}
          <div className="flex items-center justify-center mb-6">
            <div className="w-14 h-14 rounded-full bg-gold-500/20 border-gold-400/40 flex items-center justify-center shadow-[inset_0_0_0_1px_rgba(212,162,74,0.3)]">
              <Lock size={28} className="text-gold-400" />
            </div>
          </div>
          <h1
            className="text-2xl font-bold text-center mb-2 text-paper"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            <span className="text-paper">Portfolio</span>
            <span className="text-gold-400">|</span>
            <span className="text-paper">Insights</span>
          </h1>
          <p className="text-muted text-sm text-center mb-8">
            Inserisci il token di accesso per continuare
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5">
                Token di accesso
              </label>
              <div className="relative">
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="password"
                  value={token}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="Inserisci il token..."
                  autoFocus
                  className="w-full bg-white border border-ink-600 rounded-lg pl-10 pr-3 py-2.5 text-sm text-ink-900 placeholder-muted focus:outline-none focus:ring-2 focus:ring-gold-400/50 focus:border-transparent transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="bg-bear/10 border border-bear/30 rounded-lg p-3 text-bear text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-gold-500/80 hover:bg-gold-400 disabled:bg-ink-700 text-paper rounded-lg transition-colors text-sm font-medium"
            >
              {loading ? 'Verifica in corso...' : 'Accedi'}
            </button>
          </form>

          <p className="text-xs text-muted text-center mt-6">
            Il token viene generato all'avvio del server e stampato nella console.
          </p>
        </div>
      </div>
    </div>
  );
}