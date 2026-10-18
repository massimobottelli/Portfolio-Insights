import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_FILE_PATH } from './loadEnv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', 'db', '.api-token');

/**
 * Gestione del token API per l'autenticazione.
 *
 * Il token viene letto dalla variabile d'ambiente API_TOKEN (che include il
 * valore caricato da .env all'avvio). Se non configurato, viene usato quello
 * salvato in db/.api-token (persistenza storica, permessi 0600); in assenza
 * viene generato un token casuale (64 caratteri hex = 256 bit di entropia).
 *
 * Il token effettivo viene riflesso anche nel file .env (riga API_TOKEN=)
 * così che il deployment self-hosted abbia tutta la configurazione in un
 * unico file: riga vuota valorizzata, riga commentata sostituita in place,
 * riga già impostata MAI sovrascritta. db/.api-token resta mantenuto per
 * retrocompatibilità (volume Docker, rollback).
 *
 * Il token NON viene mai loggato.
 */

let cachedToken = null;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function saveTokenToFile(token) {
  try {
    const dbDir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  } catch (err) {
    // Se non riusciamo a salvare il token su file, lo teniamo solo in memoria.
    // Il warning verrà stampato dal chiamante.
    console.warn(`[auth] Impossibile salvare il token su file: ${err.message}`);
  }
}

function loadTokenFromFile() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    }
  } catch {
    // File non leggibile: ignora e genera un nuovo token
  }
  return null;
}

/**
 * Helper puro (nessun I/O): ritorna il contenuto di un file .env con la riga
 * API_TOKEN aggiornata col token fornito.
 *
 * Regole:
 * - riga attiva `API_TOKEN=<valore>` già impostata → lasciata invariata
 *   (non sovrascrive mai una configurazione esplicita dell'utente);
 * - riga attiva `API_TOKEN=` vuota (es. template .env.example) → valorizzata;
 *   le eventuali altre righe attive vuote vengono commentate, così che un
 *   valore vuoto successivo non sovrascriva il token al caricamento;
 * - nessuna riga attiva ma presente `# API_TOKEN=` commentata → sostituita
 *   in place, così da non lasciare duplicati nel file;
 * - nessuna riga → aggiunta in coda;
 * - commenti, altre variabili e newline finali preservati.
 *
 * Ritorna { content, changed } dove changed indica se è stato modificato qualcosa.
 */
export function upsertEnvTokenLine(content, token) {
  const lines = content.split(/\r?\n/);
  const isActive = (l) => /^API_TOKEN\s*=/.test(l);
  const isEmptyActive = (l) =>
    isActive(l) && l.replace(/^API_TOKEN\s*=\s*/, '').trim() === '';

  // Riga attiva già valorizzata: configurazione esplicita dell'utente, non toccare.
  if (lines.some((l) => isActive(l) && !isEmptyActive(l))) {
    return { content, changed: false };
  }

  const emptyActiveIdx = lines.findIndex(isEmptyActive);
  if (emptyActiveIdx !== -1) {
    lines[emptyActiveIdx] = `API_TOKEN=${token}`;
    for (let i = 0; i < lines.length; i++) {
      if (i !== emptyActiveIdx && isEmptyActive(lines[i])) {
        lines[i] = `# ${lines[i]}`;
      }
    }
    return { content: lines.join('\n'), changed: true };
  }

  // Nessuna riga attiva: sostituisci la prima riga commentata, se presente.
  const commentIdx = lines.findIndex((l) => /^#\s*API_TOKEN\s*=/.test(l));
  if (commentIdx !== -1) {
    lines[commentIdx] = `API_TOKEN=${token}`;
    return { content: lines.join('\n'), changed: true };
  }

  // Nessuna riga: aggiungi in coda, preservando il newline finale se presente.
  const lastIdx = lines.length - 1;
  if (lines.length === 1 && lines[0] === '') {
    lines[0] = `API_TOKEN=${token}`;
  } else if (lastIdx >= 0 && lines[lastIdx] === '') {
    lines[lastIdx] = `API_TOKEN=${token}`;
  } else {
    lines.push(`API_TOKEN=${token}`);
  }
  return { content: lines.join('\n'), changed: true };
}

/**
 * Riflette il token effettivo nel file .env (riga API_TOKEN=).
 * Non fatale in caso di errore: il token resta valido in memoria e su
 * db/.api-token. Idempotente: se la riga è già valorizzata non riscrive nulla.
 */
function persistTokenToEnvFile(token) {
  try {
    const existed = fs.existsSync(ENV_FILE_PATH);
    const current = existed ? fs.readFileSync(ENV_FILE_PATH, 'utf8') : '';
    const { content, changed } = upsertEnvTokenLine(current, token);
    if (!changed) return;
    const finalContent = content.endsWith('\n') ? content : `${content}\n`;
    fs.writeFileSync(ENV_FILE_PATH, finalContent, existed ? undefined : { mode: 0o600 });
    console.log('[auth] Token API salvato anche nel file .env (riga API_TOKEN=)');
  } catch (err) {
    console.warn(`[auth] Impossibile riflettere il token in .env: ${err.message}`);
  }
}

/**
 * Restituisce il token API corrente.
 * - Se API_TOKEN è impostato nell'ambiente (shell/systemd o .env), lo usa
 *   (priorità massima) e lo riflette in .env se lì non è già presente.
 * - Altrimenti cerca un token salvato in db/.api-token (persistente tra
 *   riavvii) e lo riflette in .env.
 * - Altrimenti genera un nuovo token, lo salva su db/.api-token, lo riflette
 *   in .env e lo restituisce.
 */
export function getApiToken() {
  if (cachedToken) return cachedToken;

  const envToken = process.env.API_TOKEN;
  if (envToken && envToken.trim().length > 0) {
    cachedToken = envToken.trim();
    persistTokenToEnvFile(cachedToken);
    return cachedToken;
  }

  const fileToken = loadTokenFromFile();
  if (fileToken && fileToken.length > 0) {
    cachedToken = fileToken;
    persistTokenToEnvFile(cachedToken);
    return cachedToken;
  }

  const newToken = generateToken();
  saveTokenToFile(newToken);
  persistTokenToEnvFile(newToken);
  cachedToken = newToken;
  return cachedToken;
}

/**
 * Verifica se il token fornito è valido.
 * Usa un confronto timing-safe su hash SHA-256 per evitare timing attacks.
 */
export function isTokenValid(providedToken) {
  if (!providedToken || typeof providedToken !== 'string') return false;

  const expected = getApiToken();
  const expectedHash = crypto.createHash('sha256').update(expected).digest();
  const providedHash = crypto.createHash('sha256').update(providedToken).digest();

  return crypto.timingSafeEqual(expectedHash, providedHash);
}