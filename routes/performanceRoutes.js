/**
 * Performance & Risk — Phase 5/6 Routes
 *
 * Individual debugging endpoints for volatility and Sharpe ratio.
 * These are consolidated into a single aggregated endpoint in Phase 8.
 */

import { Router } from 'express';
import {
  getVolatility,
  getSharpe,
  getPerformanceAnalytics,
  getRiskFreeRate,
  updateRiskFreeRate,
} from '../controllers/performanceController.js';

const router = Router();

// Individual debugging endpoints (Phases 5/6)
router.get('/volatility', getVolatility);
router.get('/sharpe', getSharpe);

// Consolidated aggregated endpoint (Phase 8)
router.get('/performance', getPerformanceAnalytics);

// Configurazione del tasso risk-free: default da RISK_FREE_RATE (.env),
// scelta utente persistita in db/.risk-free-rate (volume Docker).
router.get('/risk-free-rate', getRiskFreeRate);
router.put('/risk-free-rate', updateRiskFreeRate);

export default router;
