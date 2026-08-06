import {
  calculateCashBalance,
  calculateInvestedCapital,
  calculatePositions,
  calculateAllocation,
  getLatestSnapshot,
  getLatestPriceDate
} from '../models/analyticsModel.js';

/**
 * GET /api/analytics/dashboard
 * Restituisce i KPI principali per la Dashboard.
 */
export function getDashboard(req, res) {
  try {
    const latestSnapshot = getLatestSnapshot();
    const cashBalance = calculateCashBalance();
    const investedCapital = calculateInvestedCapital();
    const positions = calculatePositions();

    // Calcolo del valore totale del portafoglio
    // Se disponibile, usa l'ultimo snapshot; altrimenti calcola dalla liquidità
    const portfolioValue = latestSnapshot
      ? latestSnapshot.portfolio_value
      : cashBalance;

    // Profit/Loss assoluto = valore portafoglio - capitale investito
    const totalProfitLoss = portfolioValue - investedCapital;
    const totalProfitLossPercent = investedCapital > 0
      ? parseFloat(((totalProfitLoss / investedCapital) * 100).toFixed(2))
      : 0;

    res.json({
      portfolioValue: parseFloat(portfolioValue.toFixed(2)),
      investedCapital: parseFloat(investedCapital.toFixed(2)),
      availableCash: parseFloat(cashBalance.toFixed(2)),
      totalProfitLoss: parseFloat(totalProfitLoss.toFixed(2)),
      totalProfitLossPercent,
      totalPositions: positions.length,
      snapshotDate: latestSnapshot ? latestSnapshot.snapshot_date : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo dei KPI', details: error.message });
  }
}

/**
 * GET /api/analytics/portfolio
 * Restituisce la lista delle posizioni attive nel portafoglio,
 * con prezzo corrente, prezzo medio di carico e data di aggiornamento.
 */
export function getPortfolio(req, res) {
  try {
    const positions = calculatePositions();
    const priceDate = getLatestPriceDate();
    res.json({ positions, priceDate });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero del portafoglio', details: error.message });
  }
}

/**
 * GET /api/analytics/allocation
 * Restituisce l'allocazione percentuale del portafoglio.
 */
export function getAllocation(req, res) {
  try {
    const allocation = calculateAllocation();
    res.json(allocation);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo dell\'allocazione', details: error.message });
  }
}