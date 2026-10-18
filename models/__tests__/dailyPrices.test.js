import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB in-memory: i test NON toccano mai db/portfolio.db reale.
// Il mock sostituisce l'istanza di database.js con una connessione :memory:
// condivisa da tutti i moduli che la importano in questo file di test.
vi.mock('../../database.js', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return { db, initializeDatabase: () => {} };
});

import { db } from '../../database.js';
import {
  resolveAssetForEodhdSymbol,
  upsertDailyClosingPrices,
  getLatestPriceDate,
  setAssetExchangeIfEmpty,
  countDailyClosingPrices,
  getAssetById,
  getDailyClosingPrices,
} from '../dailyPriceModel.js';
import {
  parseDailyPricesCsv,
  isValidIsoDate,
  isValidClose,
} from '../../utils/dailyPricesCsv.js';

// Schema minimo necessario ai test (equivalente alle tabelle reali)
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
  db.exec('DROP TABLE IF EXISTS assets');
  db.exec(SCHEMA);
}

function insertAsset({ id, isin, ticker, name = 'Test', currency = 'EUR', asset_type = 'UNKNOWN', exchange = null }) {
  db.prepare(
    'INSERT INTO assets (id, isin, ticker, name, currency, asset_type, exchange) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, isin, ticker, name, currency, asset_type, exchange);
}

beforeEach(() => resetDb());

describe('parseDailyPricesCsv', () => {
  it('formato EODHD: estrae SOLO date e close, ignora OHLC/volume', () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '2024-03-14,28.7,28.73,28.42,28.43,703',
      '2024-03-15,28.46,28.46,28.45,28.45,111',
    ].join('\n');
    const { format, groups } = parseDailyPricesCsv(csv);
    expect(format).toBe('eodhd');
    expect(groups.get('')).toEqual([
      { date: '2024-03-14', close: 28.43 },
      { date: '2024-03-15', close: 28.45 },
    ]);
  });

  it('formato canonico: raggruppa le righe per simbolo', () => {
    const csv = 'symbol,date,close\nA,2024-01-02,10\nB,2024-01-02,20\nA,2024-01-03,11';
    const { format, groups } = parseDailyPricesCsv(csv);
    expect(format).toBe('canonical');
    expect(groups.get('A')).toHaveLength(2);
    expect(groups.get('B')).toHaveLength(1);
  });

  it('righe non valide scartate senza fermare le valide', () => {
    const csv = [
      'Date,Open,High,Low,Close,Volume',
      '2024-01-02,10,10,10,10,100',
      '2024-13-01,10,10,10,10,100',
      '2024-01-03,10,10,10,0,100',
      '2024-01-04,10,10,10,NaN,100',
      '2024-01-05,10,10,10,11,100',
    ].join('\n');
    const { groups, rejected } = parseDailyPricesCsv(csv);
    expect(groups.get('')).toHaveLength(2);
    expect(rejected).toHaveLength(3);
    expect(rejected.map((r) => r.reason).join(' ')).toMatch(/data non valida/);
    expect(rejected.map((r) => r.reason).join(' ')).toMatch(/prezzo close non valido/);
  });

  it('header non riconosciuto o testo vuoto: throw con diagnostico', () => {
    expect(() => parseDailyPricesCsv('Foo,Bar,Baz\n1,2,3')).toThrow(/non riconosciuto/);
    expect(() => parseDailyPricesCsv('')).toThrow();
    expect(() => parseDailyPricesCsv(null)).toThrow();
  });
});

describe('isValidIsoDate', () => {
  it('accetta date ISO valide (incluso anno bisestile)', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
    expect(isValidIsoDate('2024-12-31')).toBe(true);
  });
  it('rifiuta date non valide', () => {
    expect(isValidIsoDate('2023-02-29')).toBe(false);
    expect(isValidIsoDate('2024-13-01')).toBe(false);
    expect(isValidIsoDate('not-a-date')).toBe(false);
    expect(isValidIsoDate('01/02/2024')).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });
});

describe('isValidClose', () => {
  it('accetta numeri finiti e positivi', () => {
    expect(isValidClose(10)).toBe(true);
    expect(isValidClose(0.001)).toBe(true);
    expect(isValidClose('12.34')).toBe(true);
  });
  it('rifiuta zero, negativi, NaN, Infinity, stringhe non numeriche', () => {
    expect(isValidClose(0)).toBe(false);
    expect(isValidClose(-1)).toBe(false);
    expect(isValidClose(NaN)).toBe(false);
    expect(isValidClose(Infinity)).toBe(false);
    expect(isValidClose('abc')).toBe(false);
    expect(isValidClose(null)).toBe(false);
  });
});

describe('resolveAssetForEodhdSymbol', () => {
  it('risolve via assets.exchange (priorità 1)', () => {
    insertAsset({ id: 'a1', isin: 'IE00BDFL4P12', ticker: 'X.SXRS', exchange: 'SXRS.DE' });
    const { asset, error } = resolveAssetForEodhdSymbol('SXRS.DE');
    expect(error).toBeNull();
    expect(asset.id).toBe('a1');
  });

  it('risolve via ISIN della mappa statica quando exchange è vuoto (priorità 2)', () => {
    insertAsset({ id: 'a2', isin: 'IE00BFMXXD54', ticker: 'VUAA', exchange: null });
    const { asset, error } = resolveAssetForEodhdSymbol('VUAA.DE');
    expect(error).toBeNull();
    expect(asset.id).toBe('a2');
  });

  it('risolve via ticker esatto univoco (priorità 3)', () => {
    insertAsset({ id: 'a3', isin: 'XX0000000001', ticker: 'UNIQUE', exchange: null });
    const { asset, error } = resolveAssetForEodhdSymbol('UNIQUE');
    expect(error).toBeNull();
    expect(asset.id).toBe('a3');
  });

  it('not_found per simbolo senza corrispondenze', () => {
    const { asset, error } = resolveAssetForEodhdSymbol('MISSING.XX');
    expect(asset).toBeNull();
    expect(error).toBe('not_found');
  });

  it('ambiguous se più asset condividono lo stesso ticker', () => {
    insertAsset({ id: 'a4', isin: 'XX0000000002', ticker: 'DUP' });
    insertAsset({ id: 'a5', isin: 'XX0000000003', ticker: 'DUP' });
    const { asset, error } = resolveAssetForEodhdSymbol('DUP');
    expect(asset).toBeNull();
    expect(error).toBe('ambiguous');
  });
});

describe('upsertDailyClosingPrices', () => {
  it('inserisce nuove righe e conteggia correttamente', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    const res = upsertDailyClosingPrices('a1', [
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-03', close: 11 },
    ]);
    expect(res).toEqual({ inserted: 2, updated: 0, unchanged: 0 });
    expect(countDailyClosingPrices('a1')).toBe(2);
  });

  it('re-import idempotente: nessun duplicato, solo unchanged', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    const rows = [
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-03', close: 11 },
    ];
    upsertDailyClosingPrices('a1', rows);
    const second = upsertDailyClosingPrices('a1', rows);
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 2 });
    expect(countDailyClosingPrices('a1')).toBe(2);
  });

  it("corregge il prezzo dell'ultima osservazione se cambia", () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    upsertDailyClosingPrices('a1', [{ date: '2024-01-02', close: 10 }]);
    const res = upsertDailyClosingPrices('a1', [{ date: '2024-01-02', close: 10.5 }]);
    expect(res).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    expect(getLatestPriceDate('a1')).toBe('2024-01-02');
  });

  it("righe duplicate nello stesso input: l'ultima vince", () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    const res = upsertDailyClosingPrices('a1', [
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-02', close: 11 },
    ]);
    expect(res.inserted).toBe(1);
    expect(countDailyClosingPrices('a1')).toBe(1);
    const stored = db
      .prepare('SELECT close_price FROM daily_asset_closing_prices WHERE asset_id = ? AND price_date = ?')
      .get('a1', '2024-01-02');
    expect(stored.close_price).toBe(11);
  });

  it('input vuoto o non array: risultato a zero', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    expect(upsertDailyClosingPrices('a1', [])).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
    expect(upsertDailyClosingPrices('a1', null)).toEqual({ inserted: 0, updated: 0, unchanged: 0 });
  });
});

describe('getLatestPriceDate / setAssetExchangeIfEmpty', () => {
  it('getLatestPriceDate restituisce la data massima o null', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    expect(getLatestPriceDate('a1')).toBeNull();
    upsertDailyClosingPrices('a1', [
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-10', close: 12 },
      { date: '2024-01-05', close: 11 },
    ]);
    expect(getLatestPriceDate('a1')).toBe('2024-01-10');
  });

  it('setAssetExchangeIfEmpty imposta exchange solo se vuoto (mai sovrascrittura)', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1', exchange: null });
    expect(setAssetExchangeIfEmpty('a1', 'TICKER.EX')).toBe(true);
    expect(db.prepare('SELECT exchange FROM assets WHERE id = ?').get('a1').exchange).toBe('TICKER.EX');
    expect(setAssetExchangeIfEmpty('a1', 'OTHER.XX')).toBe(false);
    expect(db.prepare('SELECT exchange FROM assets WHERE id = ?').get('a1').exchange).toBe('TICKER.EX');
  });
});

describe('getAssetById / getDailyClosingPrices', () => {
  it('getAssetById restituisce i metadati essenziali o null se assente', () => {
    expect(getAssetById('missing')).toBeNull();
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1', name: 'Test Fund', currency: 'EUR', asset_type: 'FUND' });
    const asset = getAssetById('a1');
    expect(asset).toEqual({
      id: 'a1',
      isin: 'XX1',
      ticker: 'T1',
      name: 'Test Fund',
      currency: 'EUR',
      asset_type: 'FUND',
    });
  });

  it('getDailyClosingPrices restituisce la serie in ordine cronologico (date+close)', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    // Inserimento in ordine NON cronologico: la lettura deve ordinare ASC
    upsertDailyClosingPrices('a1', [
      { date: '2024-01-10', close: 12 },
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-05', close: 11 },
    ]);
    expect(getDailyClosingPrices('a1')).toEqual([
      { date: '2024-01-02', close: 10 },
      { date: '2024-01-05', close: 11 },
      { date: '2024-01-10', close: 12 },
    ]);
  });

  it('getDailyClosingPrices restituisce array vuoto per asset senza storico', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    expect(getDailyClosingPrices('a1')).toEqual([]);
  });

  it('getDailyClosingPrices isola gli asset: nessuna riga di un altro asset', () => {
    insertAsset({ id: 'a1', isin: 'XX1', ticker: 'T1' });
    insertAsset({ id: 'a2', isin: 'XX2', ticker: 'T2' });
    upsertDailyClosingPrices('a1', [{ date: '2024-01-02', close: 10 }]);
    upsertDailyClosingPrices('a2', [{ date: '2024-01-02', close: 20 }]);
    expect(getDailyClosingPrices('a1')).toEqual([{ date: '2024-01-02', close: 10 }]);
    expect(getDailyClosingPrices('a2')).toEqual([{ date: '2024-01-02', close: 20 }]);
  });
});
