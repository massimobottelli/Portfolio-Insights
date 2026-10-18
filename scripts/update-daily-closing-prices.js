#!/usr/bin/env node
/**
 * Aggiornamento incrementale dei prezzi di chiusura (EODHD) da CLI.
 *
 * Equivale alla chiamata POST /api/prices/update: per ogni asset eleggibile
 * con storico locale scarica da EODHD le quotazioni successive all'ultima
 * presente (overlap di 5 giorni per la correzione idempotente) e le salva
 * con upsert idempotente su (asset, data).
 *
 * Uso:
 *   EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js [opzioni]
 *
 * Opzioni:
 *   --dry-run       Scarica e valida ma non scrive nel database
 *   --symbol <SYM>  Aggiorna solo il simbolo indicato (TICKER.EXCHANGE)
 *   --help, -h      Mostra questo aiuto
 *
 * Exit codes: 0 successo completo · 1 completato con fallimenti parziali ·
 * 2 fatale (EODHD_API_KEY mancante o errore interno).
 */

import { runDailyPricesUpdate } from '../controllers/dailyPriceController.js';

function parseArgs(argv) {
  const args = { dryRun: false, symbol: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--symbol') args.symbol = argv[++i];
    else if (a.startsWith('--')) {
      console.error(`Opzione sconosciuta: ${a}`);
      process.exit(2);
    } else {
      console.error(`Argomento inatteso: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function printSummary(summary) {
  console.log(
    `\n📊 Riepilogo aggiornamento prezzi (${summary.runDate})${summary.dryRun ? ' — DRY-RUN' : ''}`
  );
  console.log(
    `   Candidati: ${summary.candidates} · Eleggibili: ${summary.eligible} · ` +
      `Aggiornati: ${summary.updatedAssets} · Saltati: ${summary.skipped} · Falliti: ${summary.failed}`
  );
  console.log(
    `   Righe: ${summary.rows.inserted} inserite · ${summary.rows.updated} aggiornate · ${summary.rows.unchanged} invariate`
  );
  for (const d of summary.details) {
    const label = d.symbol || '(senza simbolo)';
    if (d.status === 'updated') {
      const counts = d.dryRun
        ? `${d.wouldImport} righe verrebbero importate`
        : `${d.inserted} inserite · ${d.updated} aggiornate · ${d.unchanged} invariate`;
      console.log(`   ✅ ${label}: ${counts} [${d.from} → ${d.to}]`);
    } else if (d.status === 'skipped') {
      console.log(`   ⏭️  ${label}: saltato (${d.reason})`);
    } else {
      console.log(`   ❌ ${label}: ${d.error}`);
    }
  }
  console.log(`   Esito: ${summary.ok ? 'OK' : 'COMPLETATO CON ERRORI'}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Uso: EODHD_API_KEY="<chiave>" node scripts/update-daily-closing-prices.js [--dry-run] [--symbol <SYM>]\n' +
        'Aggiorna i prezzi di chiusura giornalieri degli asset eleggibili con storico locale.'
    );
    process.exit(0);
  }

  try {
    const summary = await runDailyPricesUpdate({
      dryRun: args.dryRun,
      symbols: args.symbol ? [args.symbol] : null,
    });
    printSummary(summary);
    process.exit(summary.ok ? 0 : 1);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(2);
  }
}

main();
