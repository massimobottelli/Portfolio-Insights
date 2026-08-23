import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary globale: cattura errori di rendering non gestiti nei componenti
 * figli e mostra una UI di fallback invece di schermata bianca.
 * React non propaga gli errori di render al window.onerror: senza boundary
 * un'eccezione in un componente smonta l'intero albero.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log lato client per il debugging (l'app è self-hosted)
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
          <div className="bg-slate-800 rounded-xl border border-red-800/50 p-8 max-w-md text-center">
            <h1 className="text-xl font-bold text-red-400 mb-2">Si è verificato un errore</h1>
            <p className="text-slate-400 text-sm mb-4">
              Un errore imprevisto ha interrotto il rendering della pagina.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Riprova
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Ricarica
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}