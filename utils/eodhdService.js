/**
 * Client EODHD per lo storico dei prezzi di chiusura giornalieri (endpoint EOD).
 *
 * Recupera SOLO `date` e `close` per simbolo e intervallo: nessun OHLC,
 * volume, dividendi, split o dati corporate action (perimetro funzionale).
 * L'API key vive solo lato server/CLI: non viene mai loggata né inclusa
 * nei messaggi di errore o negli URL stampati.
 *
 * API: GET https://eodhd.com/api/eod/{SYMBOL}?api_token=...&fmt=json&from=...&to=...
 */

import { isValidIsoDate, isValidClose } from './dailyPricesCsv.js';

const EODHD_BASE_URL = 'https://eodhd.com/api/eod';
const FETCH_TIMEOUT_MS = 15000;

/**
 * Restituisce la API key EODHD dall'ambiente, con messaggio esplicativo
 * se non configurata. La chiave non viene mai stampata.
 * @returns {string}
 * @throws se EODHD_API_KEY non è impostata
 */
export function getEodhdApiKey() {
  const apiKey = process.env.EODHD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EODHD_API_KEY non configurata. Impostala nell'ambiente prima di usare il servizio prezzi, es.:\n" +
        '  export EODHD_API_KEY="<la-tua-chiave>"\n' +
        'oppure: EODHD_API_KEY="..." node scripts/update-daily-closing-prices.js'
    );
  }
  return apiKey;
}

/**
 * Scarica la serie dei prezzi di chiusura EOD per un simbolo.
 *
 * Regole:
 * - valida status HTTP e forma del payload prima di elaborarlo
 * - gli errori del provider (payload `{ error: ... }`) diventano eccezioni esplicite
 * - una risposta vuota NON è un errore (giorno non di borsa / simbolo senza dati
 *   nel range) → restituisce []; il chiamante registrerà un warning leggibile
 * - le righe con data non ISO valida o close non finito-positivo vengono scartate
 *   con warning, senza far fallire l'intera serie
 * - il prezzo è conservato così com'è: MAI `adjusted_close`, nessuna rettifica
 *
 * @param {string} symbol - Simbolo EODHD completo (TICKER.EXCHANGE, es. "SXRS.DE")
 * @param {{ from?: string, to?: string }} [range] - Date ISO YYYY-MM-DD (inclusive)
 * @returns {Promise<Array<{date: string, close: number}>>}
 */
export async function fetchEodCloseSeries(symbol, { from, to } = {}) {
  const apiKey = getEodhdApiKey();

  const params = new URLSearchParams({ api_token: apiKey, fmt: 'json' });
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${EODHD_BASE_URL}/${encodeURIComponent(symbol)}?${params.toString()}`;

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    // L'URL contiene api_token: NON viene mai incluso nei messaggi di errore
    if (error?.name === 'TimeoutError') {
      throw new Error(`EODHD: timeout della richiesta per ${symbol} (${FETCH_TIMEOUT_MS} ms)`);
    }
    throw new Error(`EODHD: errore di rete per ${symbol}: ${error?.message ?? 'errore sconosciuto'}`);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `EODHD: autenticazione fallita (HTTP ${response.status}) per ${symbol} — verifica EODHD_API_KEY o il piano/quota`
      );
    }
    if (response.status === 429) {
      throw new Error(`EODHD: limite di quota raggiunto (HTTP 429) per ${symbol}`);
    }
    throw new Error(`EODHD: risposta HTTP ${response.status} per ${symbol}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`EODHD: JSON malformato nella risposta per ${symbol}`);
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.error) {
      throw new Error(`EODHD: errore del provider per ${symbol}: ${String(payload.error)}`);
    }
    throw new Error(`EODHD: formato di risposta inatteso per ${symbol} (oggetto invece di array)`);
  }
  if (!Array.isArray(payload)) {
    throw new Error(`EODHD: formato di risposta inatteso per ${symbol}`);
  }

  if (payload.length === 0) return [];

  const series = [];
  for (const item of payload) {
    const date = typeof item?.date === 'string' ? item.date.trim() : '';
    const close = Number(item?.close);
    if (!isValidIsoDate(date)) {
      console.warn(`⚠️  EODHD ${symbol}: riga con data non valida "${item?.date}" ignorata`);
      continue;
    }
    if (!isValidClose(close)) {
      console.warn(`⚠️  EODHD ${symbol}: riga con close non valido "${item?.close}" ignorata`);
      continue;
    }
    series.push({ date, close });
  }
  return series;
}
