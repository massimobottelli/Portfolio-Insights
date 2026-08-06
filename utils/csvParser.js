/**
 * Parser CSV nativo per i report Directa.
 * Task T2.1 - Lettura File CSV
 *
 * Il modulo fornisce funzioni pure per il parsing dei file CSV
 * esportati da Directa, senza dipendenze esterne.
 *
 * Formato Directa:
 * - Delimitatore colonne: ';'
 * - Separatore decimale: ',' (formato italiano)
 * - Righe 1-9: metadati del report (da saltare)
 * - Riga 10: header colonne
 * - Dalla riga 11: dati movimenti
 */

// Colonne del report Directa (in ordine di apparizione nel CSV)
const COLUMNS = [
  'operationDate', // A - Data operazione
  'valueDate', // B - Data valuta
  'causale', // C - Tipo operazione
  'ticker', // D - Ticker
  'isin', // E - Isin
  'protocol', // F - Protocollo
  'description', // G - Descrizione
  'quantity', // H - Quantità
  'euroAmount', // I - Importo euro
  'currencyAmount', // J - Importo Divisa
  'currency', // K - Divisa
  'orderReference' // L - Riferimento ordine
];

// Posizione (0-based) della riga header colonne nel CSV Directa
const HEADER_ROW_INDEX = 9; // Riga 10 (1-based)
// Indice della prima riga dati (0-based)
const FIRST_DATA_ROW_INDEX = 10; // Riga 11 (1-based)

/**
 * Converte una stringa numerica in formato italiano in Number.
 * Il formato Directa usa la virgola come separatore decimale
 * e il punto come separatore migliaia.
 *
 * Esempi:
 *   "130"      -> 130
 *   "-13156,5" -> -13156.5
 *   "1.234,56" -> 1234.56
 *
 * @param {string|number} raw - Valore raw dal CSV
 * @returns {number} Numero parsato (0 se non valido/vuoto)
 */
export function parseItalianNumber(raw) {
  if (raw === undefined || raw === null) return 0;
  const str = String(raw).trim();
  if (str === '') return 0;

  // Rimuove i separatori migliaia (.) e converte la virgola decimale in punto
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = Number(cleaned);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Applica trim a una stringa.
 * @param {*} raw - Valore raw dal CSV
 * @returns {string} Stringa pulita (mai null)
 */
export function cleanString(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
}

/**
 * Applica trim e restituisce null se la stringa è vuota.
 * Utilizzato per campi opzionali (protocollo, riferimento ordine)
 * dove Directa esporta spazi vuoti quando il campo non è valorizzato.
 *
 * @param {*} raw - Valore raw dal CSV
 * @returns {string|null} Stringa pulita o null se vuota
 */
export function nullableString(raw) {
  const cleaned = cleanString(raw);
  return cleaned === '' ? null : cleaned;
}

/**
 * Estrae i metadati dall'intestazione del report (righe 1-9).
 * @param {string[]} lines - Prime righe del file CSV
 * @returns {Object} Metadati del report
 */
function parseHeader(lines) {
  const header = {
    account: '',
    extractionDate: '',
    reportType: '',
    fromDate: '',
    toDate: ''
  };

  for (const line of lines) {
    const parts = line.split(';');
    const label = cleanString(parts[0]);
    const value = cleanString(parts[1]);

    // Directa mette il valore dopo ":" nella stessa cella (es. "Conto : H4091 BOTTELLI MASSIMO")
    // Se parts[1] è vuoto, estraiamo il valore dopo ":" dalla label stessa
    const extractValue = (str) => {
      const colonIndex = str.indexOf(':');
      if (colonIndex !== -1) {
        const afterColon = str.slice(colonIndex + 1).trim();
        return afterColon || value;
      }
      return value;
    };

    if (label.startsWith('Conto')) header.account = extractValue(label);
    else if (label.startsWith('Data estrazione')) header.extractionDate = extractValue(label);
    else if (label.startsWith('Tutti i movimenti')) header.reportType = label;
    else if (label.startsWith('Dal')) header.fromDate = extractValue(label);
    else if (label.startsWith('al')) header.toDate = extractValue(label);
  }

  return header;
}

/**
 * Converte una riga CSV in un record del dominio.
 * @param {string[]} fields - Campi splittati per delimitatore
 * @returns {Object} Record normalizzato
 */
function parseRow(fields) {
  // Mappa i campi raw alle colonne del dominio
  const raw = {};
  COLUMNS.forEach((col, index) => {
    raw[col] = fields[index] !== undefined ? fields[index] : '';
  });

  return {
    operationDate: cleanString(raw.operationDate),
    valueDate: cleanString(raw.valueDate),
    causale: cleanString(raw.causale),
    ticker: cleanString(raw.ticker),
    isin: cleanString(raw.isin),
    protocol: nullableString(raw.protocol),
    description: cleanString(raw.description),
    // I numeri devono essere convertiti dal formato italiano (virgola) al formato dot
    quantity: parseItalianNumber(raw.quantity),
    euroAmount: parseItalianNumber(raw.euroAmount),
    currencyAmount: parseItalianNumber(raw.currencyAmount),
    currency: cleanString(raw.currency),
    // Il riferimento ordine è opzionale: Directa inserisce spazi vuoti quando assente
    orderReference: nullableString(raw.orderReference)
  };
}

/**
 * Determina il tipo di report Directa in base ai metadati dell'header.
 *
 * I tre report supportati sono:
 * - 'orders':    Storico movimenti (Order History)
 * - 'portfolio': Portafoglio attuale (Current Portfolio)
 * - 'history':   Storico valore portafoglio (Portfolio Value History)
 *
 * @param {Object} header - Metadati estratti dal report
 * @returns {string} Tipo di file ('orders', 'portfolio', 'history')
 */
export function detectFileType(header) {
  const reportType = header.reportType || '';

  if (reportType.includes('movimenti')) return 'orders';
  if (reportType.includes('Portafoglio')) return 'portfolio';
  if (reportType.includes('Patrimonio')) return 'history';

  // Default: report ordini (il più usato)
  return 'orders';
}

/**
 * Parser principale per i file CSV Directa.
 * Task T2.1 - Lettura File CSV
 *
 * @param {string} csvText - Contenuto testuale del file CSV
 * @returns {{ header: Object, records: Array<Object> }}
 *   header: metadati del report
 *   records: array di record normalizzati
 */
export function parseDirectaCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') {
    throw new Error('Il contenuto CSV non è valido o è vuoto');
  }

  const lines = csvText.split(/\r?\n/);

  // Estrae i metadati dalle prime righe del report
  const header = parseHeader(lines.slice(0, HEADER_ROW_INDEX));

  // Valida che l'header colonne sia presente e nella posizione attesa
  if (lines.length <= HEADER_ROW_INDEX) {
    throw new Error('File CSV malformato: header colonne mancante');
  }

  const headerFields = lines[HEADER_ROW_INDEX].split(';').map(f => f.trim());

  // Verifica che sia il formato Directa (primo campo = "Data operazione")
  if (headerFields[0] !== 'Data operazione') {
    throw new Error('File CSV non riconosciuto: header colonne non valido');
  }

  // Processa le righe dati (dalla riga 11 in poi)
  const records = [];
  for (let i = FIRST_DATA_ROW_INDEX; i < lines.length; i++) {
    const line = lines[i];

    // Salta righe vuote (es. riga finale del file)
    if (!line.trim()) continue;

    const fields = line.split(';');

    // Salta righe troppo corte o senza dati significativi
    if (fields.length < 3) continue;

    const record = parseRow(fields);

    // Ignora record senza data operazione o causale (righe non pertinenti)
    if (!record.operationDate || !record.causale) continue;

    records.push(record);
  }

  return { header, records };
}