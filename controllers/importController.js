import { createImportSession, getImportSessions, insertMarketOrder, insertCashMovement, insertDailySnapshot } from '../models/importModel.js';
import { upsertAsset } from '../models/assetModel.js';
import { randomUUID } from 'node:crypto';
import { parseDirectaCSV, detectFileType } from '../utils/csvParser.js';

/**
 * POST /api/import
 * Endpoint principale per l'importazione dei file CSV Directa.
 * Riceve un file CSV (come testo) e lo processa, creando automaticamente
 * gli asset, gli ordini e i movimenti di cassa necessari.
 *
 * Il body della richiesta può essere:
 * - { fileContent: "CSV text...", filename: "report.csv" } — CSV come stringa
 * - { fileType: "orders", records: [...] } — formato legacy (JSON pre-parsato)
 */
export function importFile(req, res) {
  try {
    let fileType;
    let records;
    let filename = req.body.filename || 'unknown.csv';

    // Se riceviamo fileContent, usiamo il parser CSV nativo
    if (req.body.fileContent) {
      const parsed = parseDirectaCSV(req.body.fileContent);
      fileType = detectFileType(parsed.header);
      records = parsed.records;
    } else if (req.body.fileType && Array.isArray(req.body.records)) {
      // Formato legacy: JSON pre-parsato
      fileType = req.body.fileType;
      records = req.body.records;
    } else {
      return res.status(400).json({
        error: 'Richiesta non valida',
        details: 'Sono richiesti fileContent (CSV) oppure fileType e records (array)'
      });
    }

    // Crea una sessione di import per tracciabilità
    const session = createImportSession({
      filename,
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
  // Determina se la causale richiede un Asset associato (ISIN presente nel CSV).
  // Movimenti come Bollo, Tobin tax e Conferimento NON hanno ISIN: assetId sarà null.
  const hasAsset = Boolean(record.isin);

  // Assicura che l'asset esista (lo crea se nuovo ISIN), solo quando presente
  let asset = null;
  if (hasAsset) {
    asset = upsertAsset({
      id: randomUUID(),
      isin: record.isin,
      ticker: record.ticker || '',
      name: record.description || '',
      currency: record.currency || 'EUR',
      directaCode: record.directaCode || null
    });
  }

  // Determina se è un MarketOrder o un CashMovement in base alla causale
  if (record.causale === 'Acquisto' || record.causale === 'Vendita') {
    // Un MarketOrder richiede sempre un asset valido
    if (!asset) {
      throw new Error(`MarketOrder senza ISIN (${record.operationDate})`);
    }
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

    // Per DEPOSIT il movimento non è legato a un asset specifico.
    // Per gli altri movimenti senza ISIN (Bollo, Tobin tax), assetId resta null.
    const assetId = movementType === 'DEPOSIT' ? null : (asset ? asset.id : null);

    insertCashMovement({
      assetId,
      operationDate: record.operationDate,
      valueDate: record.valueDate,
      movementType,
      euroAmount: record.euroAmount,
      currencyAmount: record.currencyAmount || null,
      currency: record.currency || 'EUR',
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
    // Mappature originali da DOMAIN_MODEL sezione 9
    'Cedola obb.': 'INTEREST',
    'Rit.cedola obb.': 'TAX',
    'Rit. etf': 'TAX',
    'Commissioni': 'COMMISSION',
    'Bollo portafoglio titoli*': 'STAMP_DUTY',
    'Conferimento con bonifico': 'DEPOSIT',

    // Nuove causali scoperte nel report Directa del 06-08-2026
    'Incasso dividendi italia': 'DIVIDEND',
    'Ritenuta dividendi italia': 'TAX',
    'Tobin tax italia': 'TAX',
    'St.rimborso obbl. a scade': 'OTHER',
    'St.rit.debito disaggio': 'OTHER',
    'Rit.debito disaggio': 'TAX',
    'Rimborso obbl. a scadenza': 'OTHER',
    'Ratei pass.obb.': 'OTHER',
    'Rit.ratei pass.obb.': 'TAX',
    'Rit.credito disaggio': 'OTHER'
  };

  return map[causale] || 'OTHER';
}
