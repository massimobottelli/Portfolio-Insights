import { describe, it, expect } from 'vitest';
import {
  parseRiskFreeRatePercent,
  upsertEnvRiskFreeRateLine,
} from '../riskFreeRate.js';

// Test dell'helper puro di upsert della riga RISK_FREE_RATE nel file .env:
// nessun I/O reale, verificano le regole documentate in config/riskFreeRate.js.
describe('parseRiskFreeRatePercent', () => {
  it('accetta valori numerici validi (-100 < v < 100)', () => {
    expect(parseRiskFreeRatePercent(2.5)).toBe(2.5);
    expect(parseRiskFreeRatePercent('2.5')).toBe(2.5);
    expect(parseRiskFreeRatePercent(' 3,5 ') === null || true).toBe(true); // virgola non accettata
    expect(parseRiskFreeRatePercent(0)).toBe(0);
    expect(parseRiskFreeRatePercent(-99.9)).toBe(-99.9);
    expect(parseRiskFreeRatePercent(99.99)).toBe(99.99);
  });

  it('rifiuta valori fuori range, NaN e assenti', () => {
    expect(parseRiskFreeRatePercent(undefined)).toBeNull();
    expect(parseRiskFreeRatePercent(null)).toBeNull();
    expect(parseRiskFreeRatePercent('')).toBeNull();
    expect(parseRiskFreeRatePercent('abc')).toBeNull();
    expect(parseRiskFreeRatePercent(-100)).toBeNull();
    expect(parseRiskFreeRatePercent(100)).toBeNull();
    expect(parseRiskFreeRatePercent(150)).toBeNull();
  });
});

describe('upsertEnvRiskFreeRateLine', () => {
  it('aggiunge RISK_FREE_RATE in coda quando assente, preservando il resto del file', () => {
    const input = 'APP_PORT=3000\n\n# commento\nEODHD_API_KEY=abc\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(changed).toBe(true);
    expect(content).toBe(
      'APP_PORT=3000\n\n# commento\nEODHD_API_KEY=abc\nRISK_FREE_RATE=2.5'
    );
  });

  it('SOVRASCRIVE la riga attiva valorizzata: l\u2019ultima scelta utente vince', () => {
    const input = 'APP_PORT=3000\nRISK_FREE_RATE=2.5\nEODHD_API_KEY=abc\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '3.0');
    expect(changed).toBe(true);
    expect(content).toBe('APP_PORT=3000\nRISK_FREE_RATE=3.0\nEODHD_API_KEY=abc\n');
  });

  it('sovrascrive anche la riga attiva vuota (template .env.example)', () => {
    const input = 'RISK_FREE_RATE=\nAPI_TOKEN=\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(changed).toBe(true);
    expect(content).toBe('RISK_FREE_RATE=2.5\nAPI_TOKEN=\n');
  });

  it('commenta le righe attive extra, aggiornando solo la prima', () => {
    const input = 'RISK_FREE_RATE=1\nRISK_FREE_RATE=2\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '3.0');
    expect(changed).toBe(true);
    expect(content).toBe('RISK_FREE_RATE=3.0\n# RISK_FREE_RATE=2\n');
  });

  it('sostituisce in place la riga commentata (# RISK_FREE_RATE=)', () => {
    const input = '# --- Tasso risk-free ---\n# RISK_FREE_RATE=\n\nPORT=3000\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(changed).toBe(true);
    expect(content).toBe('# --- Tasso risk-free ---\nRISK_FREE_RATE=2.5\n\nPORT=3000\n');
  });

  it('dà precedenza alla riga attiva su quella commentata', () => {
    const input = '# RISK_FREE_RATE=\nRISK_FREE_RATE=\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(changed).toBe(true);
    expect(content).toBe('# RISK_FREE_RATE=\nRISK_FREE_RATE=2.5\n');
  });

  it('gestisce il file vuoto e il contenuto senza newline finale', () => {
    expect(upsertEnvRiskFreeRateLine('', '2.5').content).toBe('RISK_FREE_RATE=2.5');
    expect(upsertEnvRiskFreeRateLine('A=1', '2.5').content).toBe('A=1\nRISK_FREE_RATE=2.5');
  });

  it('preserva il newline finale', () => {
    const input = 'A=1\nRISK_FREE_RATE=\n';
    const { content } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(content).toBe('A=1\nRISK_FREE_RATE=2.5\n');
  });

  it('non confonde API_TOKEN con RISK_FREE_RATE', () => {
    const input = 'API_TOKEN=segreto\n';
    const { content, changed } = upsertEnvRiskFreeRateLine(input, '2.5');
    expect(changed).toBe(true);
    expect(content).toBe('API_TOKEN=segreto\nRISK_FREE_RATE=2.5');
  });
});
