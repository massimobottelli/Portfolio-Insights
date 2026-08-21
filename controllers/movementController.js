import { getMovements, getMovementSymbols } from '../models/movementModel.js';

/**
 * GET /api/movements
 * Restituisce la lista dei movimenti di cassa (CashMovement) con filtri e ordinamento.
 * Supporta i seguenti query parameters:
 *   sortBy, sortOrder, startDate, endDate, type, symbol, search
 */
export function listMovements(req, res) {
  try {
    const { sortBy, sortOrder, startDate, endDate, type, symbol, search } = req.query;

    const result = getMovements({
      sortBy,
      sortOrder,
      startDate,
      endDate,
      type,
      symbol,
      search
    });

    res.json(result);
  } catch (error) {
    console.error('List movements error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei movimenti' });
  }
}

/**
 * GET /api/movements/symbols
 * Restituisce la lista dei ticker distinti presenti nei cash_movements,
 * utile per popolare il dropdown filtro "Simbolo".
 */
export function listMovementSymbols(req, res) {
  try {
    const symbols = getMovementSymbols();
    res.json(symbols.map(s => s.ticker));
  } catch (error) {
    console.error('Movement symbols error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei simboli' });
  }
}