/**
 * Script di migrazione: normalizza le date in daily_portfolio_snapshots
 * dal formato M/D/YY a YYYY-MM-DD.
 *
 * Questo script converte le date esistenti nel database per garantire
 * l'ordinamento cronologico corretto nelle query ORDER BY.
 *
 * Uso: node scripts/migrate-dates.js
 */

import { db } from '../database.js';

/**
 * Normalizza una data dal formato Directa (M/D/YY) in formato ISO (YYYY-MM-DD).
 * @param {string} raw - Data in formato M/D/YY
 * @returns {string} Data normalizzata in formato YYYY-MM-DD
 */
function normalizeDate(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const str = raw.trim();
  if (!str) return str;

  const parts = str.split('/');
  if (parts.length !== 3) return str;

  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  let year = parts[2];

  if (year.length === 2) {
    year = '20' + year;
  }

  return `${year}-${month}-${day}`;
}

try {
  // Legge tutti i record con date nel vecchio formato
  const records = db
    .prepare("SELECT id, snapshot_date FROM daily_portfolio_snapshots WHERE snapshot_date LIKE '%/%'")
    .all();

  console.log(`Trovati ${records.length} record con date da normalizzare.`);

  let updatedCount = 0;
  for (const record of records) {
    const newDate = normalizeDate(record.snapshot_date);
    if (newDate !== record.snapshot_date) {
      db.prepare('UPDATE daily_portfolio_snapshots SET snapshot_date = ? WHERE id = ?').run(newDate, record.id);
      updatedCount++;
    }
  }

  console.log(`Aggiornati ${updatedCount} record.`);

  // Verifica
  const sample = db
    .prepare('SELECT id, snapshot_date FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 5')
    .all();

  console.log('\nVerifica - ultimi 5 record dopo migrazione:');
  for (const r of sample) {
    console.log(`  ${r.id}: ${r.snapshot_date}`);
  }

  // Verifica anche i primi 5
  const first = db
    .prepare('SELECT id, snapshot_date FROM daily_portfolio_snapshots ORDER BY snapshot_date ASC LIMIT 5')
    .all();

  console.log('\nVerifica - primi 5 record dopo migrazione:');
  for (const r of first) {
    console.log(`  ${r.id}: ${r.snapshot_date}`);
  }

} catch (error) {
  console.error('Errore durante la migrazione:', error.message);
  process.exit(1);
}