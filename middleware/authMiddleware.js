import { isTokenValid } from '../config/auth.js';

/**
 * Middleware di autenticazione per le API.
 *
 * Verifica la presenza dell'header `Authorization: Bearer <token>`.
 * Se il token è valido, prosegue con la richiesta.
 * Altrimenti restituisce 401.
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const token = authHeader.slice(7).trim();
  if (!isTokenValid(token)) {
    return res.status(401).json({ error: 'Token non valido' });
  }

  next();
}