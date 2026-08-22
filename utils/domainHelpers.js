/**
 * Helper di dominio condivisi tra i modelli.
 * Centralizza logiche di business usate in più punti del backend per
 * evitare duplicazioni che possono divergere nel tempo.
 */

/**
 * Verifica se un asset è un BTP (quotato in percentuale, quantità / 100).
 *
 * Directa quota i BTP in percentuale (es. 102.50 invece di 1.0250),
 * quindi la quantità va divisa per 100.
 *
 * NOTA: la stessa regola è applicata anche nel frontend (client/src/pages/Portfolio.tsx).
 * Se cambia il criterio di riconoscimento, aggiornare ENTRAMBI i punti.
 *
 * @param {string} name - Nome dell'asset
 * @param {string} ticker - Ticker dell'asset
 * @returns {boolean} true se è un BTP
 */
export function isBtpAsset(name, ticker) {
  return (
    (name || '').toLowerCase().includes('btp') ||
    (ticker || '').toLowerCase().includes('btp')
  );
}

/**
 * Applica la correzione BTP a una quantità: divide per 100 se l'asset è un BTP.
 * @param {string} name - Nome dell'asset
 * @param {string} ticker - Ticker dell'asset
 * @param {number} quantity - Quantità raw dal database
 * @returns {number} Quantità corretta per il display/calcoli
 */
export function correctedQuantity(name, ticker, quantity) {
  return isBtpAsset(name, ticker) ? quantity / 100 : quantity;
}