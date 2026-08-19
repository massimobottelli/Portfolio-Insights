/**
 * Performance & Risk — Phase 5/6 Controller
 *
 * Endpoints for volatility and Sharpe ratio (debugging endpoints during development).
 * These are consolidated into a single aggregated endpoint in Phase 8.
 */

import { buildReturnSeries, calculateVolatility, calculateSharpe } from '../models/performanceModel.js';

/**
 * GET /api/analytics/volatility
 * Query params: from (optional), to (optional)
 *
 * Returns daily and annualized volatility from the canonical return series.
 */
export function getVolatility(req, res) {
  try {
    const { from, to } = req.query;
    const series = buildReturnSeries({ from: from || undefined, to: to || undefined });
    const volatility = calculateVolatility(series);

    if (series.length === 0) {
      return res.json({ daily: null, annualized: null, dataPoints: 0 });
    }

    res.json({
      ...volatility,
      dataPoints: series.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo della volatilità', details: error.message });
  }
}

/**
 * GET /api/analytics/sharpe
 * Query params: from (optional), to (optional), riskFreeRate (default: 0)
 *
 * Returns the Sharpe ratio for a given annual risk-free rate.
 * The risk-free rate is validated and must be numeric within -100% to +100%.
 */
export function getSharpe(req, res) {
  try {
    const { from, to, riskFreeRate } = req.query;

    // Validate riskFreeRate: must be numeric, range -100 < rate < 100
    const rf = riskFreeRate !== undefined ? parseFloat(riskFreeRate) : 0;
    if (isNaN(rf) || rf <= -100 || rf >= 100) {
      return res.status(400).json({ error: 'Invalid risk-free rate' });
    }

    const series = buildReturnSeries({ from: from || undefined, to: to || undefined });
    const sharpe = calculateSharpe(series, rf);

    if (series.length === 0) {
      return res.json({ sharpeRatio: null, dataPoints: 0, riskFreeRate: rf });
    }

    res.json({
      sharpeRatio: sharpe,
      dataPoints: series.length,
      riskFreeRate: rf,
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo dello Sharpe ratio', details: error.message });
  }
}