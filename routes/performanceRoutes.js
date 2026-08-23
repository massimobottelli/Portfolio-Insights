/**
 * Performance & Risk — Phase 5/6 Routes
 *
 * Individual debugging endpoints for volatility and Sharpe ratio.
 * These are consolidated into a single aggregated endpoint in Phase 8.
 */

import { Router } from 'express';
import { getVolatility, getSharpe, getPerformanceAnalytics } from '../controllers/performanceController.js';

const router = Router();

// Individual debugging endpoints (Phases 5/6)
router.get('/volatility', getVolatility);
router.get('/sharpe', getSharpe);

// Consolidated aggregated endpoint (Phase 8)
router.get('/performance', getPerformanceAnalytics);

export default router;
