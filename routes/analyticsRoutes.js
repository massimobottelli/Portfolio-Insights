import { Router } from 'express';
import { getDashboard, getPortfolio, getAllocation } from '../controllers/analyticsController.js';

const router = Router();

// GET /api/analytics/dashboard — KPI principali per la Dashboard
router.get('/dashboard', getDashboard);

// GET /api/analytics/portfolio — Lista delle posizioni attive
router.get('/portfolio', getPortfolio);

// GET /api/analytics/allocation — Allocazione percentuale del portafoglio
router.get('/allocation', getAllocation);

export default router;