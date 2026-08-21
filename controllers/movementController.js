import { getMovements, getMovementSymbols, deleteMovement } from '../models/movementModel.js';
import { clearAnalyticsCache } from '../models/analyticsModel.js';

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
 * DELETE /api/movements/:id
 * Elimina un singolo movimento di cassa.
 * Invalida la cache analytics perché i movimenti influenzano TWR,
 * capitale investito e storico depositi.
 */
export function deleteMovementHandler(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'ID movimento mancante o non valido' });
    }

    const deleted = deleteMovement(id.trim());
    if (!deleted) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    // I movimenti di cassa entrano nei calcoli TWR/depositi: cache da invalidare
    clearAnalyticsCache();

    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete movement error:', error);
    res.status(500).json({ error: "Errore nell'eliminazione del movimento" });
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