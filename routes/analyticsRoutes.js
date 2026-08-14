import { Router } from 'express';
import { getDashboard, getPortfolio, getAllocation, getHistory, getTWR, getAssetDetailHandler, getRates } from '../controllers/analyticsController.js';

const router = Router();

// GET /api/analytics/dashboard — KPI principali per la Dashboard
router.get('/dashboard', getDashboard);

// GET /api/analytics/portfolio — Lista delle posizioni attive
router.get('/portfolio', getPortfolio);

// GET /api/analytics/allocation — Allocazione percentuale del portafoglio
router.get('/allocation', getAllocation);

// GET /api/analytics/history — Storico valore portafoglio (snapshot giornalieri)
router.get('/history', getHistory);

// GET /api/analytics/twr — Time-Weighted Rate of Return
router.get('/twr', getTWR);

// GET /api/analytics/rates — Tassi di cambio odierni (ECB) per conversione EUR
router.get('/rates', getRates);

// GET /api/analytics/asset/:id — Dettaglio completo di un singolo asset
router.get('/asset/:id', getAssetDetailHandler);

export default router;
