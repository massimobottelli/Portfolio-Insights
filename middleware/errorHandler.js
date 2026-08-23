/**
 * Middleware centralizzato di gestione errori per Express.
 *
 * Obiettivi:
 * - NON esporre mai dettagli interni (stack trace, messaggi DB) al client.
 * - Loggare l'errore completo lato server per il debugging.
 * - Restituire sempre JSON coerente con il resto dell'API.
 *
 * Deve essere registrato DOPO tutte le rotte in app.js.
 */

/**
 * Handler 404 per le rotte API non trovate.
 * Da montare dopo le rotte API: evita che una richiesta /api/inesistente
 * cada nel fallback SPA restituendo HTML.
 */
export function apiNotFound(req, res, next) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint non trovato' });
  }
  next();
}

/**
 * Error handler finale (signature a 4 argomenti richiesta da Express).
 * Cattura tutti gli errori non gestiti dai controller e restituisce
 * un messaggio generico senza dettagli interni.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Log completo solo lato server (mai inviato al client)
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);

  // Se le header sono già state inviate, delega al default di Express
  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    error: 'Errore interno del server'
  });
}

/**
 * Middleware di security header minimi (equivalente leggero di helmet,
 * senza dipendenze esterne — app single-user self-hosted).
 */
export function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}