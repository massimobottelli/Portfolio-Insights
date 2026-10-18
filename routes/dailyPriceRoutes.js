import { Router } from 'express';
import {
  getAssetDailyPricesHandler,
  refreshAssetPricesHandler,
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

// Limiter dedicato al refresh per-asset: la chiamata parte automaticamente
// alla visita di una pagina asset con quotazioni non aggiornate, quindi può
// ripetersi spesso durante la navigazione. Soglia più alta dell'aggiornamento
// globale (che scarica una richiesta per OGNI asset in un colpo solo).
const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  message: 'Troppe richieste di aggiornamento prezzi. Riprova tra un minuto.',
});

// POST /api/prices/update — aggiornamento incrementale prezzi di chiusura
router.post('/update', updateLimiter, updateDailyPricesHandler);

// GET /api/prices/asset/:assetId — lettura storico prezzi di chiusura di un asset.
// Sola lettura dal DB locale, nessuna chiamata esterna: senza rate limit.
router.get('/asset/:assetId', getAssetDailyPricesHandler);

// POST /api/prices/asset/:assetId/refresh — aggiornamento incrementale on-demand
// di un singolo asset (consuma una quota EODHD: limiter dedicato).
router.post('/asset/:assetId/refresh', refreshLimiter, refreshAssetPricesHandler);

export default router;
