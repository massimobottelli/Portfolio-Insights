-- 1. Tabella delle Sessioni di Importazione (ImportSession)
CREATE TABLE IF NOT EXISTS import_sessions (
    id TEXT PRIMARY KEY,                       -- UUID v4 generato da Node (crypto.randomUUID())
    filename TEXT NOT NULL,
    import_date TEXT NOT NULL,                 -- ISO8601 string (YYYY-MM-DDTHH:MM:SS)
    status TEXT NOT NULL,                      -- 'SUCCESS' | 'FAILED'
    records_imported INTEGER NOT NULL,
    errors TEXT                                -- Nullable, dettagli in caso di fallimento
);

-- 2. Tabella degli Asset (Asset)
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,                       -- UUID v4
    isin TEXT UNIQUE NOT NULL,                 -- Chiave di business unica e indicizzata
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    currency TEXT NOT NULL,                    -- es. 'EUR', 'USD'
    asset_type TEXT NOT NULL DEFAULT 'UNKNOWN',-- ETF, ETC, ETN, STOCK, BOND, FUND, UNKNOWN
    exchange TEXT,                             -- Nullable (es. 'MTA', 'XETRA')
    directa_code TEXT                          -- Nullable (es. 'M.512272')
);

-- 3. Tabella degli Ordini di Mercato (MarketOrder)
CREATE TABLE IF NOT EXISTS market_orders (
    id TEXT PRIMARY KEY,                       -- UUID v4
    asset_id TEXT NOT NULL,                    -- FK verso assets
    operation_date TEXT NOT NULL,              -- ISO8601 string
    value_date TEXT NOT NULL,                  -- ISO8601 string (Settlement)
    type TEXT NOT NULL,                        -- 'BUY' | 'SELL'
    quantity REAL NOT NULL,                    -- REAL supporta decimali/frazionari
    euro_amount REAL NOT NULL,                 -- Negativo per BUY, Positivo per SELL
    currency_amount REAL,                      -- Valore in valuta originale (nullable)
    currency TEXT NOT NULL,                    -- Valuta di transazione
    order_reference TEXT NOT NULL,             -- 'Riferimento ordine' di Directa
    import_session_id TEXT NOT NULL,           -- FK verso import_sessions
    
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
    FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
    
    -- Vincolo di unicità composto per impedire duplicati in fase di re-importazione
    UNIQUE(order_reference, asset_id, type, quantity)
);

-- 4. Tabella dei Movimenti di Cassa (CashMovement)
CREATE TABLE IF NOT EXISTS cash_movements (
    id TEXT PRIMARY KEY,                       -- UUID v4
    asset_id TEXT,                             -- FK verso assets (Nullable - nullo per bonifici, tasse generiche)
    operation_date TEXT NOT NULL,              -- ISO8601 string
    value_date TEXT NOT NULL,                  -- ISO8601 string
    movement_type TEXT NOT NULL,               -- DEPOSIT, WITHDRAWAL, DIVIDEND, INTEREST, TAX, COMMISSION, STAMP_DUTY, OTHER
    euro_amount REAL NOT NULL,                 -- Segno: positivo per entrate/dividendi, negativo per uscite/tasse
    currency_amount REAL,                      -- Nullable
    currency TEXT NOT NULL,                    -- es. 'EUR'
    protocol TEXT,                             -- 'Protocollo' unico di Directa (Nullable)
    order_reference TEXT,                      -- Collegamento opzionale all'ordine associato (es. commissione dell'ordine X)
    import_session_id TEXT NOT NULL,           -- FK verso import_sessions
    
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
    FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE,
    
    -- Vincolo di unicità: se c'è il protocollo usa quello, altrimenti usa la combinazione dei dati del movimento
    UNIQUE(protocol),
    UNIQUE(operation_date, movement_type, euro_amount, asset_id)
);

-- 5. Tabella degli Snapshot Giornalieri del Portafoglio (DailyPortfolioSnapshot)
CREATE TABLE IF NOT EXISTS daily_portfolio_snapshots (
    id TEXT PRIMARY KEY,                       -- UUID v4
    snapshot_date TEXT UNIQUE NOT NULL,        -- ISO8601 string (Solo YYYY-MM-DD per index unico temporale)
    portfolio_value REAL NOT NULL,             -- Valore totale in EUR
    available_cash REAL NOT NULL,              -- Liquidità
    invested_capital REAL NOT NULL,            -- Capitale investito / Valore di carico totale
    import_session_id TEXT NOT NULL,           -- FK verso import_sessions
    
    FOREIGN KEY (import_session_id) REFERENCES import_sessions(id) ON DELETE CASCADE
);

-- Ricerche rapide per ISIN (usate spessissimo dall'importatore)
CREATE INDEX IF NOT EXISTS idx_assets_isin ON assets(isin);

-- Filtri temporali e aggregazioni sugli ordini
CREATE INDEX IF NOT EXISTS idx_market_orders_asset ON market_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_market_orders_date ON market_orders(operation_date);

-- Filtri e somme sui movimenti di cassa (es. calcolo dividendi o tasse totali)
CREATE INDEX IF NOT EXISTS idx_cash_movements_asset ON cash_movements(asset_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_type ON cash_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON cash_movements(operation_date);

-- Ordinamento storico del valore del portafoglio
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_portfolio_snapshots(snapshot_date);
