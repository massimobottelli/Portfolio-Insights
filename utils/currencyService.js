/**
 * Servizio tassi di cambio valuta basato su ECB Data Portal SDMX 2.1 API.
 *
 * Il tasso di cambio viene recuperato on-demand da ECB e cachato in memoria
 * per la giornata corrente. Non c'è persistenza nel database: il cambio
 * serve sempre e solo per "oggi".
 *
 * API ECB: https://data-api.ecb.europa.eu/service/data/EXR/D.{CURRENCY}.EUR.SP00.A
 * Il valore OBS_VALUE è "unità di valuta per 1 EUR" (es. 1.1555 USD = 1 EUR).
 * Per convertire USD → EUR: eur = usd / rate.
 */

const ECB_BASE_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';

// Cache in memoria: Map<currency, { rate, date }>
// Il tasso viene invalidato quando la data cambia.
const cache = new Map();

/**
 * Restituisce la data odierna in formato ISO (YYYY-MM-DD).
 * @returns {string}
 */
export function getToday() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Recupera il tasso di cambio più recente da ECB per una valuta.
 *
 * ECB pubblica i tassi solo nei giorni lavorativi: se oggi non c'è dato
 * (weekend, festività), recupera gli ultimi 7 giorni e usa il più recente.
 *
 * @param {string} currency - Codice valuta ISO 4217 (es. 'USD')
 * @returns {Promise<number>} Unità di valuta per 1 EUR
 */
async function fetchRateFromECB(currency) {
  const today = getToday();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  const startStr = startDate.toISOString().split('T')[0];

  const url = `${ECB_BASE_URL}/D.${currency}.EUR.SP00.A?format=csvdata&startPeriod=${startStr}&endPeriod=${today}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ECB API HTTP ${response.status}`);
  }

  const text = await response.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) {
    throw new Error('ECB API: nessun dato disponibile');
  }

  const header = lines[0].split(',');
  const obsValueIndex = header.indexOf('OBS_VALUE');
  if (obsValueIndex === -1) {
    throw new Error('ECB API: colonna OBS_VALUE non trovata');
  }

  const lastLine = lines[lines.length - 1].split(',');
  const rate = parseFloat(lastLine[obsValueIndex]);
  if (isNaN(rate) || rate <= 0) {
    throw new Error('ECB API: tasso non valido');
  }

  return rate;
}

/**
 * Ottiene il tasso di cambio odierno per una valuta.
 * - EUR → 1 (identity, nessuna chiamata API)
 * - Cache in memoria per la giornata corrente
 * - Fallback: se ECB non risponde, usa l'ultimo tasso in cache
 *
 * @param {string} currency - Codice valuta ISO 4217 (es. 'USD')
 * @returns {Promise<number|null>} Unità di valuta per 1 EUR, o null se non disponibile
 */
export async function getExchangeRate(currency) {
  if (!currency || currency === 'EUR') return 1;

  const today = getToday();
  const cached = cache.get(currency);

  if (cached && cached.date === today) {
    return cached.rate;
  }

  try {
    const rate = await fetchRateFromECB(currency);
    cache.set(currency, { rate, date: today });
    return rate;
  } catch (error) {
    if (cached) {
      console.warn(`[currencyService] ECB non raggiungibile per ${currency}, uso tasso in cache: ${cached.rate}`);
      return cached.rate;
    }
    console.error(`[currencyService] Errore nel recupero del tasso ${currency}:`, error.message);
    return null;
  }
}

/**
 * Converte un importo in EUR usando il tasso di cambio odierno.
 * @param {number|null|undefined} amount - Importo nella valuta originale
 * @param {string} currency - Codice valuta ISO 4217
 * @returns {Promise<number|null>} Importo in EUR, o null se conversione non disponibile
 */
export async function convertToEUR(amount, currency) {
  if (amount === null || amount === undefined) return null;
  if (!currency || currency === 'EUR') return amount;
  const rate = await getExchangeRate(currency);
  if (rate === null || rate === 0) return null;
  return amount / rate;
}

/**
 * Ottiene i tassi di cambio per un insieme di valute.
 * @param {string[]} currencies - Lista di codici valuta
 * @returns {Promise<{date: string, rates: Object<string, number>}>}
 */
export async function getRatesForCurrencies(currencies) {
  const unique = [...new Set(currencies.filter(c => c && c !== 'EUR'))];
  const rates = { EUR: 1 };
  for (const currency of unique) {
    const rate = await getExchangeRate(currency);
    if (rate !== null) {
      rates[currency] = rate;
    }
  }
  return { date: getToday(), rates };
}