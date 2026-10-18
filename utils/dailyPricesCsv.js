/**
 * Parser CSV per lo storico dei prezzi di chiusura giornalieri.
 *
 * Due formati supportati (delimitatore `,`, decimali con punto, date ISO `YYYY-MM-DD`):
 * 1. **Export EODHD**: `Date,Open,High,Low,Close,Volume` → si estraggono SOLO `Date` e `Close`
 * 2. **Canonico**:     `symbol,date,close`               → righe raggruppate per simbolo
 *
 * Non supporta (e non indovina) altri formati: righe non conformi vengono scartate.
 * Il parser NON effettua chiamate di rete né accede al DB.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * true se `str` è una data ISO valida (con validità calendariale, non solo sintassi).
 * Rifiuta 2023-02-29, 2024-13-01, ecc.
 */
export function isValidIsoDate(str) {
  if (typeof str !== 'string' || !ISO_DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/** true se `value` è un numero finito e strettamente positivo. */
export function isValidClose(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}

function splitLine(line) {
  return line.split(',').map((f) => f.trim());
}

/**
 * Parsa un CSV di prezzi in uno dei due formati supportati.
 *
 * Le righe non valide vengono scartate e riportate, senza fermare le valide.
 *
 * @param {string} text - Contenuto del file CSV
 * @returns {{
 *   format: 'eodhd'|'canonical',
 *   groups: Map<string, Array<{date: string, close: number}>>,
 *   rejected: Array<{line: number, reason: string}>,
 *   rowsRead: number
 * }}
 * Per il formato `eodhd` (senza colonna symbol) `groups` contiene una sola
 * chiave `''` (simbolo vuoto): chi importa decide quale simbolo assegnare.
 * @throws se l'header non corrisponde a nessun formato noto o il testo è vuoto
 */
export function parseDailyPricesCsv(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Contenuto CSV non valido o vuoto');
  }

  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((l) => l.trim() !== '');
  if (headerIndex === -1) throw new Error('CSV vuoto: nessuna riga');

  const header = splitLine(lines[headerIndex]).map((h) => h.toLowerCase());
  const hasDate = header.includes('date');
  const hasClose = header.includes('close');
  const hasSymbol = header.includes('symbol');

  let format;
  if (hasDate && hasClose) {
    format = hasSymbol ? 'canonical' : 'eodhd';
  } else {
    throw new Error(
      `Formato CSV non riconosciuto. Header: "${lines[headerIndex]}". ` +
        `Formati attesi: "Date,Open,High,Low,Close,Volume" (export EODHD) ` +
        `oppure "symbol,date,close" (canonico)`
    );
  }

  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');
  const symbolIdx = format === 'canonical' ? header.indexOf('symbol') : -1;

  const groups = new Map();
  const rejected = [];
  let rowsRead = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    rowsRead++;

    const fields = splitLine(line);
    const symbol = format === 'canonical' ? fields[symbolIdx] : '';
    const rawDate = fields[dateIdx];
    const rawClose = fields[closeIdx];
    const close = Number(rawClose);

    if (format === 'canonical' && !symbol) {
      rejected.push({ line: i + 1, reason: 'simbolo vuoto' });
      continue;
    }
    if (!isValidIsoDate(rawDate)) {
      rejected.push({ line: i + 1, reason: `data non valida "${rawDate}"` });
      continue;
    }
    if (!isValidClose(close)) {
      rejected.push({ line: i + 1, reason: `prezzo close non valido "${rawClose}"` });
      continue;
    }

    if (!groups.has(symbol)) groups.set(symbol, []);
    groups.get(symbol).push({ date: rawDate, close });
  }

  return { format, groups, rejected, rowsRead };
}
