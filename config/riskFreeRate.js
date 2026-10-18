import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_FILE_PATH } from './loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RATE_FILE = path.join(__dirname, '..', 'db', '.risk-free-rate');

/**
 * Tasso risk-free di default (usato dal calcolo dello Sharpe ratio).
 *
 * Risoluzione del valore effettivo (in percentuale annua, es. 2.5 = 2,5%):
 * 1. db/.risk-free-rate — ultima scelta dell'utente fatta dall'UI (persistente:
 *    in Docker vive nel volume "portfolio-data") — ha la PRECEDENZA;
 * 2. variabile d'ambiente RISK_FREE_RATE (letta UNA sola volta, alla prima
 *    occorrenza: proviene dal .env in locale o da docker compose nel container);
 * 3. DEFAULT_RISK_FREE_RATE — fallback di fabbrica se il .env non definisce la
 *    variabile.
 *
 * Quando l'utente modifica il tasso dalla pagina Rischi (PUT
 * /api/analytics/risk-free-rate), il valore viene scritto sia su
 * db/.risk-free-rate sia nella riga RISK_FREE_RATE= del file .env (quando
 * scrivibile: in Docker /app/.env non esiste e la scrittura fallisce in modo
 * NON fatale — la persistenza resta garantita dal volume su /app/db).
 *
 * Il tasso NON è un segreto: la riga nel .env viene SOVRASCRITTA dalla scelta
 * utente (a differenza di API_TOKEN, che non viene mai sovrascritta).
 */

/** Fallback di fabbrica (% annua) se il .env non definisce RISK_FREE_RATE. */
export const DEFAULT_RISK_FREE_RATE = 2.5;

let cachedPercent = null; // valore effettivo corrente (percentuale)
let envDefaultPercent = null; // valore RISK_FREE_RATE letto dall'ambiente
let envRead = false; // false = lettura dell'ambiente non ancora eseguita

/**
 * Converte un valore (stringa o numero) in percentuale valida (-100 < v < 100).
 * Ritorna il numero, oppure null se assente/invalido.
 */
export function parseRiskFreeRatePercent(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(num) || num <= -100 || num >= 100) return null;
  return num;
}

/**
 * Legge RISK_FREE_RATE dall'ambiente UNA sola volta (prima occorrenza ≈ avvio:
 * il valore non cambia durante la vita del processo, come per loadEnv.js).
 */
function readEnvDefaultPercent() {
  if (!envRead) {
    envDefaultPercent = parseRiskFreeRatePercent(process.env.RISK_FREE_RATE);
    envRead = true;
    if (envDefaultPercent !== null) {
      console.log(
        `[riskFreeRate] Default da RISK_FREE_RATE (ambiente/.env): ${envDefaultPercent}%`
      );
    }
  }
  return envDefaultPercent;
}

/** Legge l'ultima scelta utente da db/.risk-free-rate (null se assente/invalida). */
function readRateFromFile() {
  try {
    if (fs.existsSync(RATE_FILE)) {
      return parseRiskFreeRatePercent(fs.readFileSync(RATE_FILE, 'utf8').trim());
    }
  } catch {
    // File illeggibile: ignora e prosegui con la risoluzione successiva
  }
  return null;
}

/**
 * Restituisce il tasso risk-free effettivo (percentuale annua):
 * db/.risk-free-rate → RISK_FREE_RATE (ambiente) → DEFAULT_RISK_FREE_RATE.
 */
export function getRiskFreeRatePercent() {
  if (cachedPercent !== null) return cachedPercent;

  const fileRate = readRateFromFile();
  if (fileRate !== null) {
    cachedPercent = fileRate;
    return cachedPercent;
  }

  const envRate = readEnvDefaultPercent();
  cachedPercent = envRate !== null ? envRate : DEFAULT_RISK_FREE_RATE;
  return cachedPercent;
}

/**
 * Helper puro (nessun I/O): ritorna il contenuto di un file .env con la riga
 * RISK_FREE_RATE aggiornata.
 *
 * Regole (DIVERSENTI da upsertEnvTokenLine: il tasso non è un segreto, è una
 * preferenza utente e l'ultima scelta dall'UI DEVE vincere sul default):
 * - riga attiva `RISK_FREE_RATE=<qualsiasi>` → SOVRASCRITTA col nuovo valore;
 *   eventuali righe attive extra vengono commentate (evita override ambigui);
 * - nessuna riga attiva ma presente `# RISK_FREE_RATE=` commentata → sostituita
 *   in place, così da non lasciare duplicati nel file;
 * - nessuna riga → aggiunta in coda (commenti, altre variabili e newline
 *   finale preservati).
 *
 * Ritorna { content, changed }.
 */
export function upsertEnvRiskFreeRateLine(content, rateStr) {
  const lines = content.split(/\r?\n/);
  const isActive = (l) => /^RISK_FREE_RATE\s*=/.test(l);

  const activeIdxs = lines
    .map((l, i) => (isActive(l) ? i : -1))
    .filter((i) => i !== -1);
  if (activeIdxs.length > 0) {
    lines[activeIdxs[0]] = `RISK_FREE_RATE=${rateStr}`;
    for (let i = 1; i < activeIdxs.length; i++) {
      lines[activeIdxs[i]] = `# ${lines[activeIdxs[i]]}`;
    }
    return { content: lines.join('\n'), changed: true };
  }

  const commentIdx = lines.findIndex((l) => /^#\s*RISK_FREE_RATE\s*=/.test(l));
  if (commentIdx !== -1) {
    lines[commentIdx] = `RISK_FREE_RATE=${rateStr}`;
    return { content: lines.join('\n'), changed: true };
  }

  // Nessuna riga: aggiungi in coda, preservando il newline finale se presente.
  const lastIdx = lines.length - 1;
  if (lines.length === 1 && lines[0] === '') {
    lines[0] = `RISK_FREE_RATE=${rateStr}`;
  } else if (lastIdx >= 0 && lines[lastIdx] === '') {
    lines[lastIdx] = `RISK_FREE_RATE=${rateStr}`;
  } else {
    lines.push(`RISK_FREE_RATE=${rateStr}`);
  }
  return { content: lines.join('\n'), changed: true };
}

/** Riflette il tasso effettivo nel file .env (riga RISK_FREE_RATE=). Non fatale. */
function persistRateToEnvFile(rateStr) {
  try {
    const existed = fs.existsSync(ENV_FILE_PATH);
    const current = existed ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
    const { content, changed } = upsertEnvRiskFreeRateLine(current, rateStr);
    if (!changed) return true;
    const finalContent = content.endsWith('\n') ? content : `${content}\n`;
    fs.writeFileSync(ENV_FILE_PATH, finalContent, existed ? undefined : { mode: 0o600 });
    console.log('[riskFreeRate] Tasso salvato anche nel file .env (riga RISK_FREE_RATE=)');
    return true;
  } catch (err) {
    console.warn(`[riskFreeRate] Impossibile riflettere il tasso in .env: ${err.message}`);
    return false;
  }
}

/**
 * Persiste la scelta utente del tasso risk-free (percentuale):
 * 1. db/.risk-free-rate (volume Docker, permessi 0600) — persistenza garantita;
 * 2. riga RISK_FREE_RATE= nel file .env, quando scrivibile (in Docker fallisce
 *    in modo NON fatale);
 * 3. aggiorna la cache in memoria.
 *
 * Ritorna { fileSaved, envSaved }. Lancia Error se il valore è invalido
 * (validazione PRIMA di qualsiasi I/O).
 */
export function setRiskFreeRatePercent(percent) {
  const parsed = parseRiskFreeRatePercent(percent);
  if (parsed === null) {
    throw new Error('Invalid risk-free rate');
  }

  // Normalizza la rappresentazione su file (es. "2.50" → 2.5, -0 → 0)
  const rateStr = String(parsed === 0 ? 0 : parsed);

  let fileSaved = false;
  try {
    const dbDir = path.dirname(RATE_FILE);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(RATE_FILE, rateStr, { mode: 0o600 });
    fileSaved = true;
  } catch (err) {
    console.warn(`[riskFreeRate] Impossibile salvare il tasso su file: ${err.message}`);
  }

  const envSaved = persistRateToEnvFile(rateStr);
  cachedPercent = parsed;
  return { fileSaved, envSaved };
}
