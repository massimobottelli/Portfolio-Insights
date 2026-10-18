/**
 * Caricamento del file .env (git-ignored) indipendente dal modo in cui il
 * processo viene avviato: npm start/dev/prices:update (flag --env-file-if-exists),
 * `node server.js` diretto, `node scripts/...` diretto, systemd
 * (`ExecStart=/usr/bin/node server.js`).
 *
 * Regole:
 * - Il percorso è risolto dalla ROOT DEL PROGETTO (non da process.cwd()), come
 *   fa database.js: systemd/cron possono partire da una cwd diversa.
 * - Le variabili già definite nella shell hanno la PRECEDENZA: process.loadEnvFile
 *   non sovrascrive i valori esistenti in process.env (stessa semantica del flag).
 * - Se il file non esiste o non è leggibile, si prosegue con l'ambiente esistente:
 *   EODHD resta semplicemente "non configurato" (503 esplicativo), nessun blocco.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(projectRoot, '.env');

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // File malformato o illeggibile: non è fatale, si prosegue senza .env
  }
}

/** Percorso assoluto del file .env del progetto (usato da config/auth.js). */
export const ENV_FILE_PATH = envPath;