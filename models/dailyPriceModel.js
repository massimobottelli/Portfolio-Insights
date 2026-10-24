import { db } from '../database.js';
import { randomUUID } from 'node:crypto';
import { EODHD_ISIN_BY_SYMBOL } from '../config/eodhdSymbols.js';

/**
 * Modello per lo storico dei prezzi di chiusura giornalieri (fonte EODHD).
 *
 * La tabella `daily_asset_closing_prices` persiste SOLO tre dati funzionali:
 * asset, data e close. Non persiste OHLC, volume, dividendi, split o altre
 * corporate action (perimetro funzionale richiesto).
 *
 * È separata da `asset_prices`, che resta la tabella dei prezzi "istantanei"
 * importati dal report P_TOTALE Directa: semantiche diverse, tabelle diverse.
 */

/**
 * Data più recente presente nello storico locale per un asset.
 * Usata dall'aggiornamento incrementale per calcolare il range EODHD da scaricare.
 * @param {string} assetId
 * @returns {string|null} Data ISO YYYY-MM-DD, o null se nessuno storico
 */
export function getLatestPriceDate(assetId) {
  const row = db
    .prepare(
      'SELECT MAX(price_date) AS max_date FROM daily_asset_closing_prices WHERE asset_id = ?'
    )
    .get(assetId);
  return row?.max_date ?? null;
}

/**
 * Conteggio righe di storico per un asset (usato dai riepiloghi CLI).
 */
export function countDailyClosingPrices(assetId) {
  return db
    .prepare(
      'SELECT COUNT(*) AS count FROM daily_asset_closing_prices WHERE asset_id = ?'
    )
    .get(assetId).count;
}

/**
 * Metadati essenziali di un asset (per l'endpoint di lettura dello storico).
 * @param {string} assetId
 * @returns {object|null}
 */
export function getAssetById(assetId) {
  return (
    db
      .prepare(
        'SELECT id, isin, ticker, name, currency, asset_type, exchange FROM assets WHERE id = ?'
      )
      .get(assetId) ?? null
  );
}

/**
 * Serie completa dei prezzi di chiusura di un asset, in ordine cronologico.
 * Solo i due campi funzionali persistiti: data e close.
 * @param {string} assetId
 * @returns {Array<{date: string, close: number}>}
 */
export function getDailyClosingPrices(assetId) {
  return db
    .prepare(
      `SELECT price_date AS date, close_price AS close
       FROM daily_asset_closing_prices
       WHERE asset_id = ?
       ORDER BY price_date ASC`
    )
    .all(assetId);
}

/**
 * Risolve un simbolo EODHD (TICKER.EXCHANGE) in un asset esistente.
 *
 * Ordine di risoluzione:
 * 1. match esatto su `assets.exchange` (simbolo EODHD certificato dal backfill)
 * 2. ISIN ricavato dalla mappa statica, poi match su `assets.isin`
 * 3. match esatto su `assets.ticker` (solo se univoco)
 *
 * Nessuna creazione automatica di asset: "not found" e "ambiguous" sono
 * errori espliciti e diagnostici.
 *
 * @param {string} symbol
 * @returns {{ asset: object|null, error: null|'not_found'|'ambiguous' }}
 */
export function resolveAssetForEodhdSymbol(symbol) {
  const byExchange = db
    .prepare('SELECT * FROM assets WHERE exchange = ?')
    .all(symbol);
  if (byExchange.length === 1) return { asset: byExchange[0], error: null };
  if (byExchange.length > 1) return { asset: null, error: 'ambiguous' };

  const isin = EODHD_ISIN_BY_SYMBOL[symbol];
  if (isin) {
    const byIsin = db.prepare('SELECT * FROM assets WHERE isin = ?').all(isin);
    if (byIsin.length === 1) return { asset: byIsin[0], error: null };
    if (byIsin.length > 1) return { asset: null, error: 'ambiguous' };
  }

  const byTicker = db
    .prepare('SELECT * FROM assets WHERE ticker = ?')
    .all(symbol);
  if (byTicker.length === 1) return { asset: byTicker[0], error: null };
  if (byTicker.length > 1) return { asset: null, error: 'ambiguous' };

  return { asset: null, error: 'not_found' };
}

/**
 * Imposta `assets.exchange` al simbolo EODHD confermato, solo se attualmente vuoto.
 * (Arricchimento D1: exchange = simbolo della quotazione specifica detenuta).
 * @returns {boolean} true se il backfill è stato eseguito, false se già valorizzato
 */
export function setAssetExchangeIfEmpty(assetId, symbol) {
  return (
    db
      .prepare(
        "UPDATE assets SET exchange = ? WHERE id = ? AND (exchange IS NULL OR exchange = '')"
      )
      .run(symbol, assetId).changes > 0
  );
}

/**
 * Inserisce o aggiorna in transazione i prezzi di chiusura di un asset.
 *
 * Upsert idempotente su `(asset_id, price_date)`:
 * - il re-import dello stesso file non duplica righe
 * - corregge l'osservazione esistente se il valore cambia (es. correzione provider)
 * - righe duplicate nello stesso input: l'ultima occorrenza vince
 *
 * @param {string} assetId
 * @param {Array<{date: string, close: number}>} rows
 * @returns {{ inserted: number, updated: number, unchanged: number }}
 */
export function upsertDailyClosingPrices(assetId, rows) {
  const result = { inserted: 0, updated: 0, unchanged: 0 };
  if (!Array.isArray(rows) || rows.length === 0) return result;

  // Dedup per data (ultima occorrenza vince): determinismo anche con CSV
  // contenente righe ripetute per la stessa data
  const byDate = new Map();
  for (const row of rows) byDate.set(row.date, row.close);

  const selectStmt = db.prepare(
    'SELECT close_price FROM daily_asset_closing_prices WHERE asset_id = ? AND price_date = ?'
  );
  const insertStmt = db.prepare(
    'INSERT INTO daily_asset_closing_prices (id, asset_id, price_date, close_price) VALUES (?, ?, ?, ?)'
  );
  const updateStmt = db.prepare(
    'UPDATE daily_asset_closing_prices SET close_price = ? WHERE asset_id = ? AND price_date = ?'
  );

  db.exec('BEGIN');
  try {
    for (const [date, close] of byDate) {
      const existing = selectStmt.get(assetId, date);
      if (existing === undefined) {
        insertStmt.run(randomUUID(), assetId, date, close);
        result.inserted++;
      } else if (existing.close_price !== close) {
        updateStmt.run(close, assetId, date);
        result.updated++;
      } else {
        result.unchanged++;
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return result;
}

/** Riepilogo per CLI: asset con storico e righe totali. */
export function dailyClosingPricesSummary() {
  return db
    .prepare(
      `SELECT
        COUNT(DISTINCT asset_id) AS assets_with_history,
        COUNT(*) AS total_rows
       FROM daily_asset_closing_prices`
    )
    .get();
}

/**
 * Candidati all'aggiornamento dei prezzi di chiusura.
 *
 * Regola di elegibilità (decisione D2): posizioni attive (quantità netta > 0)
 * per TUTTI i tipi tranne BOND; gli ex-ETF/ETC/ETN (oggi UNKNOWN) e i
 * FUND/COMMODITY sono quindi inclusi. Gli asset senza simbolo utilizzabile
 * vengono restituiti a parte: il chiamante li salta con warning senza
 * interrompere l'aggiornamento degli altri.
 *
 * Pattern SQL riusato da calculatePositions (analyticsModel), senza cache:
 * l'eleggibilità deve riflettere lo stato corrente degli ordini.
 *
 * @returns {{
 *   candidates: Array<object>,
 *   eligible: Array<object>,
 *   noSymbol: Array<object>
 * }}
 */
export function getDailyPriceCandidates() {
  const rows = db
    .prepare(
      `
      SELECT
        a.id,
        a.isin,
        a.ticker,
        a.name,
        a.currency,
        a.asset_type,
        a.exchange,
        SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) AS quantity
      FROM market_orders mo
      JOIN assets a ON a.id = mo.asset_id
      GROUP BY a.id, a.isin, a.ticker, a.name, a.currency, a.asset_type, a.exchange
      -- NB: in HAVING l'alias 'quantity' verrebbe risolto da SQLite come la colonna
      -- sorgente mo.quantity (sempre positiva), vanificando il filtro. Si ripete
      -- l'espressione aggregata per un confronto sul valore aggregato corretto.
      HAVING SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) > 0
      ORDER BY a.name ASC
    `
    )
    .all();

  const candidates = rows.filter((r) => r.asset_type !== 'BOND');
  const hasSymbol = (r) =>
    Boolean((r.exchange && r.exchange.trim()) || (r.ticker && r.ticker.trim()));
  const eligible = candidates.filter(hasSymbol);
  const noSymbol = candidates.filter((r) => !hasSymbol(r));
  return { candidates, eligible, noSymbol };
}

/**
 * Recupera le serie di prezzi di chiusura per il confronto multi-asset.
 * Include gli asset che hanno almeno due quotazioni storiche.
 *
 * @param {Object} [options]
 * @param {string|null} [options.from] - Data iniziale ISO (YYYY-MM-DD)
 * @param {string|null} [options.to] - Data finale ISO (YYYY-MM-DD)
 * @param {string[]|null} [options.assetIds] - Filtro facoltativo su ID specifici
 * @returns {{ assets: Array<object> }}
 */
export function getDailyPricesForComparison(options = {}) {
  const { from = null, to = null, assetIds = null } = options;

  let assetSql = `
    SELECT
      a.id,
      a.isin,
      a.ticker,
      a.name,
      a.asset_type AS assetType,
      a.currency,
      a.exchange,
      ord.first_order_date AS firstOrderDate,
      COALESCE(ord.quantity, 0) AS currentQuantity
    FROM assets a
    JOIN daily_asset_closing_prices p ON p.asset_id = a.id
    LEFT JOIN (
      SELECT
        asset_id,
        MIN(operation_date) AS first_order_date,
        SUM(CASE WHEN type = 'BUY' THEN quantity ELSE -quantity END) AS quantity
      FROM market_orders
      GROUP BY asset_id
    ) ord ON ord.asset_id = a.id
  `;

  const assetParams = [];
  if (Array.isArray(assetIds) && assetIds.length > 0) {
    const placeholders = assetIds.map(() => '?').join(',');
    assetSql += ` WHERE a.id IN (${placeholders})`;
    assetParams.push(...assetIds);
  }

  assetSql += `
    GROUP BY a.id, a.isin, a.ticker, a.name, a.asset_type, a.currency, a.exchange, ord.first_order_date, ord.quantity
    HAVING COUNT(p.id) >= 2
    ORDER BY a.name ASC
  `;

  const assets = db.prepare(assetSql).all(...assetParams);
  if (assets.length === 0) {
    return { assets: [] };
  }

  const selectedIds = assets.map((a) => a.id);
  const placeholders = selectedIds.map(() => '?').join(',');

  let priceSql = `
    SELECT asset_id, price_date AS date, close_price AS close
    FROM daily_asset_closing_prices
    WHERE asset_id IN (${placeholders})
  `;
  const priceParams = [...selectedIds];

  if (from) {
    priceSql += ' AND price_date >= ?';
    priceParams.push(from);
  }
  if (to) {
    priceSql += ' AND price_date <= ?';
    priceParams.push(to);
  }
  priceSql += ' ORDER BY price_date ASC';

  const prices = db.prepare(priceSql).all(...priceParams);
  const priceMap = new Map();
  for (const p of prices) {
    if (!priceMap.has(p.asset_id)) priceMap.set(p.asset_id, []);
    priceMap.get(p.asset_id).push({ date: p.date, close: p.close });
  }

  const resultAssets = [];
  for (const a of assets) {
    const assetPrices = priceMap.get(a.id) || [];
    if (assetPrices.length >= 2) {
      resultAssets.push({
        ...a,
        priceCount: assetPrices.length,
        prices: assetPrices,
      });
    }
  }

  return { assets: resultAssets };
}
