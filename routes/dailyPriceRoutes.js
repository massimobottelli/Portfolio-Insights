import { Router } from 'express';
import {
  getAssetDailyPricesHandler,
  updateDailyPricesHandler,
} from '../controllers/dailyPriceController.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Ogni chiamata consuma quota API EODHD (una richiesta esterna per asset):
// limiter moderato per evitare invocazioni ripetute accidentali.
const updateLimiter = rateLimit({
  windowMs: 60_000,
  max: 6,
  message: "Troppe chiamate all'aggiornamento prezzi. Riprova tra un minuto.",
});

// POST /api/prices/update — aggiornamento incrementale prezzi di chiusura
router.post('/update', updateLimiter, updateDailyPricesHandler);

// GET /api/prices/asset/:assetId — lettura storico prezzi di chiusura di un asset.
// Sola lettura dal DB locale, nessuna chiamata esterna: senza rate limit.
router.get('/asset/:assetId', getAssetDailyPricesHandler);

export default router;
