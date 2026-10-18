/**
 * Controller per lo storico e l'aggiornamento dei prezzi di chiusura
 * giornalieri (fonte EODHD).
 *
 * `runDailyPricesUpdate()` è la funzione di servizio riutilizzabile
 * (framework-agnostica): è chiamata sia dall'endpoint POST /api/prices/update
 * sia dallo script CLI scripts/update-daily-closing-prices.js.
 *
 * Comportamento (per chiamata):
 * 1. determina i candidati: posizioni attive, tutti i tipi tranne BOND;
 * 2. per ogni asset eleggibile legge l'ultima quotazione locale
 *    (getLatestPriceDate);
 * 3. se non c'è storico locale → skip "no_local_history" (il backfill avviene
 *    solo via import CSV una tantum, mai download automatico di anni di dati);
 * 4. se l'ultima quotazione è già di oggi → skip "already_current";
 * 5. altrimenti interroga EODHD con assets.exchange (fallback: ticker) su una
 *    finestra [ultima data − overlap, oggi], per correggere in modo
 *    idempotente l'ultima osservazione e aggiungere le quotazioni successive;
 * 6. upsert idempotente su (asset, data): mai duplicati; i giorni di chiusura
 *    della borsa NON vengono sintetizzati; il prezzo di oggi viene salvato
 *    solo se EODHD lo restituisce come chiusura effettiva.
 *
 * Isolamento errori: un simbolo in errore non impedisce il processo degli altri.
 */

import {
  getAssetById,
  getDailyClosingPrices,
  getDailyPriceCandidates,
  getLatestPriceDate,
  upsertDailyClosingPrices,
} from '../models/dailyPriceModel.js';
import { fetchEodCloseSeries, getEodhdApiKey } from '../utils/eodhdService.js';

/** Giorni di calendario di overlap sulla data più recente già in DB. */
const OVERLAP_DAYS = 5;

/** Data odierna in formato ISO (YYYY-MM-DD), nel fuso locale del server. */
function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Aggiunge (o sottrae) giorni di calendario a una data ISO YYYY-MM-DD. */
function addDaysIso(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function detail(symbol, asset, status, extra = {}) {
  return {
    symbol,
    asset: asset
      ? {
          isin: asset.isin,
          ticker: asset.ticker,
          name: asset.name,
          assetType: asset.asset_type,
        }
      : null,
    status,
    ...extra,
  };
}

/**
 * Esegue l'aggiornamento incrementale dei prezzi di chiusura.
 *
 * @param {Object} [options]
 * @param {string} [options.today] - Data di riferimento (default: oggi, fuso locale)
 * @param {number} [options.overlapDays=5] - Giorni di calendario di overlap
 * @param {boolean} [options.dryRun=false] - Scarica e valida ma non scrive
 * @param {string[]} [options.symbols] - Filtro opzionale su simboli specifici
 * @returns {Promise<Object>} Riepilogo dell'esecuzione
 */
export async function runDailyPricesUpdate(options = {}) {
  const {
    today = todayIso(),
    overlapDays = OVERLAP_DAYS,
    dryRun = false,
    symbols = null,
  } = options;

  const { candidates, eligible, noSymbol } = getDailyPriceCandidates();

  const filtered = symbols
    ? eligible.filter((a) => symbols.includes(a.exchange || a.ticker))
    : eligible;

  const details = [];
  const rows = { inserted: 0, updated: 0, unchanged: 0 };
  let updatedAssets = 0;
  let skipped = 0;
  let failed = 0;

  // Asset candidati senza simbolo: warning esplicito, senza interrompere
  for (const asset of noSymbol) {
    details.push(detail(null, asset, 'skipped', { reason: 'no_symbol' }));
    skipped++;
  }
  // Simboli richiesti ma non eleggibili (filtro esplicito)
  if (symbols) {
    for (const symbol of symbols) {
      const found = filtered.some((a) => (a.exchange || a.ticker) === symbol);
      if (!found) {
        details.push(detail(symbol, null, 'skipped', { reason: 'not_eligible_or_unknown_symbol' }));
        skipped++;
      }
    }
  }

  for (const asset of filtered) {
    const symbol = asset.exchange || asset.ticker;

    const last = getLatestPriceDate(asset.id);
    if (!last) {
      details.push(detail(symbol, asset, 'skipped', { reason: 'no_local_history' }));
      skipped++;
      continue;
    }
    if (last >= today) {
      details.push(detail(symbol, asset, 'skipped', { reason: 'already_current', lastDate: last }));
      skipped++;
      continue;
    }

    // Finestra con overlap: include l'ultima osservazione già in DB, così un
    // eventuale correzione del provider viene applicata in modo idempotente.
    const from = addDaysIso(last, -overlapDays);
    const to = today;

    try {
      const series = await fetchEodCloseSeries(symbol, { from, to });

      if (series.length === 0) {
        // Risposta vuota ≠ errore: giorno non di borsa o simbolo senza dati
        details.push(detail(symbol, asset, 'skipped', { reason: 'no_data_from_provider', from, to }));
        skipped++;
        continue;
      }

      if (dryRun) {
        details.push(detail(symbol, asset, 'updated', { dryRun: true, wouldImport: series.length, from, to }));
        updatedAssets++;
        continue;
      }

      const res = upsertDailyClosingPrices(asset.id, series);
      rows.inserted += res.inserted;
      rows.updated += res.updated;
      rows.unchanged += res.unchanged;
      details.push(detail(symbol, asset, 'updated', { from, to, ...res }));
      updatedAssets++;
    } catch (error) {
      // Isolamento: l'errore di un singolo simbolo non blocca gli altri
      details.push(detail(symbol, asset, 'failed', { error: error.message, from, to }));
      failed++;
    }
  }

  return {
    ok: failed === 0,
    runDate: today,
    dryRun,
    candidates: candidates.length,
    eligible: eligible.length,
    updatedAssets,
    skipped,
    failed,
    rows,
    details,
  };
}

/**
 * POST /api/prices/update — aggiornamento incrementale prezzi di chiusura.
 *
 * Risposte:
 * - 503 se EODHD_API_KEY non è configurata (problema di configurazione)
 * - 200 con riepilogo completo quando l'orchestrazione è stata eseguita
 *   (ok: false nel body se ci sono asset in errore — nessun falso successo)
 * - 500 solo per errori inattesi interni
 */
export async function updateDailyPricesHandler(req, res) {
  try {
    getEodhdApiKey();
  } catch (error) {
    return res.status(503).json({
      error: 'Servizio prezzi EODHD non configurato',
      details: error.message,
    });
  }

  try {
    const summary = await runDailyPricesUpdate();
    res.status(200).json(summary);
  } catch (error) {
    console.error('Daily prices update error:', error);
    res.status(500).json({ error: "Errore durante l'aggiornamento dei prezzi" });
  }
}

/**
 * GET /api/prices/asset/:assetId — storico prezzi di chiusura di un asset.
 *
 * Lettura pura dalla tabella `daily_asset_closing_prices` (nessuna chiamata
 * esterna, nessuna quota API consumata): serve al grafico "Storico Quotazioni"
 * nella pagina di dettaglio asset.
 *
 * Risposte:
 * - 404 se l'asset non esiste
 * - 200 con { assetId, asset, count, prices: [{ date, close }] } altrimenti
 *   (count può essere 0 per asset senza storico, es. BTP/cash)
 */
export function getAssetDailyPricesHandler(req, res) {
  const { assetId } = req.params;
  try {
    const asset = getAssetById(assetId);
    if (!asset) {
      return res.status(404).json({ error: 'Asset non trovato' });
    }
    const prices = getDailyClosingPrices(assetId);
    res.status(200).json({
      assetId,
      asset: {
        id: asset.id,
        isin: asset.isin,
        ticker: asset.ticker,
        name: asset.name,
        currency: asset.currency,
        assetType: asset.asset_type,
      },
      count: prices.length,
      prices,
    });
  } catch (error) {
    console.error('Daily prices fetch error:', error);
    res.status(500).json({ error: "Errore nel recupero dello storico prezzi" });
  }
}
