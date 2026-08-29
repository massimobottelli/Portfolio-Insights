import { Router } from 'express';
import { getDashboard, getPortfolio, getAllocation, getHistory, getTWR, getAssetDetailHandler, getRates, getAllAssetTypeIRRs, getAllAssetIRRsBatch } from '../controllers/analyticsController.js';

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

// GET /api/analytics/asset-type/irr — IRR money-weighted aggregato per categoria di attività
router.get('/asset-type/irr', getAllAssetTypeIRRs);

// POST /api/analytics/assets/irr/batch — IRR per array di asset IDs
router.post('/assets/irr/batch', getAllAssetIRRsBatch);

export default router;
