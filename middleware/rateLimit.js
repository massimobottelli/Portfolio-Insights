/**
 * Rate limiter nativo in memoria (senza dipendenze esterne).
 *
 * Limita il numero di richieste per IP in una finestra temporale.
 * Usato principalmente su /api/auth/check per proteggere il login da brute-force.
 *
 * Nota: essendo in memoria, il conteggio si azzera al riavvio del server.
 * Per un'app single-user self-hosted è sufficiente.
 */

/**
 * Crea un middleware di rate limiting.
 * @param {Object} options
 * @param {number} options.windowMs - Finestra temporale in millisecondi (default: 60000 = 1 minuto)
 * @param {number} options.max - Numero massimo di richieste per finestra (default: 5)
 * @param {string} options.message - Messaggio di errore quando il limite è superato
 */
export function rateLimit({ windowMs = 60_000, max = 5, message = 'Troppe richieste. Riprova più tardi.' } = {}) {
  const hits = new Map();

  // Pulizia periodica per evitare memory leak (ogni finestra)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start > windowMs) {
        hits.delete(key);
      }
    }
  }, windowMs);

  // Non bloccare il processo se il server si ferma
  cleanupInterval.unref?.();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    const entry = hits.get(ip);
    if (!entry || now - entry.start > windowMs) {
      // Nuova finestra
      hits.set(ip, { start: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.start + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message });
    }

    next();
  };
}