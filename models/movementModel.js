import { db } from '../database.js';

/**
 * Recupera i movimenti di cassa (CashMovement) con JOIN su assets per ottenere ticker/nome.
 * Esclude i MarketOrder (ordini di acquisto/vendita).
 *
 * @param {Object} options - Opzioni di filtro e ordinamento
 * @param {string} [options.sortBy='operation_date'] - Colonna per ordinamento
 * @param {string} [options.sortOrder='desc'] - 'asc' o 'desc'
 * @param {string} [options.startDate] - Filtro data inizio (YYYY-MM-DD)
 * @param {string} [options.endDate] - Filtro data fine (YYYY-MM-DD)
 * @param {string} [options.type] - Filtro per movement_type
 * @param {string} [options.symbol] - Filtro per ticker dell'asset
 * @param {string} [options.search] - Ricerca testuale su descrizione
 * @returns {{ data: Array, total: number }} Movimenti filtrati e conteggio totale
 */
export function getMovements(options = {}) {
  const {
    sortBy = 'operation_date',
    sortOrder = 'desc',
    startDate,
    endDate,
    type,
    symbol,
    search
  } = options;

  // Whitelist delle colonne ordinabili per prevenire SQL injection
  const allowedSortColumns = [
    'operation_date', 'value_date', 'movement_type', 'euro_amount',
    'currency', 'ticker', 'name'
  ];
  const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'operation_date';
  const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Costruzione dinamica della clausola WHERE
  const conditions = [];
  const params = [];

  if (startDate) {
    conditions.push('cm.operation_date >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('cm.operation_date <= ?');
    params.push(endDate);
  }
  if (type) {
    conditions.push('cm.movement_type = ?');
    params.push(type);
  }
  if (symbol) {
    conditions.push('a.ticker = ?');
    params.push(symbol);
  }
  if (search) {
    conditions.push('(cm.protocol LIKE ? OR a.name LIKE ? OR a.ticker LIKE ?)');
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Query per il conteggio totale (senza LIMIT/OFFSET)
  const countQuery = `
    SELECT COUNT(*) as total
    FROM cash_movements cm
    LEFT JOIN assets a ON cm.asset_id = a.id
    ${whereClause}
  `;
  const { total } = db.prepare(countQuery).get(...params);

  // Query per i dati
  const dataQuery = `
    SELECT
      cm.id,
      cm.operation_date,
      cm.value_date,
      cm.movement_type,
      cm.euro_amount,
      cm.currency,
      cm.protocol,
      cm.order_reference,
      a.id AS asset_id,
      a.isin,
      a.ticker,
      a.name AS asset_name
    FROM cash_movements cm
    LEFT JOIN assets a ON cm.asset_id = a.id
    ${whereClause}
    ORDER BY cm.${safeSortBy} ${safeSortOrder}
  `;
  const data = db.prepare(dataQuery).all(...params);

  return { data, total };
}

/**
 * Recupera la lista dei ticker distinti presenti nei cash_movements,
 * utile per popolare il dropdown filtro "Simbolo".
 * @returns {Array<{ ticker: string }>} Lista di ticker
 */
export function getMovementSymbols() {
  return db
    .prepare(`
      SELECT DISTINCT a.ticker
      FROM cash_movements cm
      JOIN assets a ON cm.asset_id = a.id
      WHERE a.ticker IS NOT NULL AND a.ticker != ''
      ORDER BY a.ticker ASC
    `)
    .all();
}