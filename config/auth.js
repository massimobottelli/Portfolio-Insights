import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_FILE = path.join(__dirname, '..', 'db', '.api-token');

/**
 * Gestione del token API per l'autenticazione.
 *
 * Il token viene letto dalla variabile d'ambiente API_TOKEN.
 * Se non configurato, viene generato automaticamente un token casuale
 * (64 caratteri hex = 256 bit di entropia) e salvato in db/.api-token
 * con permessi 0600 (leggibile solo dall'utente di servizio).
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
 * Restituisce il token API corrente.
 * - Se API_TOKEN è impostato nell'ambiente, lo usa (priorità massima).
 * - Altrimenti cerca un token salvato in db/.api-token (persistente tra riavvii).
 * - Altrimenti genera un nuovo token, lo salva su file e lo restituisce.
 */
export function getApiToken() {
  if (cachedToken) return cachedToken;

  const envToken = process.env.API_TOKEN;
  if (envToken && envToken.trim().length > 0) {
    cachedToken = envToken.trim();
    return cachedToken;
  }

  const fileToken = loadTokenFromFile();
  if (fileToken && fileToken.length > 0) {
    cachedToken = fileToken;
    return cachedToken;
  }

  const newToken = generateToken();
  saveTokenToFile(newToken);
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