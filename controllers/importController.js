import { createImportSession, getImportSessions, insertMarketOrder, insertCashMovement, insertDailySnapshot } from '../models/importModel.js';
import { upsertAsset } from '../models/assetModel.js';
import { randomUUID } from 'node:crypto';

/**
 * POST /api/import
 * Endpoint principale per l'importazione dei file CSV Directa.
 * Riceve un file CSV e lo processa, creando automaticamente
 * gli asset, gli ordini e i movimenti di cassa necessari.
 */
export function importFile(req, res) {
  try {
    // In MVP1, gestiamo l'upload come JSON-structured data
    // In futuro: gestione multipart/form-data con busboy/multer
    const { fileType, records } = req.body;

    if (!fileType || !records || !Array.isArray(records)) {
      return res.status(400).json({
        error: 'Richiesta non valida',
        details: 'Sono richiesti fileType e records (array)'
      });
    }

    // Crea una sessione di import per tracciabilità
    const session = createImportSession({
      filename: req.body.filename || 'unknown.csv',
      status: 'SUCCESS',
      recordsImported: 0,
      errors: null
    });

    let importedCount = 0;

    // Processa i record in base al tipo di file
    for (const record of records) {
      try {
        switch (fileType) {
          case 'orders':
            processOrderRecord(record, session.id);
            break;
          case 'portfolio':
            processPortfolioRecord(record, session.id);
            break;
          case 'history':
            processHistoryRecord(record, session.id);
            break;
          default:
            throw new Error(`Tipo di file sconosciuto: ${fileType}`);
        }
        importedCount++;
      } catch (recordError) {
        console.warn(`Errore nel processare il record:`, recordError.message);
      }
    }

    // Aggiorna la sessione con il conteggio finale
    res.json({
      success: true,
      importSessionId: session.id,
      recordsImported: importedCount,
      totalRecords: records.length
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore durante l\'importazione', details: error.message });
  }
}

/**
 * GET /api/import/sessions
 * Restituisce lo storico delle sessioni di import.
 */
export function listSessions(req, res) {
  try {
    const sessions = getImportSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero delle sessioni', details: error.message });
  }
}

// --- Helper functions per il processing dei record ---

function processOrderRecord(record, sessionId) {
  // Assicura che l'asset esista (lo crea se nuovo ISIN)
  const asset = upsertAsset({
    id: randomUUID(),
    isin: record.isin,
    ticker: record.ticker || '',
    name: record.description || '',
    currency: record.currency || 'EUR',
    directaCode: record.directaCode || null
  });

  // Determina se è un MarketOrder o un CashMovement in base alla causale
  if (record.causale === 'Acquisto' || record.causale === 'Vendita') {
    insertMarketOrder({
      assetId: asset.id,
      operationDate: record.operationDate,
      valueDate: record.valueDate,
      type: record.causale === 'Acquisto' ? 'BUY' : 'SELL',
      quantity: record.quantity,
      euroAmount: record.euroAmount,
      currencyAmount: record.currencyAmount || null,
      currency: record.currency || 'EUR',
      orderReference: record.orderReference,
      importSessionId: sessionId
    });
  } else {
    // Mappa la causale Directa al MovementType
    const movementType = mapDirectaCausale(record.causale);
    insertCashMovement({
      assetId: movementType === 'DEPOSIT' ? null : asset.id,
      operationDate: record.operationDate,
      valueDate: record.valueDate,
      movementType,
      euroAmount: record.euroAmount,
      currencyAmount: record.currencyAmount || null,
      currency: 'EUR',
      protocol: record.protocol || null,
      orderReference: record.orderReference || null,
      importSessionId: sessionId
    });
  }
}

function processPortfolioRecord(record, sessionId) {
  // Crea o aggiorna l'asset
  upsertAsset({
    id: randomUUID(),
    isin: record.isin,
    ticker: record.ticker || '',
    name: record.description || '',
    currency: record.currency || 'EUR',
    directaCode: record.directaCode || null
  });
}

function processHistoryRecord(record, sessionId) {
  insertDailySnapshot({
    snapshotDate: record.date,
    portfolioValue: record.portfolioValue,
    availableCash: record.availableCash,
    investedCapital: record.investedCapital,
    importSessionId: sessionId
  });
}

/**
 * Mappa la causale in italiano dal report Directa al MovementType del dominio.
 * Corrisponde alla tabella nella sezione 9 del DOMAIN_MODEL.
 */
function mapDirectaCausale(causale) {
  const map = {
    'Cedola obb.': 'INTEREST',
    'Rit.cedola obb.': 'TAX',
    'Rit. etf': 'TAX',
    'Commissioni': 'COMMISSION',
    'Bollo portafoglio titoli*': 'STAMP_DUTY',
    'Conferimento con bonifico': 'DEPOSIT'
  };

  return map[causale] || 'OTHER';
}