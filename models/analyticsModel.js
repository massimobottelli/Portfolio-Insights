import { db } from '../database.js';

/**
 * Calcola la liquidità corrente leggendo il campo available_cash
 * dall'ultimo snapshot Directa (daily_portfolio_snapshots).
 * @returns {number} Saldo di cassa corrente
 */
export function calculateCashBalance() {
  const result = db
    .prepare('SELECT available_cash FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1')
    .get();
  return result ? result.available_cash : 0;
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
 * Verifica se l'asset è un BTP, che richiede la divisione della quantità per 100
 * perché Directa quota i BTP in percentuale (es. 102.50 invece di 1.0250).
 * @param {Object} pos Posizione
 * @returns {boolean} true se è un BTP
 */
const isBtp = (pos) =>
  pos.name.toLowerCase().includes('btp') || pos.ticker.toLowerCase().includes('btp');

/**
 * Calcola l'allocazione percentuale del portafoglio.
 * Per ogni posizione attiva, calcola il peso percentuale basato sul valore di mercato
 * (quantità × prezzo corrente), con la correzione BTP (quantità / 100).
 * @returns {Array} Posizioni con percentuale di allocazione
 */
export function calculateAllocation() {
  const positions = calculatePositions();

  // Trasforma le quantità (BTP / 100) e calcola il valore di mercato
  // Esclude gli asset senza prezzo corrente (current_price null)
  const enriched = positions
    .filter(p => p.current_price !== null)
    .map(p => {
      const quantity = isBtp(p) ? p.quantity / 100 : p.quantity;
      const marketValue = quantity * p.current_price;
      return { ...p, quantity, marketValue };
    })
    // Ordina per valore di mercato decrescente
    .sort((a, b) => b.marketValue - a.marketValue);

  const totalMarketValue = enriched.reduce((sum, p) => sum + p.marketValue, 0);

  if (totalMarketValue === 0) return [];

  return enriched.map(p => ({
    ...p,
    allocationPercent: parseFloat(((p.marketValue / totalMarketValue) * 100).toFixed(2))
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
 * Calcola il totale cumulativo dei depositi per ogni data di snapshot.
 * 
 * Per ogni snapshot_date, somma tutti i DEPOSIT con operation_date <= snapshot_date.
 * Questo permette di tracciare una linea "capitale versato" nel grafico storico.
 * 
 * @returns {Array<{snapshot_date: string, cumulative_deposits: number}>}
 */
export function getDepositHistory() {
  // Le date in cash_movements sono in formato DD-MM-YYYY (es. "05-06-2024")
  // mentre snapshot_date è in YYYY-MM-DD (es. "2024-06-05").
  // La conversione usa substr per riordinare: substr(operation_date,7,4)||'-'||substr(operation_date,4,2)||'-'||substr(operation_date,1,2)
  return db
    .prepare(`
      SELECT
        d.snapshot_date,
        COALESCE(SUM(c.euro_amount), 0) AS cumulative_deposits
      FROM daily_portfolio_snapshots d
      LEFT JOIN cash_movements c
        ON c.movement_type = 'DEPOSIT'
        AND substr(c.operation_date,7,4) || '-' || substr(c.operation_date,4,2) || '-' || substr(c.operation_date,1,2) <= d.snapshot_date
      GROUP BY d.snapshot_date
      ORDER BY d.snapshot_date ASC
    `)
    .all();
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
