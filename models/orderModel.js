import { db } from '../database.js';

/**
 * Recupera gli ordini di acquisto/vendita (MarketOrder) con JOIN su assets
 * per ottenere ticker/nome dell'asset.
 *
 * @param {Object} options - Opzioni di filtro e ordinamento
 * @param {string} [options.sortBy='operation_date'] - Colonna per ordinamento
 * @param {string} [options.sortOrder='desc'] - 'asc' o 'desc'
 * @param {string} [options.startDate] - Filtro data inizio (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filtro data fine (YYYY-MM-DD)
 * @param {string} [options.type] - Filtro per tipo ordine ('BUY' / 'SELL')
 * @param {string} [options.symbol] - Filtro per ticker dell'asset
 * @param {string} [options.search] - Ricerca testuale su nome/ticker/riferimento
 * @returns {{ data: Array, total: number }} Ordini filtrati e conteggio totale
 */
export function getOrders(options = {}) {
  const {
    sortBy = 'operation_date',
    sortOrder = 'desc',
    startDate,
    endDate,
    type,
    symbol,
    search
  } = options;

  // Whitelist delle colonne ordinabili per prevenire SQL injection.
  // Mappa i nomi esposti dall'API (camelCase del frontend) alle colonne SQL reali.
  const allowedSortColumns = {
    'operation_date': 'mo.operation_date',
    'value_date': 'mo.value_date',
    'type': 'mo.type',
    'quantity': 'mo.quantity',
    'euro_amount': 'mo.euro_amount',
    'currency': 'mo.currency',
    'ticker': 'a.ticker',
    'name': 'a.name',
    'asset_name': 'a.name',
    'order_reference': 'mo.order_reference'
  };
  const safeSortBy = allowedSortColumns[sortBy] || 'mo.operation_date';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Costruzione dinamica della clausola WHERE
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('mo.operation_date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('mo.operation_date <= ?');
    params.push(endDate);
  }
  if (type) {
    conditions.push('mo.type = ?');
    params.push(type);
  }
  if (symbol) {
    conditions.push('a.ticker = ?');
    params.push(symbol);
  }
  if (search) {
    conditions.push('(a.name LIKE ? OR a.ticker LIKE ? OR mo.order_reference LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Query per il conteggio totale (senza LIMIT/OFFSET)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM market_orders mo
    LEFT JOIN assets a ON mo.asset_id = a.id
    ${whereClause}
  `;
  const { total } = db.prepare(countQuery).get(...params);

  // Query per i dati
  const dataQuery = `
    SELECT
      mo.id,
      mo.operation_date,
      mo.value_date,
      mo.type,
      mo.quantity,
      mo.euro_amount,
      mo.currency_amount,
      mo.currency,
      mo.order_reference,
      mo.import_session_id,
      a.id AS asset_id,
      a.isin,
      a.ticker,
      a.name AS asset_name
    FROM market_orders mo
    LEFT JOIN assets a ON mo.asset_id = a.id
    ${whereClause}
    ORDER BY ${safeSortBy} ${safeSortOrder}
  `;
  const data = db.prepare(dataQuery).all(...params);

  return { data, total };
}

/**
 * Elimina un singolo ordine di mercato per ID.
 * @param {string} id - ID dell'ordine (UUID)
 * @returns {boolean} true se l'ordine è stato eliminato, false se non esiste
 */
export function deleteOrder(id) {
  const result = db
    .prepare('DELETE FROM market_orders WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

/**
 * Recupera la lista dei ticker distinti presenti nei market_orders,
 * utile per popolare il dropdown filtro "Simbolo".
 * @returns {Array<{ ticker: string }>} Lista di ticker
 */
export function getOrderSymbols() {
  return db
    .prepare(`
      SELECT DISTINCT a.ticker
      FROM market_orders mo
      JOIN assets a ON mo.asset_id = a.id
      WHERE a.ticker IS NOT NULL AND a.ticker != ''
      ORDER BY a.ticker ASC
    `)
    .all();
}
