import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

// 1. Assicuriamoci che la cartella fisica 'db' esista nella root del progetto
const dbDir = join(process.cwd(), 'db');
mkdirSync(dbDir, { recursive: true });

// 2. Connessione al file di database SQLite nativo
const dbPath = join(dbDir, 'portfolio.db');
const db = new DatabaseSync(dbPath);

/**
 * Inizializza il database creando le tabelle e gli indici se non esistono.
 * Abilita inoltre il controllo delle chiavi esterne (Foreign Keys).
 */
export function initializeDatabase() {
  try {
    // SQLite disabilita le chiavi esterne di default per compatibilità storica. Le attiviamo qui.
    db.exec('PRAGMA foreign_keys = ON;');

    console.log('⏳ Inizializzazione del database SQLite nativo...');

    // Creazione Tabelle
    db.exec(`
      CREATE TABLE IF NOT EXISTS import_sessions (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        import_date TEXT NOT NULL,
        status TEXT NOT NULL,
        records_imported INTEGER NOT NULL,
        errors TEXT
      );

      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        isin TEXT UNIQUE NOT NULL,
        ticker TEXT NOT NULL,
        name TEXT NOT NULL,
        currency TEXT NOT NULL,
        asset_type TEXT NOT NULL DEFAULT 'UNKNOWN',
        exchange TEXT,
        directa_code TEXT
      );

      CREATE TABLE IF NOT EXISTS market_orders (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        operation_date TEXT NOT NULL,
        value_date TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        euro_amount REAL NOT NULL,
        currency_amount REAL,
        currency TEXT NOT NULL,
        order_reference TEXT NOT NULL,
        import_session_id TEXT NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
        FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
        UNIQUE(order_reference, asset_id, type, quantity)
      );

      CREATE TABLE IF NOT EXISTS cash_movements (
        id TEXT PRIMARY KEY,
        asset_id TEXT,
        operation_date TEXT NOT NULL,
        value_date TEXT NOT NULL,
        movement_type TEXT NOT NULL,
        euro_amount REAL NOT NULL,
        currency_amount REAL,
        currency TEXT NOT NULL,
        protocol TEXT,
        order_reference TEXT,
        import_session_id TEXT NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
        FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
        UNIQUE(protocol),
        UNIQUE(operation_date, movement_type, euro_amount, asset_id)
      );

      CREATE TABLE IF NOT EXISTS daily_portfolio_snapshots (
        id TEXT PRIMARY KEY,
        snapshot_date TEXT UNIQUE NOT NULL,
        portfolio_value REAL NOT NULL,
        available_cash REAL NOT NULL,
        invested_capital REAL NOT NULL,
        import_session_id TEXT NOT NULL,
        FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
      );
    `);

    // Creazione Indici per ottimizzare le performance delle query di Analytics
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_assets_isin ON assets(isin);
      CREATE INDEX IF NOT EXISTS idx_market_orders_asset ON market_orders(asset_id);
      CREATE INDEX IF NOT EXISTS idx_market_orders_date ON market_orders(operation_date);
      CREATE INDEX IF NOT EXISTS idx_cash_movements_asset ON cash_movements(asset_id);
      CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements(operation_date);
      CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_portfolio_snapshots(snapshot_date);
    `);

    console.log('✅ Database pronto e tabelle/indici verificati con successo!');
  } catch (error) {
    console.error('❌ Errore durante l''inizializzazione del database:', error);
    throw error;
  }
}

/**
 * Esportiamo l'istanza raw del database per eseguire query negli altri moduli
 */
export { db };
