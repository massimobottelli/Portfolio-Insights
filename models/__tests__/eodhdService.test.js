import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchEodCloseSeries, getEodhdApiKey } from '../../utils/eodhdService.js';

const TEST_KEY = 'test-api-key-123';

// Nessuna chiamata di rete reale: mock di globalThis.fetch
let mockFetch;

beforeEach(() => {
  vi.stubEnv('EODHD_API_KEY', TEST_KEY);
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockJsonResponse(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

describe('getEodhdApiKey', () => {
  it('restituisce la chiave quando configurata', () => {
    expect(getEodhdApiKey()).toBe(TEST_KEY);
  });

  it('errore esplicito e chiaro se la chiave manca', () => {
    vi.stubEnv('EODHD_API_KEY', '');
    expect(() => getEodhdApiKey()).toThrow(/EODHD_API_KEY/);
  });
});

describe('fetchEodCloseSeries — parsing', () => {
  it('estrae SOLO date e close, ignorando open/high/low/adjusted_close/volume', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse([
        { date: '2026-10-15', open: 149.8, high: 150.1, low: 149.5, close: 150.039, adjusted_close: 149.9, volume: 12345 },
        { date: '2026-10-16', open: 150.0, high: 150.2, low: 149.9, close: 150.07, adjusted_close: 150.0, volume: 11111 },
      ])
    );
    const series = await fetchEodCloseSeries('XEON.DE', { from: '2026-10-15', to: '2026-10-16' });
    expect(series).toEqual([
      { date: '2026-10-15', close: 150.039 },
      { date: '2026-10-16', close: 150.07 },
    ]);
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('fmt=json');
    expect(calledUrl).toContain('XEON.DE');
    expect(calledUrl).toContain('from=2026-10-15');
  });

  it('scarta le righe con data o close non validi senza far fallire la serie', async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse([
        { date: '2026-10-15', close: 150 },
        { date: '15/10/2026', close: 150 },
        { date: '2026-10-16', close: 0 },
        { date: '2026-10-17', close: -1 },
        { date: '2026-10-20', close: 151 },
      ])
    );
    const series = await fetchEodCloseSeries('XEON.DE');
    expect(series).toEqual([
      { date: '2026-10-15', close: 150 },
      { date: '2026-10-20', close: 151 },
    ]);
  });

  it('risposta vuota: NON è un errore, restituisce array vuoto', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse([]));
    const series = await fetchEodCloseSeries('XEON.DE');
    expect(series).toEqual([]);
  });
});

describe('fetchEodCloseSeries — errori', () => {
  it('chiave mancante: errore esplicito, nessuna chiamata di rete', async () => {
    vi.stubEnv('EODHD_API_KEY', '');
    await expect(fetchEodCloseSeries('XEON.DE')).rejects.toThrow(/EODHD_API_KEY/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('HTTP 401: errore di autenticazione senza leak di chiave o URL', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, { ok: false, status: 401 }));
    const err = await fetchEodCloseSeries('XEON.DE').catch((e) => e);
    expect(err.message).toMatch(/autenticazione.*401/);
    expect(err.message).not.toContain(TEST_KEY);
    expect(err.message).not.toContain('eodhd.com');
  });

  it('HTTP 500: errore generico con status, senza leak di chiave o URL', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, { ok: false, status: 500 }));
    const err = await fetchEodCloseSeries('XEON.DE').catch((e) => e);
    expect(err.message).toMatch(/HTTP 500/);
    expect(err.message).not.toContain(TEST_KEY);
    expect(err.message).not.toContain('eodhd.com');
  });

  it('HTTP 429: limite di quota segnalato', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({}, { ok: false, status: 429 }));
    await expect(fetchEodCloseSeries('XEON.DE')).rejects.toThrow(/quota.*429/);
  });

  it('JSON malformato: errore esplicito', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Unexpected token');
      },
    });
    await expect(fetchEodCloseSeries('XEON.DE')).rejects.toThrow(/JSON malformato/);
  });

  it('payload di errore del provider: eccezione con il messaggio del provider', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ error: 'Symbol not found' }));
    const err = await fetchEodCloseSeries('MISSING.XX').catch((e) => e);
    expect(err.message).toMatch(/errore del provider.*Symbol not found/);
    expect(err.message).not.toContain(TEST_KEY);
  });

  it('payload non-array senza error: formato inatteso', async () => {
    mockFetch.mockResolvedValue(mockJsonResponse({ foo: 1 }));
    await expect(fetchEodCloseSeries('XEON.DE')).rejects.toThrow(/inatteso/);
  });

  it('errore di rete: messaggio senza leak di URL', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const err = await fetchEodCloseSeries('XEON.DE').catch((e) => e);
    expect(err.message).toMatch(/errore di rete/);
    expect(err.message).not.toContain('eodhd.com');
  });

  it('timeout della richiesta: messaggio dedicato', async () => {
    const timeoutError = new Error('The operation was aborted due to timeout');
    timeoutError.name = 'TimeoutError';
    mockFetch.mockRejectedValue(timeoutError);
    await expect(fetchEodCloseSeries('XEON.DE')).rejects.toThrow(/timeout/i);
  });
});
