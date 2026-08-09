import { db } from '../database.js';
import { randomUUID } from 'node:crypto';

/**
 * Crea una nuova sessione di import nel database.
 * @param {Object} sessionData - Dati della sessione
 * @param {string} sessionData.filename - Nome del file importato
 * @param {string} sessionData.status - Stato dell'import (SUCCESS, FAILED)
 * @param {number} sessionData.recordsImported - Numero di record importati
 * @param {string|null} [sessionData.errors=null] - Log degli errori (se fallito)
 * @returns {Object} Sessione di import creata
 */
export function createImportSession(sessionData) {
  const id = randomUUID();
  const importDate = new Date().toISOString();

  db.prepare(`
    INSERT INTO import_sessions (id, filename, import_date, status, records_imported, errors)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    id,
    sessionData.filename,
    importDate,
    sessionData.status,
    sessionData.recordsImported,
    sessionData.errors || null
  );

  return db.prepare('SELECT * FROM import_sessions WHERE id = ?').get(id);
}

/**
 * Ottiene lo storico delle sessioni di import.
 * @returns {Array} Sessioni di import ordinate per data decrescente
 */
export function getImportSessions() {
  return db
    .prepare('SELECT * FROM import_sessions ORDER BY import_date DESC')
    .all();
}

/**
 * Recupera la data operazione più recente tra tutti i record
 * presenti nelle tabelle market_orders e cash_movements.
 * Utilizzata per filtrare i record da importare: vengono importati
 * solo i movimenti con data successiva all'ultima data presente.
 * @returns {string|null} Data ISO (YYYY-MM-DD) più recente, o null se il database è vuoto
 */
export function getLatestOperationDate() {
  const marketOrdersMax = db.prepare('SELECT MAX(operation_date) as max_date FROM market_orders').get();
  const cashMovementsMax = db.prepare('SELECT MAX(operation_date) as max_date FROM cash_movements').get();

  const dates = [];
  if (marketOrdersMax.max_date) dates.push(marketOrdersMax.max_date);
  if (cashMovementsMax.max_date) dates.push(cashMovementsMax.max_date);

  if (dates.length === 0) return null;

  dates.sort();
  return dates[dates.length - 1];
}

/**
 * Inserisce un MarketOrder nel database.
 * I duplicati non vengono filtrati per permettere esecuzioni parziali
 * identiche (stesso ordine, stessa quantità, stesso importo) che
 * Directa può generare come righe CSV distinte.
 * La protezione dai duplicati su re-import è gestita tramite clearDatabase().
 * @param {Object} orderData - Dati dell'ordine
 * @returns {Object} Ordine inserito
 */
export function insertMarketOrder(orderData) {
  const id = randomUUID();
  const { assetId, operationDate, valueDate, type, quantity, euroAmount, currencyAmount, currency, orderReference, importSessionId } = orderData;

  db.prepare(`
    INSERT INTO market_orders (id, asset_id, operation_date, value_date, type, quantity, euro_amount, currency_amount, currency, order_reference, import_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, assetId, operationDate, valueDate, type, quantity, euroAmount, currencyAmount, currency, orderReference, importSessionId);

  return db.prepare('SELECT * FROM market_orders WHERE id = ?').get(id);
}

/**
 * Inserisce un CashMovement nel database in modo idempotente.
 * Usa il vincolo UNIQUE su protocol oppure su (operationDate, movementType, euroAmount, assetId).
 * @param {Object} movementData - Dati del movimento di cassa
 * @returns {Object} Movimento inserito o esistente
 */
export function insertCashMovement(movementData) {
  const id = randomUUID();
  const { assetId, operationDate, valueDate, movementType, euroAmount, currencyAmount, currency, protocol, orderReference, importSessionId } = movementData;

  // Idempotenza: se esiste un protocollo, controlla per protocollo; altrimenti usa i campi compositi
  let existing = null;
  if (protocol) {
    existing = db
      .prepare('SELECT * FROM cash_movements WHERE protocol = ?')
      .get(protocol);
  }

  if (!existing) {
    existing = db
      .prepare('SELECT * FROM cash_movements WHERE operation_date = ? AND movement_type = ? AND euro_amount = ? AND (asset_id = ? OR (asset_id IS NULL AND ? IS NULL))')
      .get(operationDate, movementType, euroAmount, assetId, assetId);
  }

  if (existing) return existing;

  db.prepare(`
    INSERT INTO cash_movements (id, asset_id, operation_date, value_date, movement_type, euro_amount, currency_amount, currency, protocol, order_reference, import_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, assetId, operationDate, valueDate, movementType, euroAmount, currencyAmount, currency, protocol, orderReference, importSessionId);

  return db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id);
}

/**
 * Inserisce un DailyPortfolioSnapshot nel database.
 * Il vincolo UNIQUE su snapshot_date previene duplicati per la stessa data.
 * @param {Object} snapshotData - Dati dello snapshot
 * @returns {Object} Snapshot inserito o esistente
 */
export function insertDailySnapshot(snapshotData) {
  const id = randomUUID();
  const { snapshotDate, portfolioValue, availableCash, investedCapital, importSessionId } = snapshotData;

  const existing = db
    .prepare('SELECT * FROM daily_portfolio_snapshots WHERE snapshot_date = ?')
    .get(snapshotDate);

  if (existing) return existing;

  db.prepare(`
    INSERT INTO daily_portfolio_snapshots (id, snapshot_date, portfolio_value, available_cash, invested_capital, import_session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, snapshotDate, portfolioValue, availableCash, investedCapital, importSessionId);

  return db.prepare('SELECT * FROM daily_portfolio_snapshots WHERE id = ?').get(id);
}

/**
 * Inserisce o aggiorna un prezzo di asset nel database.
 * Usa INSERT OR REPLACE per gestire l'unicità su (asset_id, extraction_date).
 * @param {Object} priceData - Dati del prezzo
 * @param {string} priceData.assetId - ID dell'asset
 * @param {number} priceData.currentPrice - Prezzo corrente unitario
 * @param {number} priceData.averagePrice - Prezzo medio di carico unitario
 * @param {string} priceData.extractionDate - Data di estrazione del report
 * @param {string} priceData.importSessionId - ID della sessione di import
 * @returns {Object} Record di prezzo inserito o aggiornato
 */
export function insertAssetPrice(priceData) {
  const id = randomUUID();
  const { assetId, currentPrice, averagePrice, extractionDate, importSessionId } = priceData;

  // Elimina eventuale record esistente per la stessa coppia (asset_id, extraction_date)
  const existing = db
    .prepare('SELECT id FROM asset_prices WHERE asset_id = ? AND extraction_date = ?')
    .get(assetId, extractionDate);

  if (existing) {
    db.prepare('DELETE FROM asset_prices WHERE id = ?').run(existing.id);
  }

  db.prepare(`
    INSERT INTO asset_prices (id, asset_id, current_price, average_price, extraction_date, import_session_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, assetId, currentPrice, averagePrice, extractionDate, importSessionId);

  return db.prepare('SELECT * FROM asset_prices WHERE id = ?').get(id);
}

/**
 * Svuota completamente il database cancellando tutti i record dalle tabelle.
 * Esegue le cancellazioni in una transazione, rispettando l'ordine delle
 * Foreign Key (RESTRICT su assets, CASCADE su import_sessions).
 * @returns {Object} Conteggi di eliminazione per ogni tabella
 */
export function clearDatabase() {
  // Conta i record prima della cancellazione per restituire un report accurato
  const before = {
    marketOrders: db.prepare('SELECT COUNT(*) as count FROM market_orders').get().count,
    cashMovements: db.prepare('SELECT COUNT(*) as count FROM cash_movements').get().count,
    snapshots: db.prepare('SELECT COUNT(*) as count FROM daily_portfolio_snapshots').get().count,
    assetPrices: db.prepare('SELECT COUNT(*) as count FROM asset_prices').get().count,
    assets: db.prepare('SELECT COUNT(*) as count FROM assets').get().count,
    sessions: db.prepare('SELECT COUNT(*) as count FROM import_sessions').get().count,
  };

  // Disabilita temporaneamente le foreign key constraint per permettere
  // la cancellazione di tutte le tabelle in qualsiasi ordine.
  // Le FK vengono riattivate subito dopo la transazione.
  db.exec('PRAGMA foreign_keys = OFF');

  try {
    db.exec('BEGIN TRANSACTION');
    db.exec('DELETE FROM market_orders;');
    db.exec('DELETE FROM cash_movements;');
    db.exec('DELETE FROM daily_portfolio_snapshots;');
    db.exec('DELETE FROM asset_prices;');
    db.exec('DELETE FROM assets;');
    db.exec('DELETE FROM import_sessions;');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  return { deleted: before };
}
