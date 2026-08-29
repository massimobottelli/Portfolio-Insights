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
  getAssetDetail,
  getDistinctPortfolioCurrencies,
  calculateAssetTypeIRR
} from '../models/analyticsModel.js';
import { getRatesForCurrencies } from '../utils/currencyService.js';
import { TARGETABLE_ASSET_TYPES } from '../config/assetTypes.js';

/**
 * GET /api/analytics/dashboard
 * Restituisce i KPI principali per la Dashboard.
 */
export async function getDashboard(req, res) {
  try {
    const latestSnapshot = getLatestSnapshot();
    const cashBalance = calculateCashBalance();
    const investedCapital = calculateInvestedCapital();
    const positions = await calculatePositions();
    const allocation = await calculateAllocation();

    // Calcolo del valore totale del portafoglio.
    // Per coerenza con Portfolio (totale asset class) e Allocation (totale investito),
    // usa la stessa base di calcolo: somma delle posizioni con correzione BTP (quantità / 100)
    // più la liquidità disponibile (available_cash).
    // I marketValue sono già convertiti in EUR dal model.
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
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Errore nel calcolo dei KPI' });
  }
}

/**
 * GET /api/analytics/portfolio
 * Restituisce la lista delle posizioni attive nel portafoglio,
 * con prezzo corrente, prezzo medio di carico e data di aggiornamento.
 */
export async function getPortfolio(req, res) {
  try {
    const positions = await calculatePositions();
    const priceDate = getLatestPriceDate();
    const availableCash = calculateCashBalance();
    res.json({ positions, priceDate, availableCash });
  } catch (error) {
    console.error('Portfolio error:', error);
    res.status(500).json({ error: 'Errore nel recupero del portafoglio' });
  }
}

/**
 * GET /api/analytics/allocation
 * Restituisce l'allocazione percentuale del portafoglio.
 */
export async function getAllocation(req, res) {
  try {
    const allocation = await calculateAllocation();
    res.json(allocation);
  } catch (error) {
    console.error('Allocation error:', error);
    res.status(500).json({ error: 'Errore nel calcolo dell\'allocazione' });
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
    console.error('History error:', error);
    res.status(500).json({ error: 'Errore nel recupero dello storico' });
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
    console.error('TWR error:', error);
    res.status(500).json({ error: 'Errore nel calcolo del TWR' });
  }
}

/**
 * GET /api/analytics/asset/:id
 * Restituisce il dettaglio completo di un singolo asset:
 * info anagrafiche, posizione corrente, P&L, allocazione,
 * cronologia ordini e dividendi.
 */
export async function getAssetDetailHandler(req, res) {
  try {
    const { id } = req.params;
    const detail = await getAssetDetail(id);

    if (!detail) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }

    // Il campo irr è già incluso da getAssetDetail() che chiama calculateAssetIRR() internamente.
    res.json(detail);
  } catch (error) {
    console.error('Asset detail error:', error);
    res.status(500).json({ error: 'Errore nel recupero del dettaglio asset' });
  }
}

/**
 * GET /api/analytics/asset-type/irr
 * Restituisce l'IRR money-weighted aggregato per categoria di attività.
 *
 * Parametri query:
 * - assetType (opzionale): se presente, restituisce solo quel tipo
 *   Deve essere uno dei TARGETABLE_ASSET_TYPES (BOND, STOCK, CASH, FUND, COMMODITY)
 *
 * Response (senza parametro): { BOND: {...}, STOCK: {...}, ... }
 * Response (con parametro):   { STOCK: {...} } o errore 400
 *
 * Struttura valore:
 * { irr: number|null, years: number, firstDate: string, lastDate: string, assetCount: number }
 */
export async function getAllAssetTypeIRRs(req, res) {
  try {
    const { assetType } = req.query;

    let typesToQuery;
    if (assetType) {
      const normalized = assetType.toUpperCase().trim();
      if (!TARGETABLE_ASSET_TYPES.includes(normalized)) {
        return res.status(400).json({
          error: `Tipo di asset non valido: ${assetType}. Tipi consentiti: ${TARGETABLE_ASSET_TYPES.join(', ')}`
        });
      }
      typesToQuery = [normalized];
    } else {
      typesToQuery = [...TARGETABLE_ASSET_TYPES];
    }

    const results = {};
    for (const type of typesToQuery) {
      results[type] = calculateAssetTypeIRR(type) ?? null;
    }

    res.json(results);
  } catch (error) {
    console.error('Asset Type IRR error:', error);
    res.status(500).json({ error: 'Errore nel calcolo dell\'IRR per asset type' });
  }
}

/**
 * GET /api/analytics/rates
 * Restituisce i tassi di cambio odierni usati per la conversione in EUR.
 * Fonte: ECB Data Portal (SDMX 2.1).
 */
export async function getRates(req, res) {
  try {
    // Query leggera delle sole valute distinte: la versione precedente eseguiva
    // il calcolo completo delle posizioni (join + conversioni) solo per
    // estrarre l'elenco delle valute.
    const currencies = getDistinctPortfolioCurrencies();
    const rates = await getRatesForCurrencies(currencies);
    res.json(rates);
  } catch (error) {
    console.error('Rates error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei tassi di cambio' });
  }
}