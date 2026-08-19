/**
 * Performance & Risk — Phase 5/6 Routes
 *
 * Individual debugging endpoints for volatility and Sharpe ratio.
 * These are consolidated into a single aggregated endpoint in Phase 8.
 */

import { Router } from 'express';
import { getVolatility, getSharpe } from '../controllers/performanceController.js';

const router = Router();

router.get('/volatility', getVolatility);
router.get('/sharpe', getSharpe);

export default router;