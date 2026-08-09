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