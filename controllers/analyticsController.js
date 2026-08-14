import {
  calculateCashBalance,
  calculateInvestedCapital,
  calculatePositions,
  calculateAllocation,
  getLatestSnapshot,
  getLatestPriceDate,
  getSnapshotHistory,
  getDepositHistory,
  calculateTWR,
  getAssetDetail
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
    const allocation = calculateAllocation();

    // Calcolo del valore totale del portafoglio.
    // Per coerenza con Portfolio (totale asset class) e Allocation (totale investito),
    // usa la stessa base di calcolo: somma delle posizioni con correzione BTP (quantità / 100)
    // più la liquidità disponibile (available_cash).
    // In precedenza si usava lo snapshot Directa (portfolio_value), che poteva divergere
    // perché Directa valuta le posizioni con prezzi propri e include la liquidità.
    const positionsValue = allocation.reduce((sum, p) => sum + p.marketValue, 0);
    const portfolioValue = positionsValue + cashBalance;

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
    const availableCash = calculateCashBalance();
    res.json({ positions, priceDate, availableCash });
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

/**
 * GET /api/analytics/history
 * Restituisce la serie storica degli snapshot giornalieri del portafoglio.
 */
export function getHistory(req, res) {
  try {
    const history = getSnapshotHistory();
    const deposits = getDepositHistory();

    // Crea una mappa { snapshot_date => cumulative_deposits } per merge veloce
    const depositMap = {};
    for (const d of deposits) {
      depositMap[d.snapshot_date] = d.cumulative_deposits;
    }

    // Espone i campi rilevanti per il grafico, arrotondando i valori monetari a 2 decimali
    res.json(history.map(s => ({
      snapshot_date: s.snapshot_date,
      portfolio_value: parseFloat(s.portfolio_value.toFixed(2)),
      available_cash: parseFloat(s.available_cash.toFixed(2)),
      invested_capital: parseFloat(s.invested_capital.toFixed(2)),
      cumulative_deposits: parseFloat((depositMap[s.snapshot_date] || 0).toFixed(2))
    })));
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero dello storico', details: error.message });
  }
}

/**
 * GET /api/analytics/twr
 * Restituisce il Time-Weighted Rate of Return (TWR) del portafoglio.
 * Include TWR totale, YTD, annuali e serie storica completa.
 */
export function getTWR(req, res) {
  try {
    const twr = calculateTWR();
    res.json(twr);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel calcolo del TWR', details: error.message });
  }
}

/**
 * GET /api/analytics/asset/:id
 * Restituisce il dettaglio completo di un singolo asset:
 * info anagrafiche, posizione corrente, P&L, allocazione,
 * cronologia ordini e dividendi.
 */
export function getAssetDetailHandler(req, res) {
  try {
    const { id } = req.params;
    const detail = getAssetDetail(id);

    if (!detail) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }

    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero del dettaglio asset', details: error.message });
  }
}
