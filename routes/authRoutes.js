import { Router } from 'express';
import { isTokenValid } from '../config/auth.js';
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

export default router;