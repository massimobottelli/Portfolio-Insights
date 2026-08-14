/**
 * Helper centralizzato per le chiamate API.
 *
 * Gestisce automaticamente:
 * - Aggiunta dell'header Authorization: Bearer <token>
 * - Salvataggio/rimozione del token in localStorage
 * - Redirect a /login quando si riceve 401
 */

const TOKEN_KEY = 'apiToken';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/**
 * Esegue una fetch con autenticazione automatica.
 * Se la risposta è 401, rimuove il token e reindirizza a /login.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    // Reindirizza a /login solo se non ci siamo già
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return response;
}

/**
 * Verifica se il token salvato è ancora valido.
 * Usato all'avvio dell'app per decidere se mostrare il login o la dashboard.
 */
export async function checkToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/check', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}