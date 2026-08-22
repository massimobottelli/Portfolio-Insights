import { Router } from 'express';
import { importFile, listSessions, clearAllData } from '../controllers/importController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Rate limit sull'import: elaborazione pesante (parsing + transazioni DB),
// non ha senso permettere raffiche di richieste.
const importLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  message: 'Troppe importazioni. Riprova tra un minuto.',
});

// Rate limit più severo sull'operazione distruttiva di cancellazione totale.
const clearLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: 'Troppe richieste di cancellazione. Riprova tra un minuto.',
});

// POST /api/import — Importa un file CSV Directa
router.post('/', importLimiter, importFile);

// GET /api/import/sessions — Storico delle sessioni di import
router.get('/sessions', listSessions);

// DELETE /api/import/clear — Svuota completamente il database
router.delete('/clear', clearLimiter, clearAllData);

export default router;