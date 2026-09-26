import { db } from '../database.js';

/**
 * Versione corrente del formato di export.
 * Permette future migrazioni senza rompere i backup esistenti.
 */
const EXPORT_VERSION = 1;

/**
 * Ordine di inserimento durante il restore (rispetta le foreign key).
 * I parent devono essere inseriti prima dei child.
 */
const INSERT_ORDER = [
  'importSessions',
  'assets',
  'marketOrders',
  'cashMovements',
  'dailyPortfolioSnapshots',
  'assetPrices',
  'allocationTargets',
];

/**
 * Ordine di cancellazione durante il restore (child prima dei parent).
 */
const DELETE_ORDER = [...INSERT_ORDER].reverse();

/**
 * Mappa tra chiavi del backup e nomi delle tabelle SQLite.
 */
const TABLE_MAP = {
  importSessions: 'import_sessions',
  assets: 'assets',
  marketOrders: 'market_orders',
  cashMovements: 'cash_movements',
  dailyPortfolioSnapshots: 'daily_portfolio_snapshots',
  assetPrices: 'asset_prices',
  allocationTargets: 'allocation_targets',
};

/**
 * Mappa tra chiavi del backup e colonne delle tabelle SQLite.
 * L'ordine deve corrispondere ai placeholder nella INSERT.
 */
const COLUMN_MAP = {
  importSessions: ['id', 'filename', 'import_date', 'status', 'records_imported', 'errors'],
  assets: ['id', 'isin', 'ticker', 'name', 'currency', 'asset_type', 'exchange', 'directa_code'],
  marketOrders: ['id', 'asset_id', 'operation_date', 'value_date', 'type', 'quantity', 'euro_amount', 'currency_amount', 'currency', 'order_reference', 'import_session_id'],
  cashMovements: ['id', 'asset_id', 'operation_date', 'value_date', 'movement_type', 'euro_amount', 'currency_amount', 'currency', 'protocol', 'order_reference', 'import_session_id'],
  dailyPortfolioSnapshots: ['id', 'snapshot_date', 'portfolio_value', 'available_cash', 'invested_capital', 'import_session_id'],
  assetPrices: ['id', 'asset_id', 'current_price', 'average_price', 'extraction_date', 'import_session_id'],
  allocationTargets: ['id', 'asset_type_id', 'target_percent', 'tolerance'],
};

/**
 * Esporta il database completo come oggetto JSON strutturato.
 * Esclude la tabella `asset_types` perché è ricreata automaticamente all'avvio.
 * @returns {Object} Oggetto export con metadati e dati
 */
export function exportDatabase() {
  const data = {};
  const counts = {};

  for (const [key, table] of Object.entries(TABLE_MAP)) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    data[key] = rows;
    counts[key] = rows.length;
  }

  return {
    version: EXPORT_VERSION,
    exportDate: new Date().toISOString(),
    counts,
    data,
  };
}

/**
 * Ripristina il database da un backup JSON precedentemente esportato.
 * L'operazione è distruttiva: svuota tutte le tabelle prima di reimportare.
 * Esegue tutto in un'unica transazione atomica.
 *
 * @param {Object} backup - Oggetto backup (struttura exportDatabase)
 * @returns {Object} Conteggi dei dati ripristinati
 * @throws {Error} Se la struttura o la versione non sono valide
 */
export function restoreDatabase(backup) {
  // Validazione struttura
  if (!backup || typeof backup !== 'object') {
    throw new Error('Formato backup non valido');
  }
  if (backup.version !== EXPORT_VERSION) {
    throw new Error(`Versione del backup non supportata: ${backup.version}. Versione supportata: ${EXPORT_VERSION}`);
  }
  if (!backup.data || typeof backup.data !== 'object') {
    throw new Error('Backup privo di dati');
  }

  // Verifica che tutte le chiavi richieste siano presenti
  for (const key of INSERT_ORDER) {
    if (!Array.isArray(backup.data[key])) {
      throw new Error(`Dati mancanti per: ${key}`);
    }
  }

  const restored = {};

  // Disabilita foreign keys per permettere cancellazione e inserimento in qualsiasi ordine
  db.exec('PRAGMA foreign_keys = OFF');

  try {
    db.exec('BEGIN TRANSACTION');

    // 1. Cancella tutte le tabelle (ordine: child → parent)
    for (const key of DELETE_ORDER) {
      const table = TABLE_MAP[key];
      db.exec(`DELETE FROM ${table}`);
    }

    // 2. Inserisci i dati (ordine: parent → child)
    for (const key of INSERT_ORDER) {
      const table = TABLE_MAP[key];
      const columns = COLUMN_MAP[key];
      const rows = backup.data[key];

      if (rows.length === 0) {
        restored[key] = 0;
        continue;
      }

      const placeholders = columns.map(() => '?').join(', ');
      const columnList = columns.join(', ');
      const stmt = db.prepare(
        `INSERT INTO ${table} (${columnList}) VALUES (${placeholders})`
      );

      for (const row of rows) {
        const values = columns.map(col => row[col] ?? null);
        stmt.run(...values);
      }

      restored[key] = rows.length;
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  return restored;
}
