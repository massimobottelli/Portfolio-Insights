import { Router } from 'express';
import { getApiToken, isTokenValid } from '../config/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Rate limit sul check del token per proteggere da brute-force (5 tentativi/minuto)
const authCheckLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  message: 'Troppi tentativi di accesso. Riprova tra un minuto.',
});

// GET /api/auth/check — Verifica se il token fornito è valido
// Questo endpoint NON è protetto dal middleware di autenticazione
// perché è il punto di ingresso per il login.
router.get('/check', authCheckLimiter, (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false, error: 'Autenticazione richiesta' });
  }

  const token = authHeader.slice(7).trim();
  if (!isTokenValid(token)) {
    return res.status(401).json({ valid: false, error: 'Token non valido' });
  }

  res.json({ valid: true });
});

// GET /api/auth/demo-token — Endpoint SOLO per la demo: restituisce il token API corrente.
// NON proteggere questo endpoint perché serve per facilitare il login in demo.
// In produzione questo endpoint DEVE essere rimosso o disabilitato.
router.get('/demo-token', (_req, res) => {
  const token = getApiToken();
  res.json({ token });
});

export default router;