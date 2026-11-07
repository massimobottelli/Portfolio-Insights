import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB in-memory: i test NON toccano mai db/portfolio.db reale
vi.mock('../../database.js', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return { db, initializeDatabase: () => {} };
});

import { db } from '../../database.js';
import { upsertAsset, getAssetByIsin } from '../assetModel.js';

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
`;

beforeEach(() => {
  db.exec('DROP TABLE IF EXISTS assets');
  db.exec(SCHEMA);
});

describe('upsertAsset — exchange preservato sugli update', () => {
  it('re-import senza exchange preserva il simbolo EODHD già certificato', () => {
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers', currency: 'EUR', exchange: 'EXUS.XETRA',
    });
    // Simula l'import di un report Directa P_TOTALE: nessun exchange fornito
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers MSCI World', currency: 'EUR',
    });
    const asset = getAssetByIsin('IE0006WW1TQ4');
    expect(asset.exchange).toBe('EXUS.XETRA');
    expect(asset.name).toBe('Xtrackers MSCI World');
  });

  it('un exchange esplicito aggiorna il valore', () => {
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers', currency: 'EUR', exchange: 'EXUS.XETRA',
    });
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers', currency: 'EUR', exchange: 'EXUS.OTHER',
    });
    expect(getAssetByIsin('IE0006WW1TQ4').exchange).toBe('EXUS.OTHER');
  });

  it('preserva anche asset_type classificato manualmente (comportamento esistente)', () => {
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers', currency: 'EUR', assetType: 'STOCK',
    });
    upsertAsset({
      id: 'a1', isin: 'IE0006WW1TQ4', ticker: 'EXUS',
      name: 'Xtrackers', currency: 'EUR',
    });
    expect(getAssetByIsin('IE0006WW1TQ4').asset_type).toBe('STOCK');
  });

  it('inserimento nuovo asset con exchange valorizzato', () => {
    upsertAsset({
      id: 'a1', isin: 'IS1', ticker: 'T1',
      name: 'New', currency: 'EUR', exchange: 'T1.EX',
    });
    expect(getAssetByIsin('IS1').exchange).toBe('T1.EX');
  });
});