import { db } from '../database.js';

/**
 * Calcola la liquidità corrente aggregando tutti i CashMovement.
 * Positive = saldo in entrata, negative = saldo in uscita.
 * @returns {number} Saldo di cassa corrente
 */
export function calculateCashBalance() {
  const result = db
    .prepare('SELECT COALESCE(SUM(euro_amount), 0) AS balance FROM cash_movements')
    .get();
  return result.balance;
}

/**
 * Calcola il capitale investito totale (somma di tutti i DEPOSIT).
 * @returns {number} Capitale investito totale
 */
export function calculateInvestedCapital() {
  const result = db
    .prepare("SELECT COALESCE(SUM(euro_amount), 0) AS total FROM cash_movements WHERE movement_type = 'DEPOSIT'")
    .get();
  return result.total;
}

/**
 * Calcola le posizioni correnti: per ogni asset, la quantità netta
 * derivante dalla somma di tutti i MarketOrder (BUY = +qty, SELL = -qty).
 * Include prezzo corrente e prezzo medio di carico dalla tabella asset_prices.
 * @returns {Array} Posizioni attive (solo quantità > 0)
 */
export function calculatePositions() {
  return db
    .prepare(`
      SELECT
        a.id AS asset_id,
        a.isin,
        a.ticker,
        a.name,
        a.currency,
        a.asset_type,
        SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) AS quantity,
        ap.current_price AS current_price,
        ap.average_price AS average_price,
        ap.extraction_date AS price_date
      FROM market_orders mo
      JOIN assets a ON a.id = mo.asset_id
      LEFT JOIN (
        SELECT asset_id, current_price, average_price, extraction_date
        FROM asset_prices
        WHERE (asset_id, extraction_date) IN (
          SELECT asset_id, MAX(extraction_date)
          FROM asset_prices
          GROUP BY asset_id
        )
      ) ap ON ap.asset_id = a.id
      GROUP BY a.id, a.isin, a.ticker, a.name, a.currency, a.asset_type, ap.current_price, ap.average_price, ap.extraction_date
      HAVING quantity > 0
      ORDER BY a.name ASC
    `)
    .all();
}

/**
 * Ottiene la data di estrazione più recente dalla tabella asset_prices.
 * @returns {string|null} Data di estrazione più recente o null se non ci sono prezzi
 */
export function getLatestPriceDate() {
  const result = db
    .prepare('SELECT extraction_date FROM asset_prices ORDER BY extraction_date DESC LIMIT 1')
    .get();
  return result ? result.extraction_date : null;
}

/**
 * Calcola l'allocazione percentuale del portafoglio.
 * Per ogni posizione attiva, calcola il peso percentuale.
 * Nota: in MVP1 il valore è basato sulla quantità, non sul prezzo di mercato.
 * @returns {Array} Posizioni con percentuale di allocazione
 */
export function calculateAllocation() {
  const positions = calculatePositions();
  const totalQuantity = positions.reduce((sum, p) => sum + p.quantity, 0);

  if (totalQuantity === 0) return [];

  return positions.map(p => ({
    ...p,
    allocationPercent: parseFloat(((p.quantity / totalQuantity) * 100).toFixed(2))
  }));
}

/**
 * Ottiene lo snapshot di portafoglio più recente.
 * @returns {Object|undefined} Ultimo snapshot disponibile
 */
export function getLatestSnapshot() {
  return db
    .prepare('SELECT * FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1')
    .get();
}

/**
 * Ottiene la serie storica completa degli snapshot di portafoglio.
 * @returns {Array} Snapshot ordinati per data crescente
 */
export function getSnapshotHistory() {
  return db
    .prepare('SELECT * FROM daily_portfolio_snapshots ORDER BY snapshot_date ASC')
    .all();
}