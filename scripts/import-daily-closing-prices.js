#!/usr/bin/env node
/**
 * Import one-time dello storico dei prezzi di chiusura giornalieri da CSV
 * (export EODHD o formato canonico `symbol,date,close`).
 *
 * Re-import sicuro: upsert idempotente su (asset, data), nessuna operazione
 * distruttiva implicita. Le righe non valide vengono scartate e riportate
 * senza interrompere le valide.
 *
 * Uso:
 *   node scripts/import-daily-closing-prices.js --help
 *   node scripts/import-daily-closing-prices.js --dry-run --symbol SXRS.XETRA file.csv
 *   node scripts/import-daily-closing-prices.js --symbol SXRS.XETRA file.csv
 *   node scripts/import-daily-closing-prices.js --isin IE00BDFL4P12 file.csv
 *   node scripts/import-daily-closing-prices.js canonical.csv   # richiede colonna "symbol"
 *
 * Exit codes: 0 successo completo · 1 completato con warning (righe scartate
 * o simboli non risolti) · 2 errore fatale (usage, file mancante, ecc.).
 */

import { readFileSync, existsSync } from 'node:fs';
import { initializeDatabase } from '../database.js';
import { EODHD_SYMBOLS_BY_ISIN } from '../config/eodhdSymbols.js';
import {
  resolveAssetForEodhdSymbol,
  upsertDailyClosingPrices,
  setAssetExchangeIfEmpty,
} from '../models/dailyPriceModel.js';
import { parseDailyPricesCsv } from '../utils/dailyPricesCsv.js';

const HELP = `
Import storico prezzi di chiusura (fonte EODHD) — front-loading una tantum.

Uso:
  node scripts/import-daily-closing-prices.js [opzioni] <file> [<file>...]

Opzioni:
  --symbol <SYM>   Simbolo EODHD (TICKER.EXCHANGE) per file senza colonna "symbol"
  --isin <ISIN>    Risolve l'asset via ISIN; il simbolo viene ricavato dalla
                   mappa statica config/eodhdSymbols.js quando presente
  --dry-run        Valida e risolve, ma non scrive nel database
  --help, -h       Mostra questo aiuto

Formati CSV accettati (header obbligatorio, delimitatore ',', date YYYY-MM-DD):
  - Export EODHD:  Date,Open,High,Low,Close,Volume  (estratti solo Date+Close)
  - Canonico:      symbol,date,close                (raggruppati per simbolo)

Nota: per il formato EODHD (senza colonna symbol) è richiesto --symbol o
--isin mappato; per il formato canonico --symbol viene ignorato (il simbolo
è nella colonna "symbol"). L'asset non viene mai creato automaticamente:
simboli non risolvibili → righe scartate con diagnostico.
`;

function parseArgs(argv) {
  const args = { files: [], symbol: null, isin: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--symbol') args.symbol = argv[++i];
    else if (a === '--isin') args.isin = argv[++i];
    else if (a.startsWith('--')) {
      console.error(`Opzione sconosciuta: ${a}`);
      process.exit(2);
    } else {
      args.files.push(a);
    }
  }
  return args;
}

function resolveTarget(symbol) {
  const { asset, error } = resolveAssetForEodhdSymbol(symbol);
  if (error === 'not_found') {
    return {
      asset: null,
      reason: `simbolo "${symbol}" non associato ad alcun asset (exchange/ISIN/ticker)`,
    };
  }
  if (error === 'ambiguous') {
    return {
      asset: null,
      reason: `simbolo "${symbol}" ambiguo: più asset corrispondono`,
    };
  }
  return { asset, reason: null };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }
  if (args.files.length === 0) {
    console.error('Errore: nessun file CSV fornito.\n' + HELP);
    process.exit(2);
  }

  // Inizializza il DB (crea tabelle mancanti ed esegue il backfill EODHD su
  // assets.exchange). Idempotente: safe anche se il server l'ha già fatto.
  initializeDatabase();

  let totalInserted = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalRejected = 0;
  let totalRowsRead = 0;
  const unresolvedSymbols = new Set();
  let filesOk = 0;
  let filesFailed = 0;

  for (const file of args.files) {
    console.log(`\n📄 ${file}`);
    if (!existsSync(file)) {
      console.error('   ❌ File non trovato');
      filesFailed++;
      continue;
    }

    let parsed;
    try {
      parsed = parseDailyPricesCsv(readFileSync(file, 'utf-8'));
    } catch (error) {
      console.error(`   ❌ ${error.message}`);
      filesFailed++;
      continue;
    }

    const formatLabel =
      parsed.format === 'eodhd'
        ? 'export EODHD (Date,Open,High,Low,Close,Volume) → solo Date+Close'
        : 'canonico (symbol,date,close)';
    console.log(
      `   Formato: ${formatLabel} · ${parsed.rowsRead} righe lette · ${parsed.groups.size} simboli`
    );
    if (parsed.format === 'canonical' && args.symbol) {
      console.warn('   ⚠️  --symbol ignorato per il formato canonico (simbolo dalla colonna "symbol")');
    }

    // Formato EODHD (senza colonna symbol): serve --symbol o --isin mappato
    let groups = parsed.groups;
    if (parsed.format === 'eodhd') {
      const symbol =
        args.symbol || (args.isin && EODHD_SYMBOLS_BY_ISIN[args.isin]) || null;
      if (!symbol) {
        console.error(
          '   ❌ Formato EODHD senza colonna symbol: richiesto --symbol (o --isin mappato)'
        );
        filesFailed++;
        continue;
      }
      groups = new Map([[symbol, parsed.groups.get('') || []]]);
    }

    let fileImportedSomething = false;

    for (const [symbol, rows] of groups) {
      if (rows.length === 0) continue;

      const { asset, reason } = resolveTarget(symbol);
      if (!asset) {
        console.warn(`   ⚠️  ${symbol} non risolto: ${reason} → ${rows.length} righe scartate`);
        unresolvedSymbols.add(symbol);
        totalRejected += rows.length;
        continue;
      }

      if (args.dryRun) {
        console.log(
          `   🔍 [dry-run] ${symbol} → ${asset.name} (${asset.isin}): ${rows.length} righe valide verrebbero importate`
        );
        fileImportedSomething = true;
        continue;
      }

      // Backfill assets.exchange: consolida il simbolo certificato (D1)
      setAssetExchangeIfEmpty(asset.id, symbol);

      const res = upsertDailyClosingPrices(asset.id, rows);
      totalInserted += res.inserted;
      totalUpdated += res.updated;
      totalUnchanged += res.unchanged;
      console.log(
        `   ✅ ${symbol} → ${asset.name} (${asset.isin}): ${res.inserted} inserite, ${res.updated} aggiornate, ${res.unchanged} invariate`
      );
      fileImportedSomething = true;
    }

    if (parsed.rejected.length > 0) {
      console.warn(`   ⚠️  ${parsed.rejected.length} righe scartate (prime 5):`);
      for (const r of parsed.rejected.slice(0, 5)) {
        console.warn(`      riga ${r.line}: ${r.reason}`);
      }
      if (parsed.rejected.length > 5) {
        console.warn(`      ... (${parsed.rejected.length - 5} altre)`);
      }
      totalRejected += parsed.rejected.length;
    }

    totalRowsRead += parsed.rowsRead;
    if (fileImportedSomething) filesOk++;
    else filesFailed++;
  }

  console.log('\n📊 Riepilogo import prezzi di chiusura');
  console.log(`   File elaborati: ${args.files.length} (ok: ${filesOk}, falliti: ${filesFailed})`);
  console.log(`   Righe lette: ${totalRowsRead}`);
  console.log(
    `   Righe: ${totalInserted} inserite · ${totalUpdated} aggiornate · ${totalUnchanged} invariate · ${totalRejected} scartate`
  );
  if (unresolvedSymbols.size > 0) {
    console.log(`   Simboli non risolti: ${[...unresolvedSymbols].join(', ')}`);
  }
  if (args.dryRun) {
    console.log('   (dry-run: nessuna scrittura effettuata)');
  }

  if (filesFailed === args.files.length) process.exit(2);
  if (filesFailed > 0 || totalRejected > 0 || unresolvedSymbols.size > 0) process.exit(1);
  process.exit(0);
}

main();
