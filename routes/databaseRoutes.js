import { Router } from 'express';
import { clearAllData, exportDatabaseHandler, restoreDatabaseHandler } from '../controllers/databaseController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Rate limit più severo sulle operazioni distruttive.
const clearLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: 'Troppe richieste di cancellazione. Riprova tra un minuto.',
});

const restoreLimiter = rateLimit({
  windowMs: 60_000,
  max: 3,
  message: 'Troppi ripristini. Riprova tra un minuto.',
});

// DELETE /api/database/clear — Svuota completamente il database
router.delete('/clear', clearLimiter, clearAllData);

// GET /api/database/export — Esporta il database completo come JSON
router.get('/export', exportDatabaseHandler);

// POST /api/database/restore — Ripristina il database da un file JSON di backup
router.post('/restore', restoreLimiter, restoreDatabaseHandler);

export default router;
