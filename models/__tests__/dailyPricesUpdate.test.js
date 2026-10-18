import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB in-memory: i test NON toccano mai db/portfolio.db reale
vi.mock('../../database.js', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return { db, initializeDatabase: () => {} };
});

// Client EODHD mockato: NESSUNA chiamata di rete reale nei test
vi.mock('../../utils/eodhdService.js', () => ({
  getEodhdApiKey: vi.fn(() => 'test-key'),
  fetchEodCloseSeries: vi.fn(),
}));

import { db } from '../../database.js';
import { fetchEodCloseSeries, getEodhdApiKey } from '../../utils/eodhdService.js';
import {
  runDailyPricesUpdate,
  updateDailyPricesHandler,
  refreshAssetClosingPrices,
  refreshAssetPricesHandler,
  getAssetDailyPricesHandler,
} from '../../controllers/dailyPriceController.js';
import { countDailyClosingPrices } from '../dailyPriceModel.js';

const SCHEMA = `
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
    import_session_id TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS daily_asset_closing_prices (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    price_date TEXT NOT NULL,
    close_price REAL NOT NULL,
    UNIQUE (asset_id, price_date)
  );
`;

function resetDb() {
  db.exec('DROP TABLE IF EXISTS daily_asset_closing_prices');
  db.exec('DROP TABLE IF EXISTS market_orders');
  db.exec('DROP TABLE IF EXISTS assets');
  db.exec(SCHEMA);
}

function insertAsset({ id, isin, ticker, name = 'Test', asset_type = 'UNKNOWN', exchange = null }) {
  db.prepare(
    'INSERT INTO assets (id, isin, ticker, name, currency, asset_type, exchange) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, isin, ticker, name, 'EUR', asset_type, exchange);
}

function insertOrder(id, assetId, type, quantity) {
  db.prepare(
    `INSERT INTO market_orders
       (id, asset_id, operation_date, value_date, type, quantity, euro_amount, currency_amount, currency, order_reference, import_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    assetId,
    '2024-01-02',
    '2024-01-02',
    type,
    quantity,
    type === 'BUY' ? -100 : 100,
    null,
    'EUR',
    `REF-${id}`,
    'sess-1'
  );
}

function seedHistory(assetId, rows) {
  const stmt = db.prepare(
    'INSERT INTO daily_asset_closing_prices (id, asset_id, price_date, close_price) VALUES (?, ?, ?, ?)'
  );
  rows.forEach((r, i) => stmt.run(`seed-${assetId}-${i}`, assetId, r.date, r.close));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDb();
});

const TODAY = '2026-10-18';

describe('runDailyPricesUpdate — elegibilità', () => {
  it('include STOCK/UNKNOWN(ex-ETF)/CASH con posizione attiva; esclude BOND e posizioni a zero; segnala i senza simbolo', async () => {
    insertAsset({ id: 'stock', isin: 'IS-STOCK', ticker: 'STK', name: 'A Stock', asset_type: 'STOCK', exchange: 'STK.US' });
    insertAsset({ id: 'exetf', isin: 'IS-EXETF', ticker: 'EXF', name: 'B ExEtf', asset_type: 'UNKNOWN', exchange: 'EXF.DE' });
    insertAsset({ id: 'cash', isin: 'IS-CASH', ticker: 'CSH', name: 'C Cash', asset_type: 'CASH', exchange: 'CSH.DE' });
    insertAsset({ id: 'bond', isin: 'IS-BOND', ticker: 'BND', name: 'D Bond', asset_type: 'BOND', exchange: 'BND.MT' });
    insertAsset({ id: 'closed', isin: 'IS-CLOSED', ticker: 'CLS', name: 'E Closed', asset_type: 'STOCK', exchange: 'CLS.US' });
    insertAsset({ id: 'nosym', isin: 'IS-NOSYM', ticker: '', name: 'F NoSym', asset_type: 'UNKNOWN', exchange: null });

    insertOrder('o1', 'stock', 'BUY', 10);
    insertOrder('o2', 'exetf', 'BUY', 5);
    insertOrder('o3', 'cash', 'BUY', 3);
    insertOrder('o4', 'bond', 'BUY', 2);
    insertOrder('o5', 'closed', 'BUY', 4);
    insertOrder('o6', 'closed', 'SELL', 4);
    insertOrder('o7', 'nosym', 'BUY', 1);

    const summary = await runDailyPricesUpdate({ today: TODAY });

    expect(summary.candidates).toBe(4);
    expect(summary.eligible).toBe(3);
    expect(summary.skipped).toBe(4); // 3 no_local_history + 1 no_symbol
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
    const reasons = summary.details.map((d) => d.reason);
    expect(reasons.filter((r) => r === 'no_local_history')).toHaveLength(3);
    expect(reasons).toContain('no_symbol');
  });
});

describe('runDailyPricesUpdate — incrementalità', () => {
  it('asset senza storico locale: skip, nessuna chiamata EODHD (niente download automatico di anni)', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(summary.details[0].reason).toBe('no_local_history');
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
  });

  it('ultima quotazione già di oggi: skip already_current, nessuna chiamata', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: TODAY, close: 10 }]);
    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(summary.details[0].reason).toBe('already_current');
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
  });
});

describe('runDailyPricesUpdate — finestra e upsert', () => {
  it('finestra incrementale: from = ultima data locale − 5 giorni, to = oggi', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([
      { date: '2026-10-16', close: 11 },
      { date: '2026-10-17', close: 12 },
    ]);
    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(fetchEodCloseSeries).toHaveBeenCalledWith('T1.EX', { from: '2026-10-05', to: '2026-10-18' });
    expect(summary.rows.inserted).toBe(2);
    expect(summary.updatedAssets).toBe(1);
    expect(summary.ok).toBe(true);
  });

  it('fallback al ticker quando exchange è vuoto', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'TKR', name: 'A Asset', exchange: null });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([{ date: '2026-10-16', close: 11 }]);
    await runDailyPricesUpdate({ today: TODAY });
    expect(fetchEodCloseSeries).toHaveBeenCalledWith('TKR', { from: '2026-10-05', to: '2026-10-18' });
  });

  it('re-run idempotente: seconda esecuzione con stessi dati = solo unchanged, zero duplicati', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    const series = [
      { date: '2026-10-15', close: 11 },
      { date: '2026-10-16', close: 12 },
    ];
    fetchEodCloseSeries.mockResolvedValue(series);

    const first = await runDailyPricesUpdate({ today: TODAY });
    expect(first.rows.inserted).toBe(2);

    fetchEodCloseSeries.mockResolvedValue(series);
    const second = await runDailyPricesUpdate({ today: TODAY });
    expect(second.rows).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(countDailyClosingPrices('a1')).toBe(3); // seed + 2 nuove, nessun duplicato
  });

  it("corregge l'ultima osservazione se il provider restituisce un valore diverso", async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-16', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([{ date: '2026-10-16', close: 10.5 }]);
    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(summary.rows.updated).toBe(1);
    expect(summary.rows.inserted).toBe(0);
    expect(summary.ok).toBe(true);
  });
});

describe('runDailyPricesUpdate — isolamento errori e casi limite', () => {
  it('un asset in errore non impedisce il processo degli altri (ok: false, nessun falso successo)', async () => {
    insertAsset({ id: 'ok', isin: 'IS-OK', ticker: 'OK1', name: 'A Ok', exchange: 'OK1.EX' });
    insertAsset({ id: 'ko', isin: 'IS-KO', ticker: 'KO1', name: 'B Ko', exchange: 'KO1.EX' });
    insertOrder('o1', 'ok', 'BUY', 1);
    insertOrder('o2', 'ko', 'BUY', 1);
    seedHistory('ok', [{ date: '2026-10-10', close: 10 }]);
    seedHistory('ko', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValueOnce([{ date: '2026-10-16', close: 11 }]);
    fetchEodCloseSeries.mockRejectedValueOnce(new Error('EODHD: risposta HTTP 500 per KO1.EX'));

    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(summary.updatedAssets).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.ok).toBe(false);
    const failedDetail = summary.details.find((d) => d.status === 'failed');
    expect(failedDetail.symbol).toBe('KO1.EX');
    expect(failedDetail.error).toMatch(/HTTP 500/);
  });

  it('risposta vuota dal provider: skip no_data_from_provider, non è un errore', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([]);
    const summary = await runDailyPricesUpdate({ today: TODAY });
    expect(summary.details[0].status).toBe('skipped');
    expect(summary.details[0].reason).toBe('no_data_from_provider');
    expect(summary.failed).toBe(0);
    expect(summary.ok).toBe(true);
  });

  it('dry-run: scarica e valida ma non scrive nel database', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([{ date: '2026-10-16', close: 11 }]);
    const summary = await runDailyPricesUpdate({ today: TODAY, dryRun: true });
    expect(summary.dryRun).toBe(true);
    expect(summary.details[0].dryRun).toBe(true);
    expect(summary.details[0].wouldImport).toBe(1);
    expect(countDailyClosingPrices('a1')).toBe(1); // solo il seed: nessuna scrittura
  });

  it('filtro symbols: aggiorna solo il simbolo richiesto; simbolo sconosciuto segnalato', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertAsset({ id: 'a2', isin: 'IS2', ticker: 'T2', name: 'B Asset', exchange: 'T2.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    insertOrder('o2', 'a2', 'BUY', 1);
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    seedHistory('a2', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([{ date: '2026-10-16', close: 11 }]);

    const summary = await runDailyPricesUpdate({ today: TODAY, symbols: ['T1.EX', 'MISSING.XX'] });
    expect(fetchEodCloseSeries).toHaveBeenCalledTimes(1);
    expect(fetchEodCloseSeries).toHaveBeenCalledWith('T1.EX', expect.anything());
    expect(summary.details.some((d) => d.symbol === 'MISSING.XX' && d.reason === 'not_eligible_or_unknown_symbol')).toBe(true);
  });
});

describe('updateDailyPricesHandler (Express)', () => {
  const res = () => {
    const r = { statusCode: null, body: null };
    r.status = (code) => {
      r.statusCode = code;
      return r;
    };
    r.json = (body) => {
      r.body = body;
      return r;
    };
    return r;
  };

  it('restituisce 503 con messaggio esplicativo se EODHD_API_KEY manca', async () => {
    // getEodhdApiKey è mockato a livello di modulo: simuliamo la chiave mancante
    getEodhdApiKey.mockImplementationOnce(() => {
      throw new Error("EODHD_API_KEY non configurata. Impostala nell'ambiente prima di usare il servizio prezzi");
    });
    const r = res();
    await updateDailyPricesHandler({}, r);
    expect(r.statusCode).toBe(503);
    expect(r.body.error).toMatch(/non configurato/);
    expect(r.body.details).toMatch(/EODHD_API_KEY/);
  });

  it('restituisce 200 con il riepilogo quando il servizio è configurato', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    insertOrder('o1', 'a1', 'BUY', 1);
    fetchEodCloseSeries.mockResolvedValue([]);
    const r = res();
    await updateDailyPricesHandler({}, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body).toHaveProperty('candidates');
    expect(r.body).toHaveProperty('details');
  });
});

// Data ISO locale spostata di N giorni rispetto a oggi (per i test del GET
// handler, che calcola isCurrent con la data odierna reale del server)
function isoDateShift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

describe('refreshAssetClosingPrices (per-asset)', () => {
  it('asset già aggiornato a oggi: already_current, nessuna chiamata EODHD', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: TODAY, close: 10 }]);
    const result = await refreshAssetClosingPrices('a1', { today: TODAY });
    expect(result).toMatchObject({ ok: true, status: 'already_current', lastDate: TODAY });
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
  });

  it('aggiornamento: finestra [ultima data − overlap, oggi], upsert e nuova lastDate', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([
      { date: '2026-10-13', close: 10.5 },
      { date: '2026-10-16', close: 11 },
    ]);
    const result = await refreshAssetClosingPrices('a1', { today: TODAY, overlapDays: 5 });
    expect(fetchEodCloseSeries).toHaveBeenCalledWith('T1.EX', { from: '2026-10-05', to: '2026-10-18' });
    expect(result).toMatchObject({
      ok: true,
      status: 'updated',
      lastDate: '2026-10-16',
      rows: { inserted: 2, updated: 0, unchanged: 0 },
    });
    expect(countDailyClosingPrices('a1')).toBe(3);
  });

  it('risposta vuota del provider: no_new_data, nessuna scrittura, ok:true', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([]);
    const result = await refreshAssetClosingPrices('a1', { today: TODAY });
    expect(result).toMatchObject({ ok: true, status: 'no_new_data', lastDate: '2026-10-10' });
    expect(countDailyClosingPrices('a1')).toBe(1);
  });

  it('BOND: skipped ineligible_asset_type, nessuna chiamata EODHD', async () => {
    insertAsset({
      id: 'b1',
      isin: 'IS-B',
      ticker: 'BTP',
      name: 'B Asset',
      asset_type: 'BOND',
      exchange: 'BTP.MI',
    });
    seedHistory('b1', [{ date: '2026-10-10', close: 99 }]);
    const result = await refreshAssetClosingPrices('b1', { today: TODAY });
    expect(result).toMatchObject({ ok: false, status: 'skipped', reason: 'ineligible_asset_type' });
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
  });

  it('senza storico locale: skipped no_local_history (niente download di anni)', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    const result = await refreshAssetClosingPrices('a1', { today: TODAY });
    expect(result).toMatchObject({ ok: false, status: 'skipped', reason: 'no_local_history' });
    expect(fetchEodCloseSeries).not.toHaveBeenCalled();
  });
});

describe('refreshAssetPricesHandler (Express)', () => {
  const res = () => {
    const r = { statusCode: null, body: null };
    r.status = (code) => {
      r.statusCode = code;
      return r;
    };
    r.json = (body) => {
      r.body = body;
      return r;
    };
    return r;
  };

  it('asset inesistente → 404', async () => {
    const r = res();
    await refreshAssetPricesHandler({ params: { assetId: 'missing' } }, r);
    expect(r.statusCode).toBe(404);
    expect(r.body.error).toMatch(/Asset non trovato/);
  });

  it('senza API key → 503 con messaggio esplicativo', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: TODAY, close: 10 }]);
    getEodhdApiKey.mockImplementationOnce(() => {
      throw new Error("EODHD_API_KEY non configurata. Impostala nell'ambiente prima di usare il servizio prezzi");
    });
    const r = res();
    await refreshAssetPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(503);
    expect(r.body.error).toMatch(/non configurato/);
    expect(r.body.details).toMatch(/EODHD_API_KEY/);
  });

  it('errore del provider → 200 con ok:false e status failed (nessun falso successo)', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockRejectedValue(
      new Error('EODHD: autenticazione fallita (HTTP 401) per T1.EX')
    );
    const r = res();
    await refreshAssetPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(false);
    expect(r.body.status).toBe('failed');
    expect(r.body.error).toMatch(/autenticazione fallita/);
    expect(countDailyClosingPrices('a1')).toBe(1);
  });

  it('esito updated → 200 con ok:true, status e lastDate avanzata', async () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: '2026-10-10', close: 10 }]);
    fetchEodCloseSeries.mockResolvedValue([{ date: '2026-10-16', close: 11 }]);
    const r = res();
    await refreshAssetPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.status).toBe('updated');
    expect(r.body.lastDate).toBe('2026-10-16');
    expect(countDailyClosingPrices('a1')).toBe(2);
  });
});

describe('getAssetDailyPricesHandler — lastDate/isCurrent', () => {
  const res = () => {
    const r = { statusCode: null, body: null };
    r.status = (code) => {
      r.statusCode = code;
      return r;
    };
    r.json = (body) => {
      r.body = body;
      return r;
    };
    return r;
  };

  it('espone lastDate e isCurrent=false per quotazioni non aggiornate', () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    const yesterday = isoDateShift(-1);
    seedHistory('a1', [{ date: yesterday, close: 10 }]);
    const r = res();
    getAssetDailyPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.count).toBe(1);
    expect(r.body.lastDate).toBe(yesterday);
    expect(r.body.isCurrent).toBe(false);
  });

  it("isCurrent=true quando l'ultima quotazione è di oggi", () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    seedHistory('a1', [{ date: isoDateShift(0), close: 10 }]);
    const r = res();
    getAssetDailyPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.isCurrent).toBe(true);
  });

  it('asset senza storico: lastDate null e isCurrent=false', () => {
    insertAsset({ id: 'a1', isin: 'IS1', ticker: 'T1', name: 'A Asset', exchange: 'T1.EX' });
    const r = res();
    getAssetDailyPricesHandler({ params: { assetId: 'a1' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body.count).toBe(0);
    expect(r.body.lastDate).toBeNull();
    expect(r.body.isCurrent).toBe(false);
  });
});
