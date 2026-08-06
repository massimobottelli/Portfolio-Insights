import { db } from '../database.js';

/**
 * Ottiene tutti gli asset dal database.
 * @returns {Array} Lista completa degli asset
 */
export function getAllAssets() {
  return db
    .prepare('SELECT * FROM assets ORDER BY name ASC')
    .all();
}

/**
 * Cerca un asset tramite il suo ISIN.
 * @param {string} isin - Codice ISIN dell'asset
 * @returns {Object|undefined} Asset trovato o undefined
 */
export function getAssetByIsin(isin) {
  return db
    .prepare('SELECT * FROM assets WHERE isin = ?')
    .get(isin);
}

/**
 * Cerca un asset tramite il suo ID interno.
 * @param {string} id - ID interno dell'asset (UUID)
 * @returns {Object|undefined} Asset trovato o undefined
 */
export function getAssetById(id) {
  return db
    .prepare('SELECT * FROM assets WHERE id = ?')
    .get(id);
}

/**
 * Crea un nuovo asset. Se l'ISIN esiste già, aggiorna i metadati
 * (ticker, name, currency) mantenendo immutabile l'ISIN.
 * @param {Object} assetData - Dati dell'asset
 * @param {string} assetData.id - ID interno (UUID)
 * @param {string} assetData.isin - Codice ISIN
 * @param {string} assetData.ticker - Simbolo di trading
 * @param {string} assetData.name - Nome dello strumento
 * @param {string} assetData.currency - Valuta di trading
 * @param {string} [assetData.assetType='UNKNOWN'] - Tipo di asset
 * @param {string|null} [assetData.exchange=null] - Mercato di quotazione
 * @param {string|null} [assetData.directaCode=null] - Codice interno Directa
 * @returns {Object} Asset inserito o aggiornato
 */
export function upsertAsset(assetData) {
  const {
    id,
    isin,
    ticker,
    name,
    currency,
    assetType = 'UNKNOWN',
    exchange = null,
    directaCode = null
  } = assetData;

  // L'ISIN è la business key: se esiste già, aggiorniamo solo i metadati
  const existing = getAssetByIsin(isin);
  if (existing) {
    db.prepare(`
      UPDATE assets
      SET ticker = ?, name = ?, currency = ?, asset_type = ?, exchange = ?, directa_code = ?
      WHERE id = ?
    `).run(ticker, name, currency, assetType, exchange, directaCode, existing.id);
    return getAssetById(existing.id);
  }

  db.prepare(`
    INSERT INTO assets (id, isin, ticker, name, currency, asset_type, exchange, directa_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, isin, ticker, name, currency, assetType, exchange, directaCode);

  return getAssetById(id);
}