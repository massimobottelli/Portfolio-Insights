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

/** Conteggio righe di storico per un asset (usato dai riepiloghi CLI). */
export function countDailyClosingPrices(assetId) {
  return db
    .prepare(
      'SELECT COUNT(*) AS count FROM daily_asset_closing_prices WHERE asset_id = ?'
    )
    .get(assetId).count;
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
