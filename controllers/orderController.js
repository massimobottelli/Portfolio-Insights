import { getOrders, getOrderSymbols, deleteOrder } from '../models/orderModel.js';
import { clearAnalyticsCache } from '../models/analyticsModel.js';

/**
 * GET /api/orders
 * Restituisce la lista degli ordini di mercato (MarketOrder) con filtri e ordinamento.
 * Supporta i seguenti query parameters:
 *   sortBy, sortOrder, startDate, endDate, type, symbol, search
 */
export function listOrders(req, res) {
  try {
    const { sortBy, sortOrder, startDate, endDate, type, symbol, search } = req.query;

    const result = getOrders({
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
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Errore nel recupero degli ordini' });
  }
}

/**
 * DELETE /api/orders/:id
 * Elimina un singolo ordine di mercato.
 * Invalida la cache analytics perché gli ordini influenzano quantity, PMA, ecc.
 */
export function deleteOrderHandler(req, res) {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || id.trim().length === 0) {
      return res.status(400).json({ error: 'ID ordine mancante o non valido' });
    }

    const deleted = deleteOrder(id.trim());
    if (!deleted) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    // Gli ordini influenzano quantità e PMA: invalida cache analytics
    clearAnalyticsCache();

    res.json({ success: true, deletedId: id });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: "Errore nell'eliminazione dell'ordine" });
  }
}

/**
 * GET /api/orders/symbols
 * Restituisce la lista dei ticker distinti presenti nei market_orders,
 * utile per popolare il dropdown filtro "Simbolo".
 */
export function listOrderSymbols(req, res) {
  try {
    const symbols = getOrderSymbols();
    res.json(symbols.map(s => s.ticker));
  } catch (error) {
    console.error('Order symbols error:', error);
    res.status(500).json({ error: 'Errore nel recupero dei simboli' });
  }
}
