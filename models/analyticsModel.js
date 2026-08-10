import { db } from '../database.js';

/**
 * Calcola la liquidità corrente leggendo il campo available_cash
 * dall'ultimo snapshot Directa (daily_portfolio_snapshots).
 * @returns {number} Saldo di cassa corrente
 */
export function calculateCashBalance() {
  const result = db
    .prepare('SELECT available_cash FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1')
    .get();
  return result ? result.available_cash : 0;
}

/**
 * Calcola il capitale investito totale (somma di tutti i DEPOSIT).
 * @returns {number} Capitale investito totale
 */
export function calculateInvestedCapital() {
  const result = db
    .prepare("SELECT COALESCE(SUM(euro_amount), 0) AS total FROM cash_movements WHERE movement_type = 'DEPOSIT'")
    .get();
  return result.total;
}

/**
 * Calcola le posizioni correnti: per ogni asset, la quantità netta
 * derivante dalla somma di tutti i MarketOrder (BUY = +qty, SELL = -qty).
 * Include prezzo corrente e prezzo medio di carico dalla tabella asset_prices.
 * @returns {Array} Posizioni attive (solo quantità > 0)
 */
export function calculatePositions() {
  return db
    .prepare(`
      SELECT
        a.id AS asset_id,
        a.isin,
        a.ticker,
        a.name,
        a.currency,
        a.asset_type,
        SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) AS quantity,
        ap.current_price AS current_price,
        ap.average_price AS average_price,
        ap.extraction_date AS price_date
      FROM market_orders mo
      JOIN assets a ON a.id = mo.asset_id
      LEFT JOIN (
        SELECT asset_id, current_price, average_price, extraction_date
        FROM asset_prices
        WHERE (asset_id, extraction_date) IN (
          SELECT asset_id, MAX(extraction_date)
          FROM asset_prices
          GROUP BY asset_id
        )
      ) ap ON ap.asset_id = a.id
      GROUP BY a.id, a.isin, a.ticker, a.name, a.currency, a.asset_type, ap.current_price, ap.average_price, ap.extraction_date
      HAVING quantity > 0
      ORDER BY a.name ASC
    `)
    .all();
}

/**
 * Ottiene la data di estrazione più recente dalla tabella asset_prices.
 * @returns {string|null} Data di estrazione più recente o null se non ci sono prezzi
 */
export function getLatestPriceDate() {
  const result = db
    .prepare('SELECT extraction_date FROM asset_prices ORDER BY extraction_date DESC LIMIT 1')
    .get();
  return result ? result.extraction_date : null;
}

/**
 * Verifica se l'asset è un BTP, che richiede la divisione della quantità per 100
 * perché Directa quota i BTP in percentuale (es. 102.50 invece di 1.0250).
 * @param {Object} pos Posizione
 * @returns {boolean} true se è un BTP
 */
const isBtp = (pos) =>
  pos.name.toLowerCase().includes('btp') || pos.ticker.toLowerCase().includes('btp');

/**
 * Calcola l'allocazione percentuale del portafoglio.
 * Per ogni posizione attiva, calcola il peso percentuale basato sul valore di mercato
 * (quantità × prezzo corrente), con la correzione BTP (quantità / 100).
 * @returns {Array} Posizioni con percentuale di allocazione
 */
export function calculateAllocation() {
  const positions = calculatePositions();

  // Trasforma le quantità (BTP / 100) e calcola il valore di mercato
  // Esclude gli asset senza prezzo corrente (current_price null)
  const enriched = positions
    .filter(p => p.current_price !== null)
    .map(p => {
      const quantity = isBtp(p) ? p.quantity / 100 : p.quantity;
      const marketValue = quantity * p.current_price;
      return { ...p, quantity, marketValue };
    })
    // Ordina per valore di mercato decrescente
    .sort((a, b) => b.marketValue - a.marketValue);

  const totalMarketValue = enriched.reduce((sum, p) => sum + p.marketValue, 0);

  if (totalMarketValue === 0) return [];

  return enriched.map(p => ({
    ...p,
    allocationPercent: parseFloat(((p.marketValue / totalMarketValue) * 100).toFixed(2))
  }));
}

/**
 * Ottiene lo snapshot di portafoglio più recente.
 * @returns {Object|undefined} Ultimo snapshot disponibile
 */
export function getLatestSnapshot() {
  return db
    .prepare('SELECT * FROM daily_portfolio_snapshots ORDER BY snapshot_date DESC LIMIT 1')
    .get();
}

/**
 * Calcola il totale cumulativo dei depositi per ogni data di snapshot.
 * 
 * Per ogni snapshot_date, somma tutti i DEPOSIT con operation_date <= snapshot_date.
 * Questo permette di tracciare una linea "capitale versato" nel grafico storico.
 * 
 * @returns {Array<{snapshot_date: string, cumulative_deposits: number}>}
 */
export function getDepositHistory() {
  // Le date sono già in formato ISO (YYYY-MM-DD) in entrambe le tabelle,
  // quindi il confronto diretto è cronologicamente corretto.
  return db
    .prepare(`
      SELECT
        d.snapshot_date,
        COALESCE(SUM(c.euro_amount), 0) AS cumulative_deposits
      FROM daily_portfolio_snapshots d
      LEFT JOIN cash_movements c
        ON c.movement_type = 'DEPOSIT'
        AND c.operation_date <= d.snapshot_date
      GROUP BY d.snapshot_date
      ORDER BY d.snapshot_date ASC
    `)
    .all();
}

/**
 * Ottiene la serie storica completa degli snapshot di portafoglio.
 * @returns {Array} Snapshot ordinati per data crescente
 */
export function getSnapshotHistory() {
  return db
    .prepare('SELECT * FROM daily_portfolio_snapshots ORDER BY snapshot_date ASC')
    .all();
}

/**
 * Helper: verifica se un asset è un BTP (quotato in percentuale, quantità / 100).
 * @param {string} name - Nome dell'asset
 * @param {string} ticker - Ticker dell'asset
 * @returns {boolean} true se è un BTP
 */
const isBtpAsset = (name, ticker) =>
  name.toLowerCase().includes('btp') || ticker.toLowerCase().includes('btp');

/**
 * Recupera il dettaglio completo di un singolo asset per la pagina AssetDetail.
 *
 * Include:
 * - Info anagrafiche dell'asset (nome, ISIN, ticker, tipo, valuta)
 * - Posizione corrente (quantità netta, prezzo corrente, prezzo medio, P&L)
 * - Percentuali di allocazione (rispetto al portafoglio totale e all'asset type)
 * - Cronologia ordini BUY/SELL
 * - Storico dividendi incassati
 *
 * @param {string} assetId - ID interno dell'asset (UUID)
 * @returns {Object|null} Dettaglio completo o null se l'asset non esiste
 */
export function getAssetDetail(assetId) {
  // 1. Info anagrafiche dell'asset
  const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(assetId);
  if (!asset) return null;

  // 2. Posizione corrente: quantità netta (BUY - SELL) + ultimo prezzo da P_TOTALE
  const position = db
    .prepare(`
      SELECT
        SUM(CASE WHEN mo.type = 'BUY' THEN mo.quantity ELSE -mo.quantity END) AS quantity,
        ap.current_price,
        ap.average_price,
        ap.extraction_date AS price_date
      FROM market_orders mo
      LEFT JOIN (
        SELECT asset_id, current_price, average_price, extraction_date
        FROM asset_prices
        WHERE (asset_id, extraction_date) IN (
          SELECT asset_id, MAX(extraction_date)
          FROM asset_prices
          GROUP BY asset_id
        )
      ) ap ON ap.asset_id = mo.asset_id
      WHERE mo.asset_id = ?
      GROUP BY mo.asset_id, ap.current_price, ap.average_price, ap.extraction_date
    `)
    .get(assetId);

  // 3. Cronologia ordini BUY/SELL (ordinata per data decrescente)
  const orders = db
    .prepare(`
      SELECT operation_date, value_date, type, quantity, euro_amount, currency, order_reference
      FROM market_orders
      WHERE asset_id = ?
      ORDER BY operation_date DESC
    `)
    .all(assetId);

  // 4. Storico dividendi incassati (ordinato per data decrescente)
  const dividends = db
    .prepare(`
      SELECT operation_date, euro_amount, currency
      FROM cash_movements
      WHERE asset_id = ? AND movement_type = 'DIVIDEND'
      ORDER BY operation_date DESC
    `)
    .all(assetId);

  // 4b. Storico cedole incassate (per BOND, mappate come INTEREST)
  const coupons = db
    .prepare(`
      SELECT operation_date, euro_amount, currency
      FROM cash_movements
      WHERE asset_id = ? AND movement_type = 'INTEREST'
      ORDER BY operation_date DESC
    `)
    .all(assetId);

  // 5. Calcoli posizione con correzione BTP (quantità / 100)
  const rawQuantity = position ? position.quantity : 0;
  const displayQuantity = isBtpAsset(asset.name, asset.ticker) ? rawQuantity / 100 : rawQuantity;
  const currentPrice = position ? position.current_price : null;
  const averagePrice = position ? position.average_price : null;

  const bookValue = averagePrice !== null ? displayQuantity * averagePrice : null;
  const currentValue = currentPrice !== null ? displayQuantity * currentPrice : null;
  const pnl = bookValue !== null && currentValue !== null ? currentValue - bookValue : null;
  const pnlPercent =
    averagePrice !== null && averagePrice > 0 && currentPrice !== null
      ? ((currentPrice - averagePrice) / averagePrice) * 100
      : null;

  // 6. Percentuali di allocazione: rispetto al portafoglio totale e all'asset type
  // Ricalcola i totali dalle posizioni attive (stessa logica di calculateAllocation)
  const allPositions = calculatePositions();
  let totalPortfolio = 0;
  let totalType = 0;
  for (const p of allPositions) {
    if (p.current_price === null) continue;
    const qty = isBtpAsset(p.name, p.ticker) ? p.quantity / 100 : p.quantity;
    const value = qty * p.current_price;
    totalPortfolio += value;
    if (p.asset_type === asset.asset_type) totalType += value;
  }

  const allocationPercent =
    currentValue !== null && totalPortfolio > 0
      ? (currentValue / totalPortfolio) * 100
      : null;
  const allocationTypePercent =
    currentValue !== null && totalType > 0
      ? (currentValue / totalType) * 100
      : null;

  return {
    asset: {
      id: asset.id,
      isin: asset.isin,
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.asset_type,
      currency: asset.currency
    },
    position: {
      quantity: displayQuantity,
      currentPrice,
      priceDate: position ? position.price_date : null,
      averagePrice,
      bookValue,
      currentValue,
      pnl,
      pnlPercent,
      allocationPercent,
      allocationTypePercent
    },
    orders: orders.map(o => ({
      date: o.operation_date,
      valueDate: o.value_date,
      type: o.type,
      quantity: o.quantity,
      // Prezzo unitario implicito: importo totale / quantità (valore assoluto)
      price: o.euro_amount !== 0 ? Math.abs(o.euro_amount / o.quantity) : null,
      amount: o.euro_amount,
      currency: o.currency,
      reference: o.order_reference
    })),
    dividends: dividends.map(d => ({
      date: d.operation_date,
      amount: d.euro_amount,
      currency: d.currency
    })),
    coupons: coupons.map(c => ({
      date: c.operation_date,
      amount: c.euro_amount,
      currency: c.currency
    }))
  };
}

/**
 * Calcola il Time-Weighted Rate of Return (TWR) del portafoglio.
 * 
 * Metodo:
 * 1. Recupera tutti gli snapshot giornalieri ordinati per data
 * 2. Recupera tutti i depositi (flussi di cassa esterni)
 * 3. Identifica i sottoperiodi delimitati dai depositi
 * 4. Per ogni sottoperiodo calcola il rendimento: (V_end - V_start) / V_start
 * 5. Compatta geometricamente: TWR = ∏(1 + r_i) - 1
 * 
 * I depositi sono l'unico flusso di cassa esterno considerato (nessun WITHDRAWAL).
 * 
 * @returns {Object} TWR totale, YTD, annuali e serie storica
 */
export function calculateTWR() {
  // Recupera tutti gli snapshot ordinati per data
  const snapshots = db
    .prepare('SELECT snapshot_date, portfolio_value FROM daily_portfolio_snapshots ORDER BY snapshot_date ASC')
    .all();

  if (snapshots.length < 2) {
    return {
      twrTotal: 0,
      twrYTD: 0,
      twrAnnual: [],
      twrHistory: []
    };
  }

  // Recupera tutti i depositi ordinati per data.
  // Le date sono già in formato ISO (YYYY-MM-DD), confrontabili con snapshot_date.
  const deposits = db
    .prepare("SELECT operation_date, euro_amount FROM cash_movements WHERE movement_type = 'DEPOSIT' ORDER BY operation_date ASC")
    .all()
    .map(d => ({
      date: d.operation_date,
      amount: d.euro_amount
    }));

  // Costruisce la mappa dei depositi per data (somma se multipli nello stesso giorno)
  const depositMap = {};
  for (const d of deposits) {
    depositMap[d.date] = (depositMap[d.date] || 0) + d.amount;
  }

  // Calcola il TWR per sottoperiodi delimitati dai depositi
  // Un sottoperiodo inizia dopo un deposito e termina al deposito successivo (o alla fine)
  let twrHistory = [];
  let cumulativeTWR = 1; // Fattore moltiplicativo cumulato
  let subperiodStartValue = snapshots[0].portfolio_value;
  let subperiodStartDate = snapshots[0].snapshot_date;

  // Il primo snapshot ha TWR = 0 (punto di partenza)
  twrHistory.push({
    snapshot_date: subperiodStartDate,
    twr: 0
  });

  for (let i = 1; i < snapshots.length; i++) {
    const current = snapshots[i];
    const currentDate = current.snapshot_date;
    const currentValue = current.portfolio_value;

    // Verifica se in questa data c'è un deposito
    const depositAmount = depositMap[currentDate] || 0;

    if (depositAmount > 0) {
      // C'è un deposito: chiude il sottoperiodo corrente
      // Il valore finale del sottoperiodo è il valore prima del deposito
      // Il rendimento del sottoperiodo: (V_end - V_start) / V_start
      const subperiodReturn = (currentValue - depositAmount - subperiodStartValue) / subperiodStartValue;
      cumulativeTWR *= (1 + subperiodReturn);

      // Il nuovo sottoperiodo inizia dopo il deposito
      subperiodStartValue = currentValue;
      subperiodStartDate = currentDate;
    }

    // Calcola il TWR cumulato fino a questa data
    // Se siamo in un sottoperiodo aperto, calcola il rendimento parziale
    const partialReturn = subperiodStartValue > 0
      ? (currentValue - subperiodStartValue) / subperiodStartValue
      : 0;
    const twrUpToDate = cumulativeTWR * (1 + partialReturn) - 1;

    twrHistory.push({
      snapshot_date: currentDate,
      twr: parseFloat(twrUpToDate.toFixed(6))
    });
  }

  // TWR totale = ultimo valore della serie storica
  const twrTotal = twrHistory.length > 0 ? twrHistory[twrHistory.length - 1].twr : 0;

  // Calcola TWR YTD (da inizio anno a oggi)
  const currentYear = snapshots[snapshots.length - 1].snapshot_date.substr(0, 4);
  const yearStart = currentYear + '-01-01';
  const yearStartSnapshot = twrHistory.find(s => s.snapshot_date >= yearStart);
  const lastSnapshot = twrHistory[twrHistory.length - 1];
  const twrYTD = yearStartSnapshot && lastSnapshot
    ? parseFloat(((1 + lastSnapshot.twr) / (1 + yearStartSnapshot.twr) - 1).toFixed(6))
    : 0;

  // Calcola TWR per anno solare
  const twrAnnual = [];
  const years = [...new Set(snapshots.map(s => s.snapshot_date.substr(0, 4)))].sort();
  for (const year of years) {
    const yearSnapshots = twrHistory.filter(s => s.snapshot_date.startsWith(year));
    if (yearSnapshots.length > 0) {
      const firstOfYear = yearSnapshots[0];
      const lastOfYear = yearSnapshots[yearSnapshots.length - 1];
      const twrYear = firstOfYear.twr !== 0
        ? parseFloat(((1 + lastOfYear.twr) / (1 + firstOfYear.twr) - 1).toFixed(6))
        : lastOfYear.twr;
      twrAnnual.push({ year: parseInt(year), twr: twrYear });
    }
  }

  return {
    twrTotal: parseFloat(twrTotal.toFixed(4)),
    twrYTD: parseFloat(twrYTD.toFixed(4)),
    twrAnnual,
    twrHistory
  };
}