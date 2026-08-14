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
        FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
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

      CREATE TABLE IF NOT EXISTS asset_prices (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        current_price REAL NOT NULL,
        average_price REAL NOT NULL,
        extraction_date TEXT NOT NULL,
        import_session_id TEXT NOT NULL,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
        FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
        UNIQUE(asset_id, extraction_date)
      );

      -- Catalogo asset type (nuovo): 5 tipi target-abili + UNKNOWN tecnico
      CREATE TABLE IF NOT EXISTS asset_types (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_targetable INTEGER NOT NULL DEFAULT 0
      );

      -- Target di allocazione (configurazione utente)
      CREATE TABLE IF NOT EXISTS allocation_targets (
        id TEXT PRIMARY KEY,
        asset_type_id TEXT NOT NULL,
        target_percent REAL NOT NULL,
        tolerance REAL NOT NULL DEFAULT 5.0,
        FOREIGN KEY (asset_type_id) REFERENCES asset_types(id) ON DELETE CASCADE,
        UNIQUE(asset_type_id)
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
      CREATE INDEX IF NOT EXISTS idx_asset_prices_asset ON asset_prices(asset_id);
      CREATE INDEX IF NOT EXISTS idx_asset_prices_date ON asset_prices(extraction_date);
    `);

    // Popolamento del catalogo asset_types (idempotente: INSERT OR IGNORE)
    db.exec(`
      INSERT OR IGNORE INTO asset_types (id, name, is_targetable) VALUES
        ('bond', 'BOND', 1),
        ('stock', 'STOCK', 1),
        ('cash', 'CASH', 1),
        ('fund', 'FUND', 1),
        ('commodity', 'COMMODITY', 1),
        ('unknown', 'UNKNOWN', 0);
    `);

    // Migrazione: i tipi decommissionati (ETF, ETC, ETN) vengono assegnati a UNKNOWN.
    // L'utente riclassificherà manualmente gli asset tramite il dropdown in Portfolio.
    const migrated = db
      .prepare("UPDATE assets SET asset_type = 'UNKNOWN' WHERE asset_type IN ('ETF', 'ETC', 'ETN')")
      .run();
    if (migrated.changes > 0) {
      console.log(`🔄 Migrazione asset type: ${migrated.changes} asset con tipi decommissionati assegnati a UNKNOWN`);
    }

    // Migrazione: aggiunge la FK da assets.asset_type a asset_types.name (se non già presente).
    // SQLite non permette di aggiungere una FK a una tabella esistente senza ricrearla,
    // quindi ricreiamo la tabella assets preservando i dati.
    const fkList = db.prepare('PRAGMA foreign_key_list(assets)').all();
    const hasAssetTypeFk = fkList.some(fk => fk.table === 'asset_types');
    if (!hasAssetTypeFk) {
      console.log('🔄 Migrazione tabella assets: aggiunta FK verso asset_types...');
      // PRAGMA foreign_keys è un no-op dentro una transazione: va disabilitato PRIMA di BEGIN.
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('BEGIN;');
      try {
        db.exec(`
          CREATE TABLE assets_new (
            id TEXT PRIMARY KEY,
            isin TEXT UNIQUE NOT NULL,
            ticker TEXT NOT NULL,
            name TEXT NOT NULL,
            currency TEXT NOT NULL,
            asset_type TEXT NOT NULL DEFAULT 'UNKNOWN',
            exchange TEXT,
            directa_code TEXT,
            FOREIGN KEY (asset_type) REFERENCES asset_types(name)
          );
        `);
        db.exec(`
          INSERT INTO assets_new (id, isin, ticker, name, currency, asset_type, exchange, directa_code)
          SELECT id, isin, ticker, name, currency, asset_type, exchange, directa_code FROM assets;
        `);
        db.exec('DROP TABLE assets;');
        db.exec('ALTER TABLE assets_new RENAME TO assets;');
        db.exec('COMMIT;');
      } catch (error) {
        db.exec('ROLLBACK;');
        throw error;
      } finally {
        db.exec('PRAGMA foreign_keys = ON;');
      }
      // Ricrea l'indice su isin (eliminato dal DROP TABLE)
      db.exec('CREATE INDEX IF NOT EXISTS idx_assets_isin ON assets(isin);');
      console.log('✅ Migrazione tabella assets completata');
    }

    console.log('✅ Database pronto e tabelle/indici verificati con successo!');
  } catch (error) {
    console.error("❌ Errore durante l'inizializzazione del database:", error);
    throw error;
  }
}

/**
 * Esportiamo l'istanza raw del database per eseguire query negli altri moduli
 */
export { db };